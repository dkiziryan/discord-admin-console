import type { Application } from "express";

import { ScanCancelledError } from "../../services/errors";
import { collectInactiveExcludedCategories } from "../../services/guildSettings";
import {
  mapInactiveResultToResponse,
  scanInactiveMembers,
} from "../../services/inactivity/inactiveScanner";
import {
  completeJob,
  createRunningJob,
  failJob,
  registerCsvArtifact,
} from "../../services/jobs/jobService";
import { createScanCancellationController } from "../../utils/cancellationController";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerInactiveScanRoute = (
  app: Application,
  {
    client,
    formatElapsedDuration,
    getInactiveStatus,
    inactiveCancellationByGuild,
    isInactiveProcessingByGuild,
    parseMaxMessagesPerChannel,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
    updateInactiveStatus,
    waitForProcessingToStop,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/inactive-scan", async (req, res) => {
    const activeGuildId = requireSelectedGuildId(req, res);
    if (!activeGuildId) {
      return;
    }

    if (!client.isReady()) {
      res.status(503).json({
        message: "Discord client is not ready yet. Try again shortly.",
      });
      return;
    }

    const requestedDays =
      typeof req.body?.days === "number" && Number.isFinite(req.body.days)
        ? Math.max(1, req.body.days)
        : 30;
    const countReactionsAsActivity =
      req.body?.countReactionsAsActivity === undefined
        ? true
        : Boolean(req.body.countReactionsAsActivity);
    const maxMessagesPerChannel = parseMaxMessagesPerChannel(
      req.body?.maxMessagesPerChannel,
    );
    const discordUserId = requireAuthenticatedDiscordUserId(req, res);
    if (!discordUserId) {
      return;
    }

    if (isInactiveProcessingByGuild.get(activeGuildId)) {
      const inactiveStatus = getInactiveStatus(activeGuildId);
      if (inactiveStatus.inProgress) {
        inactiveCancellationByGuild.get(activeGuildId)?.cancel();
        updateInactiveStatus(activeGuildId, {
          lastMessage: "Cancelling current inactive scan before starting a new one…",
          errorMessage: null,
        });
        const stopped = await waitForProcessingToStop(
          isInactiveProcessingByGuild,
          activeGuildId,
        );
        if (!stopped) {
          res.status(409).json({
            message:
              "The previous inactive scan is still cancelling. Try again shortly.",
          });
          return;
        }
      } else {
        isInactiveProcessingByGuild.set(activeGuildId, false);
        inactiveCancellationByGuild.delete(activeGuildId);
      }
    }

    let requestCategories: string[] = [];
    if (Array.isArray(req.body?.excludedCategories)) {
      requestCategories = req.body.excludedCategories
        .map((value: unknown) =>
          typeof value === "string" ? value.trim() : "",
        )
        .filter((value: string) => value.length > 0);
    } else if (typeof req.body?.excludedCategories === "string") {
      requestCategories = req.body.excludedCategories
        .split(",")
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0);
    }

    const excludedCategories = await collectInactiveExcludedCategories(
      activeGuildId,
      requestCategories,
    );

    let jobId: string;
    try {
      jobId = await createRunningJob({
        discordUserId,
        inputJson: {
          days: requestedDays,
          excludedCategories,
          countReactionsAsActivity,
          ...(maxMessagesPerChannel ? { maxMessagesPerChannel } : {}),
          guildId: activeGuildId,
        },
        type: "inactive_scan",
      });
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
      return;
    }

    updateInactiveStatus(activeGuildId, {
      inProgress: true,
      currentChannel: null,
      currentIndex: 0,
      totalChannels: 0,
      processedChannels: 0,
      totalMessages: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastMessage: "Preparing inactive scan…",
      errorMessage: null,
      result: null,
    });

    isInactiveProcessingByGuild.set(activeGuildId, true);
    const inactiveController = createScanCancellationController();
    inactiveCancellationByGuild.set(activeGuildId, inactiveController);
    res.status(202).json({ message: "Inactive scan started." });

    void (async () => {
      const scanStartedAtMs = Date.now();
      const markInactiveScanIdle = () => {
        isInactiveProcessingByGuild.set(activeGuildId, false);
        inactiveCancellationByGuild.delete(activeGuildId);
      };

      try {
        const result = await scanInactiveMembers(client, {
          guildId: activeGuildId,
          discordUserId,
          days: requestedDays,
          excludedCategories,
          countReactionsAsActivity,
          maxMessagesPerChannel,
          isCancelled: inactiveController.isCancelled,
          progressCallbacks: {
            onChannelStart(channelName, index, total) {
              updateInactiveStatus(activeGuildId, {
                currentChannel: channelName,
                currentIndex: index,
                totalChannels: total,
                processedChannels: Math.max(index - 1, 0),
                lastMessage: `Scanning ${channelName}`,
              });
            },
            onChannelComplete(_channelName, index, total) {
              updateInactiveStatus(activeGuildId, {
                processedChannels: Math.min(index, total),
              });
            },
            onMessageProgress(totalMessages) {
              updateInactiveStatus(activeGuildId, { totalMessages });
            },
          },
        });
        const responseData = mapInactiveResultToResponse(result);
        const elapsedDuration = formatElapsedDuration(scanStartedAtMs, Date.now());
        const message = `Inactive scan complete in ${elapsedDuration}. Found ${result.inactiveMembers.length} inactive users.`;
        const response = { message, data: responseData };

        markInactiveScanIdle();
        updateInactiveStatus(activeGuildId, {
          inProgress: false,
          currentChannel: null,
          currentIndex: 0,
          processedChannels: result.processedChannels.length,
          totalChannels:
            result.processedChannels.length + result.skippedChannels.length,
          totalMessages: result.totalMessagesScanned,
          finishedAt: new Date().toISOString(),
          lastMessage: message,
          errorMessage: null,
          result: response,
        });
        await registerCsvArtifact({ csvPath: result.csvPath, jobId }).catch(
          (artifactError) => {
            console.error(
              `Failed to persist inactive scan CSV artifact for job ${jobId}: ${(artifactError as Error).message}`,
            );
          },
        );
        await completeJob(jobId, {
          resultJson: { data: responseData, message },
        }).catch((jobError) => {
          console.error(
            `Failed to persist completed inactive scan job ${jobId}: ${(jobError as Error).message}`,
          );
        });
      } catch (error) {
        if (error instanceof ScanCancelledError) {
          const inactiveStatus = getInactiveStatus(activeGuildId);
          await failJob(jobId, {
            errorMessage: error.message,
            status: "cancelled",
          }).catch((jobError) => {
            console.error(
              `Failed to persist cancelled inactive scan job ${jobId}: ${(jobError as Error).message}`,
            );
          });
          markInactiveScanIdle();
          updateInactiveStatus(activeGuildId, {
            inProgress: false,
            currentChannel: null,
            currentIndex: 0,
            processedChannels: inactiveStatus.processedChannels,
            totalChannels: inactiveStatus.totalChannels,
            totalMessages: inactiveStatus.totalMessages,
            finishedAt: new Date().toISOString(),
            lastMessage: "Inactive scan cancelled by user.",
            errorMessage: null,
            result: null,
          });
        } else {
          const errorMessage = (error as Error).message;
          await failJob(jobId, {
            errorMessage,
            status: "failed",
          }).catch((jobError) => {
            console.error(
              `Failed to persist failed inactive scan job ${jobId}: ${(jobError as Error).message}`,
            );
          });
          markInactiveScanIdle();
          updateInactiveStatus(activeGuildId, {
            inProgress: false,
            currentChannel: null,
            currentIndex: 0,
            processedChannels: 0,
            totalChannels: 0,
            totalMessages: 0,
            finishedAt: new Date().toISOString(),
            lastMessage: "Inactive scan failed.",
            errorMessage,
            result: null,
          });
        }
      } finally {
        markInactiveScanIdle();
      }
    })();
  });
};

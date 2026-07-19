import type { Application } from "express";

import type { ScanZeroMessagesOptions } from "../../models/types";
import { parseChannelNames } from "../../services/channel/channelInput";
import { ScanCancelledError } from "../../services/errors";
import {
  collectInactiveExcludedCategories,
  readGuildSettings,
} from "../../services/guildSettings";
import {
  completeJob,
  createRunningJob,
  failJob,
  registerCsvArtifact,
} from "../../services/jobs/jobService";
import {
  mapResultToResponse,
  scanZeroMessageUsers,
} from "../../services/message/zeroMessageScanner";
import { createScanCancellationController } from "../../utils/cancellationController";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerZeroMessageRoute = (
  app: Application,
  {
    activeCancellationByGuild,
    client,
    getScanStatus,
    isProcessingByGuild,
    parseMaxMessagesPerChannel,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
    updateScanStatus,
    waitForProcessingToStop,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/zero-messages", async (req, res) => {
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

    const requestChannels = parseChannelNames(req.body?.channelNames);
    const requestExcludedCategories = parseChannelNames(
      req.body?.excludedCategories,
    );
    const dryRun = Boolean(req.body?.dryRun);
    const countReactionsAsActivity = Boolean(req.body?.countReactionsAsActivity);
    const includeArchivedThreads = Boolean(req.body?.includeArchivedThreads);
    const maxMessagesPerChannel = parseMaxMessagesPerChannel(
      req.body?.maxMessagesPerChannel,
    );
    const discordUserId = requireAuthenticatedDiscordUserId(req, res);
    if (!discordUserId) {
      return;
    }

    if (isProcessingByGuild.get(activeGuildId)) {
      const scanStatus = getScanStatus(activeGuildId);
      if (scanStatus.inProgress) {
        activeCancellationByGuild.get(activeGuildId)?.cancel();
        updateScanStatus(activeGuildId, {
          lastMessage: "Cancelling current scan before starting a new one…",
          errorMessage: null,
        });
        const stopped = await waitForProcessingToStop(
          isProcessingByGuild,
          activeGuildId,
        );
        if (!stopped) {
          res.status(409).json({
            message: "The previous scan is still cancelling. Try again shortly.",
          });
          return;
        }
      } else {
        isProcessingByGuild.set(activeGuildId, false);
        activeCancellationByGuild.delete(activeGuildId);
      }
    }

    const scanMode = maxMessagesPerChannel === undefined ? "exact" : "fast";
    const startedAt = new Date().toISOString();

    isProcessingByGuild.set(activeGuildId, true);
    updateScanStatus(activeGuildId, {
      inProgress: true,
      currentChannel: null,
      currentIndex: 0,
      totalChannels: 0,
      processedChannels: 0,
      processedMembers: 0,
      totalMembers: 0,
      startedAt,
      finishedAt: null,
      lastMessage: "Preparing scan…",
      errorMessage: null,
      result: null,
    });

    let targetChannelNames: string[];
    let excludedCategories: string[];
    try {
      const guildSettings = await readGuildSettings(activeGuildId);
      targetChannelNames = resolveZeroMessageTargetChannels(
        requestChannels,
        guildSettings.defaultTargetChannels,
      );
      excludedCategories = Array.from(
        new Set(
          (
            await collectInactiveExcludedCategories(
              activeGuildId,
              requestExcludedCategories,
            )
          )
            .map((category) => category.trim())
            .filter((category) => category.length > 0),
        ),
      );
    } catch (error) {
      const errorMessage = (error as Error).message;
      updateScanStatus(activeGuildId, {
        inProgress: false,
        finishedAt: new Date().toISOString(),
        errorMessage,
        lastMessage: "Scan failed.",
        result: null,
      });
      isProcessingByGuild.set(activeGuildId, false);
      res.status(500).json({ message: errorMessage });
      return;
    }

    let jobId: string;
    try {
      jobId = await createRunningJob({
        discordUserId,
        inputJson: {
          dryRun,
          countReactionsAsActivity,
          includeArchivedThreads,
          ...(maxMessagesPerChannel ? { maxMessagesPerChannel } : {}),
          excludedCategories,
          guildId: activeGuildId,
          scanMode,
          targetChannelNames,
        },
        type: "zero_scan",
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      updateScanStatus(activeGuildId, {
        inProgress: false,
        finishedAt: new Date().toISOString(),
        errorMessage,
        lastMessage: "Scan failed.",
        result: null,
      });
      isProcessingByGuild.set(activeGuildId, false);
      res.status(500).json({ message: errorMessage });
      return;
    }

    const totalChannels = targetChannelNames.length;
    updateScanStatus(activeGuildId, {
      inProgress: true,
      currentChannel: null,
      currentIndex: 0,
      totalChannels,
      processedChannels: 0,
      processedMembers: 0,
      totalMembers: 0,
      startedAt,
      finishedAt: null,
      lastMessage: "Preparing scan…",
      errorMessage: null,
      result: null,
    });

    const cancellationController = createScanCancellationController();
    activeCancellationByGuild.set(activeGuildId, cancellationController);
    res.status(202).json({
      message: "Scan started.",
      channels: targetChannelNames,
    });

    void (async () => {
      const scanStatus = getScanStatus(activeGuildId);
      const scanOptions: ScanZeroMessagesOptions = {
        guildId: activeGuildId,
        discordUserId,
        targetChannelNames,
        excludedCategories,
        dryRun,
        countReactionsAsActivity,
        includeArchivedThreads,
        maxMessagesPerChannel,
        isCancelled: cancellationController.isCancelled,
        progressCallbacks: {
          onChannelsResolved(total) {
            updateScanStatus(activeGuildId, {
              totalChannels: total,
              lastMessage: `Preparing to scan ${total} channel(s)…`,
            });
          },
          onChannelStart(channelName, index, total) {
            updateScanStatus(activeGuildId, {
              inProgress: true,
              currentChannel: channelName,
              currentIndex: index,
              totalChannels: total,
              processedChannels: Math.max(index - 1, 0),
              processedMembers: scanStatus.processedMembers,
              lastMessage: `Scanning #${channelName}`,
            });
          },
          onChannelComplete(_channelName, index, total) {
            updateScanStatus(activeGuildId, {
              processedChannels: Math.min(index, total),
            });
          },
          onMemberProgress(processedMembers, totalMembers) {
            updateScanStatus(activeGuildId, {
              processedMembers,
              totalMembers,
            });
          },
        },
      };

      try {
        const result = await scanZeroMessageUsers(client, scanOptions);
        const responseData = mapResultToResponse(result);
        const response = {
          message: dryRun
            ? "Dry run complete. Empty CSV generated."
            : `Scan complete. Found ${result.zeroMessageUsers.length} users with zero messages.`,
          channels:
            targetChannelNames.length > 0
              ? targetChannelNames
              : responseData.processedChannels,
          data: responseData,
        };
        await registerCsvArtifact({ csvPath: result.csvPath, jobId });
        await completeJob(jobId, {
          resultJson: {
            channels: response.channels,
            data: responseData,
            message: response.message,
          },
        });
        updateScanStatus(activeGuildId, {
          inProgress: false,
          currentChannel: null,
          currentIndex: 0,
          processedChannels: scanStatus.totalChannels,
          processedMembers: scanStatus.totalMembers,
          finishedAt: new Date().toISOString(),
          lastMessage: `Scan complete. Found ${result.zeroMessageUsers.length} users.`,
          errorMessage: null,
          result: response,
        });
      } catch (error) {
        if (error instanceof ScanCancelledError) {
          const scanStatus = getScanStatus(activeGuildId);
          updateScanStatus(activeGuildId, {
            inProgress: false,
            currentChannel: null,
            currentIndex: 0,
            processedChannels: scanStatus.processedChannels,
            finishedAt: new Date().toISOString(),
            lastMessage: "Scan cancelled by user.",
            errorMessage: null,
            result: null,
          });
          await failJob(jobId, {
            errorMessage: error.message,
            status: "cancelled",
          }).catch((jobError) => {
            console.error(
              `Failed to persist cancelled zero-message job ${jobId}: ${(jobError as Error).message}`,
            );
          });
          return;
        }

        const errorMessage = (error as Error).message;
        updateScanStatus(activeGuildId, {
          inProgress: false,
          currentChannel: null,
          currentIndex: 0,
          processedChannels: 0,
          totalChannels: 0,
          processedMembers: 0,
          totalMembers: 0,
          finishedAt: new Date().toISOString(),
          errorMessage,
          lastMessage: "Scan failed.",
          result: null,
        });
        await failJob(jobId, {
          errorMessage,
          status: "failed",
        }).catch((jobError) => {
          console.error(
            `Failed to persist failed zero-message job ${jobId}: ${(jobError as Error).message}`,
          );
        });
      } finally {
        isProcessingByGuild.set(activeGuildId, false);
        activeCancellationByGuild.delete(activeGuildId);
      }
    })();
  });
};

export const resolveZeroMessageTargetChannels = (
  requestChannels: string[],
  defaultTargetChannels: string[],
): string[] => {
  return requestChannels.length > 0 ? requestChannels : defaultTargetChannels;
};

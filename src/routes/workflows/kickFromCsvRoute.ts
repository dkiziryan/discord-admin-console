import type { Application } from "express";

import type { KickFromCsvResponse } from "../../models/types";
import { kickMembersFromCsv } from "../../services/csv/kickFromCsv";
import { ScanCancelledError } from "../../services/errors";
import { completeJob, createRunningJob, failJob } from "../../services/jobs/jobService";
import { createScanCancellationController } from "../../utils/cancellationController";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerKickFromCsvRoute = (
  app: Application,
  {
    client,
    isKickProcessingByGuild,
    kickCancellationByGuild,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/kick-from-csv", async (req, res) => {
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

    if (isKickProcessingByGuild.get(activeGuildId)) {
      res.status(409).json({ message: "A kick job is already running." });
      return;
    }

    const filenames = Array.isArray(req.body?.filenames)
      ? req.body.filenames.filter(
          (value: unknown) => typeof value === "string" && value.trim() !== "",
        )
      : [];
    const dryRun = Boolean(req.body?.dryRun);
    const discordUserId = requireAuthenticatedDiscordUserId(req, res);
    if (!discordUserId) {
      return;
    }

    if (filenames.length === 0) {
      res.status(400).json({ message: "Provide at least one CSV filename." });
      return;
    }

    let jobId: string;
    try {
      jobId = await createRunningJob({
        discordUserId,
        inputJson: {
          dryRun,
          filenames,
          guildId: activeGuildId,
        },
        type: "kick_csv",
      });
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
      return;
    }

    isKickProcessingByGuild.set(activeGuildId, true);
    const kickController = createScanCancellationController();
    kickCancellationByGuild.set(activeGuildId, kickController);
    try {
      const results = await kickMembersFromCsv(client, activeGuildId, {
        filenames,
        dryRun,
        discordUserId,
        isCancelled: kickController.isCancelled,
      });
      const response: KickFromCsvResponse = {
        message: dryRun
          ? `Dry run complete. ${results.length} file(s) processed.`
          : `Kick job finished for ${results.length} file(s).`,
        results,
      };
      await completeJob(jobId, {
        resultJson: {
          message: response.message,
          results,
        },
      }).catch((jobError) => {
        console.error(
          `Failed to persist completed kick job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.json(response);
    } catch (error) {
      if (error instanceof ScanCancelledError) {
        await failJob(jobId, {
          errorMessage: error.message,
          status: "cancelled",
        }).catch((jobError) => {
          console.error(
            `Failed to persist cancelled kick job ${jobId}: ${(jobError as Error).message}`,
          );
        });
        res.status(499).json({ message: error.message });
      } else {
        const errorMessage = (error as Error).message;
        await failJob(jobId, {
          errorMessage,
          status: "failed",
        }).catch((jobError) => {
          console.error(
            `Failed to persist failed kick job ${jobId}: ${(jobError as Error).message}`,
          );
        });
        res.status(500).json({ message: errorMessage });
      }
    } finally {
      isKickProcessingByGuild.set(activeGuildId, false);
      kickCancellationByGuild.delete(activeGuildId);
    }
  });
};

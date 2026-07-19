import type { Application } from "express";

import { archiveInactiveChannels } from "../../services/channel/archiveChannels";
import { collectInactiveExcludedCategories } from "../../services/guildSettings";
import { completeJob, createRunningJob, failJob } from "../../services/jobs/jobService";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerChannelArchiveRoute = (
  app: Application,
  {
    client,
    isChannelArchiveProcessingByGuild,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/inactive-channels", async (req, res) => {
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

    if (isChannelArchiveProcessingByGuild.get(activeGuildId)) {
      res.status(409).json({ message: "An archive job is already running." });
      return;
    }

    const days = Number(req.body?.days ?? 90);
    if (!Number.isFinite(days) || days <= 0) {
      res.status(400).json({ message: "Provide a positive number of days." });
      return;
    }

    const dryRun = req.body?.dryRun === false ? false : true;
    const channelIds = Array.isArray(req.body?.channelIds)
      ? req.body.channelIds.filter(
          (value: unknown) =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
    const action = req.body?.action === "delete" ? "delete" : "archive";

    if (!dryRun && channelIds.length === 0) {
      res
        .status(400)
        .json({ message: "Select at least one channel to process." });
      return;
    }

    const discordUserId = requireAuthenticatedDiscordUserId(req, res);
    if (!discordUserId) {
      return;
    }

    let jobId: string;
    try {
      jobId = await createRunningJob({
        discordUserId,
        inputJson: {
          action,
          days,
          dryRun,
          guildId: activeGuildId,
          ...(channelIds.length > 0 ? { channelIds } : {}),
        },
        type: "archive_channels",
      });
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
      return;
    }

    isChannelArchiveProcessingByGuild.set(activeGuildId, true);
    try {
      const result = await archiveInactiveChannels(client, {
        guildId: activeGuildId,
        days,
        channelIds: dryRun ? undefined : channelIds,
        dryRun,
        action,
        excludedCategories:
          await collectInactiveExcludedCategories(activeGuildId),
      });
      const message = dryRun
        ? result.inactiveChannels.length > 0
          ? `Found ${result.inactiveChannels.length} inactive channel(s).`
          : "No inactive channels found."
        : action === "archive"
          ? `Archived ${result.processedCount} channel(s).`
          : `Deleted ${result.processedCount} channel(s).`;
      const data = { ...result, days, action };

      await completeJob(jobId, {
        resultJson: { data, message },
      }).catch((jobError) => {
        console.error(
          `Failed to persist completed channel archive job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.json({
        message,
        data,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      await failJob(jobId, {
        errorMessage,
        status: "failed",
      }).catch((jobError) => {
        console.error(
          `Failed to persist failed channel archive job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.status(500).json({ message: errorMessage });
    } finally {
      isChannelArchiveProcessingByGuild.set(activeGuildId, false);
    }
  });
};

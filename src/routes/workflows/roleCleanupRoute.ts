import type { Application } from "express";

import { completeJob, createRunningJob, failJob } from "../../services/jobs/jobService";
import { cleanupEmptyRoles } from "../../services/role/roleCleanup";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerRoleCleanupRoute = (
  app: Application,
  {
    client,
    isRoleCleanupProcessingByGuild,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/cleanup-roles", async (req, res) => {
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

    if (isRoleCleanupProcessingByGuild.get(activeGuildId)) {
      res
        .status(409)
        .json({ message: "A role removal job is already running." });
      return;
    }

    const dryRun = req.body?.dryRun === false ? false : true;
    const discordUserId = requireAuthenticatedDiscordUserId(req, res);
    if (!discordUserId) {
      return;
    }

    let jobId: string;
    try {
      jobId = await createRunningJob({
        discordUserId,
        inputJson: {
          dryRun,
          guildId: activeGuildId,
        },
        type: "cleanup_roles",
      });
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
      return;
    }

    isRoleCleanupProcessingByGuild.set(activeGuildId, true);

    try {
      const result = await cleanupEmptyRoles(client, {
        guildId: activeGuildId,
        dryRun,
      });
      let message = "No empty roles found.";
      if (result.deletableRoleCount > 0) {
        message = dryRun
          ? `Found ${result.deletableRoleCount} empty role(s) ready for deletion.`
          : `Deleted ${result.deletedRoleCount} empty role(s).`;
      }

      await completeJob(jobId, {
        resultJson: { data: result, message },
      }).catch((jobError) => {
        console.error(
          `Failed to persist completed role cleanup job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.json({ message, data: result });
    } catch (error) {
      const errorMessage = (error as Error).message;
      await failJob(jobId, {
        errorMessage,
        status: "failed",
      }).catch((jobError) => {
        console.error(
          `Failed to persist failed role cleanup job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.status(500).json({ message: errorMessage });
    } finally {
      isRoleCleanupProcessingByGuild.set(activeGuildId, false);
    }
  });
};

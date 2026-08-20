import type { Application } from "express";

import { completeJob, createRunningJob, failJob } from "../../services/jobs/jobService";
import {
  MAX_THREAD_BATCH_LIMIT,
  removeThreadsByTag,
} from "../../services/thread/removeThreadsByTag";
import type {
  RemoveThreadsByTagResult,
  ThreadByTagAction,
} from "../../models/types";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

export const registerThreadRemovalRoute = (
  app: Application,
  {
    client,
    isThreadRemovalProcessingByGuild,
    requireAuthenticatedDiscordUserId,
    requireSelectedGuildId,
  }: WorkflowRouteDependencies,
): void => {
  app.post("/api/threads/by-tag", async (req, res) => {
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

    if (isThreadRemovalProcessingByGuild.get(activeGuildId)) {
      res.status(409).json({
        message: "A remove-threads-by-tag job is already running.",
      });
      return;
    }

    const rawTag: unknown = req.body?.tag;
    const tag = typeof rawTag === "string" ? rawTag.trim() : "";
    if (!tag) {
      res.status(400).json({ message: "Provide a thread tag." });
      return;
    }

    const limit = Number(req.body?.limit);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_THREAD_BATCH_LIMIT
    ) {
      res.status(400).json({
        message: `Provide a batch limit between 1 and ${MAX_THREAD_BATCH_LIMIT}.`,
      });
      return;
    }

    const dryRun = req.body?.dryRun === false ? false : true;
    const rawAction: unknown = req.body?.action ?? "archive";
    if (rawAction !== "archive" && rawAction !== "delete") {
      res.status(400).json({
        message: "Unsupported action. Use 'archive' or 'delete'.",
      });
      return;
    }
    const action: ThreadByTagAction = rawAction;

    const rawThreadIds: unknown[] = Array.isArray(req.body?.threadIds)
      ? req.body.threadIds
      : [];
    const threadIds = [
      ...new Set(
        rawThreadIds
          .filter(
            (value: unknown): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          .map((value) => value.trim()),
      ),
    ];

    if (!dryRun && threadIds.length === 0) {
      res.status(400).json({
        message: "Run a preview before processing threads.",
      });
      return;
    }

    if (!dryRun && threadIds.length > limit) {
      res.status(400).json({
        message: "The requested thread batch exceeds the preview limit.",
      });
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
          dryRun,
          guildId: activeGuildId,
          limit,
          tag,
          ...(threadIds.length > 0 ? { threadIds } : {}),
        },
        type: "remove_threads_by_tag",
      });
    } catch (error) {
      res.status(500).json({ message: (error as Error).message });
      return;
    }

    isThreadRemovalProcessingByGuild.set(activeGuildId, true);
    try {
      const result = await removeThreadsByTag(client, {
        action,
        dryRun,
        guildId: activeGuildId,
        limit,
        tag,
        threadIds: dryRun ? undefined : threadIds,
      });
      const message = buildThreadRemovalMessage(result, dryRun);
      const data = { ...result, limit };

      await completeJob(jobId, {
        resultJson: { data, message },
      }).catch((jobError) => {
        console.error(
          `Failed to persist completed thread removal job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.json({ message, data });
    } catch (error) {
      const errorMessage = (error as Error).message;
      await failJob(jobId, {
        errorMessage,
        status: "failed",
      }).catch((jobError) => {
        console.error(
          `Failed to persist failed thread removal job ${jobId}: ${(jobError as Error).message}`,
        );
      });
      res.status(500).json({ message: errorMessage });
    } finally {
      isThreadRemovalProcessingByGuild.set(activeGuildId, false);
    }
  });
};

const buildThreadRemovalMessage = (
  result: RemoveThreadsByTagResult,
  dryRun: boolean,
): string => {
  if (dryRun) {
    if (result.totalMatchingCount === 0) {
      return `No threads tagged “${result.tag}” were found.`;
    }

    const previewCount = result.matchingThreads.length;
    return result.moreCount > 0
      ? `Found ${result.totalMatchingCount} thread(s) tagged “${result.tag}”; ${previewCount} included in this batch.`
      : `Found ${previewCount} thread(s) tagged “${result.tag}”.`;
  }

  const verb = result.action === "archive" ? "Archived" : "Deleted";
  const parts = [
    `${verb} ${result.processedCount} thread(s) tagged “${result.tag}”.`,
  ];
  if (result.alreadyArchivedCount > 0) {
    parts.push(`${result.alreadyArchivedCount} were already archived.`);
  }
  if (result.failures.length > 0) {
    parts.push(`${result.failures.length} failed.`);
  }
  return parts.join(" ");
};

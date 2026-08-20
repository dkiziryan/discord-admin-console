import type { Client, Guild } from "discord.js";

import type {
  RemoveThreadsByTagOptions,
  RemoveThreadsByTagResult,
} from "../../models/types";
import {
  findThreadsByTag,
  isTaggedForumThread,
} from "./threadTagMatching";

export const MAX_THREAD_BATCH_LIMIT = 500;

export const removeThreadsByTag = async (
  client: Client,
  options: RemoveThreadsByTagOptions,
): Promise<RemoveThreadsByTagResult> => {
  const {
    guildId,
    limit,
    threadIds = [],
    dryRun = true,
    action = "archive",
  } = options;
  const tag = options.tag.trim();

  validateOptions({ action, dryRun, limit, tag, threadIds });

  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();

  if (dryRun) {
    const allMatches = await findThreadsByTag(guild, tag);
    const matchingThreads = allMatches.slice(0, limit);

    return {
      tag,
      action,
      matchingThreads,
      totalMatchingCount: allMatches.length,
      moreCount: Math.max(allMatches.length - matchingThreads.length, 0),
      processedCount: 0,
      alreadyArchivedCount: 0,
      failures: [],
    };
  }

  return processThreads(guild, {
    action,
    tag,
    threadIds: [...new Set(threadIds)],
  });
};

const validateOptions = ({
  action,
  dryRun,
  limit,
  tag,
  threadIds,
}: {
  action: string;
  dryRun: boolean;
  limit: number;
  tag: string;
  threadIds: string[];
}): void => {
  if (!tag) {
    throw new Error("Provide a thread tag.");
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_THREAD_BATCH_LIMIT
  ) {
    throw new Error(
      `Provide a batch limit between 1 and ${MAX_THREAD_BATCH_LIMIT}.`,
    );
  }

  if (action !== "archive" && action !== "delete") {
    throw new Error("Unsupported action. Use 'archive' or 'delete'.");
  }

  if (!dryRun && threadIds.length === 0) {
    throw new Error("Run a preview before processing threads.");
  }

  if (!dryRun && new Set(threadIds).size > limit) {
    throw new Error("The requested thread batch exceeds the preview limit.");
  }
};

const processThreads = async (
  guild: Guild,
  options: {
    action: "archive" | "delete";
    tag: string;
    threadIds: string[];
  },
): Promise<RemoveThreadsByTagResult> => {
  const { action, tag, threadIds } = options;
  const failures: string[] = [];
  let processedCount = 0;
  let alreadyArchivedCount = 0;

  for (const threadId of threadIds) {
    try {
      const channel = await guild.channels.fetch(threadId);
      if (!isTaggedForumThread(channel, tag, guild.id)) {
        failures.push(
          `${threadId}: Thread was not found or no longer has the requested tag.`,
        );
        continue;
      }

      if (action === "archive") {
        if (channel.archived) {
          alreadyArchivedCount += 1;
          continue;
        }
        await channel.setArchived(
          true,
          `Server Admin Console: archive threads tagged ${tag}`,
        );
      } else {
        await channel.delete(
          `Server Admin Console: delete threads tagged ${tag}`,
        );
      }
      processedCount += 1;
    } catch (error) {
      failures.push(`${threadId}: ${(error as Error).message}`);
    }
  }

  return {
    tag,
    action,
    matchingThreads: [],
    totalMatchingCount: threadIds.length,
    moreCount: 0,
    processedCount,
    alreadyArchivedCount,
    failures,
  };
};

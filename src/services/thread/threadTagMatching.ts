import {
  ChannelType,
  type AnyThreadChannel,
  type Guild,
  type ThreadOnlyChannel,
} from "discord.js";

import type { ThreadByTagSummary } from "../../models/types";

const ARCHIVED_THREAD_PAGE_LIMIT = 100;

export const findThreadsByTag = async (
  guild: Guild,
  tag: string,
): Promise<ThreadByTagSummary[]> => {
  const normalizedTag = normalizeTag(tag);
  const parents = collectThreadOnlyChannels(guild);
  const tagIdsByParentId = new Map<string, Set<string>>();

  for (const parent of parents) {
    const matchingTagIds = parent.availableTags
      .filter((availableTag) => normalizeTag(availableTag.name) === normalizedTag)
      .map((availableTag) => availableTag.id);

    if (matchingTagIds.length > 0) {
      tagIdsByParentId.set(parent.id, new Set(matchingTagIds));
    }
  }

  if (tagIdsByParentId.size === 0) {
    return [];
  }

  const matches = new Map<string, ThreadByTagSummary>();
  const activeThreads = await guild.channels.fetchActiveThreads();
  activeThreads.threads.forEach((thread) => {
    addMatchingThread(thread, tagIdsByParentId, matches);
  });

  for (const parent of parents) {
    if (!tagIdsByParentId.has(parent.id)) {
      continue;
    }

    const archivedThreads = await fetchAllArchivedThreads(parent);
    archivedThreads.forEach((thread) => {
      addMatchingThread(thread, tagIdsByParentId, matches);
    });
  }

  return [...matches.values()].sort((a, b) => {
    const createdAtComparison =
      resolveCreatedTimestamp(b) - resolveCreatedTimestamp(a);
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    const parentComparison = a.parentChannelName.localeCompare(
      b.parentChannelName,
    );
    return (
      parentComparison || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
  });
};

export const isTaggedForumThread = (
  channel: unknown,
  tag: string,
  guildId: string,
): channel is AnyThreadChannel => {
  const thread = channel as AnyThreadChannel | null;
  if (
    !thread ||
    thread.type !== ChannelType.PublicThread ||
    thread.guildId !== guildId
  ) {
    return false;
  }

  const parent = thread.parent;
  if (!parent || !isThreadOnlyChannel(parent)) {
    return false;
  }

  const normalizedTag = normalizeTag(tag);
  const matchingTagIds = new Set(
    parent.availableTags
      .filter((availableTag) => normalizeTag(availableTag.name) === normalizedTag)
      .map((availableTag) => availableTag.id),
  );

  return thread.appliedTags.some((tagId) => matchingTagIds.has(tagId));
};

const collectThreadOnlyChannels = (guild: Guild): ThreadOnlyChannel[] => {
  const parents: ThreadOnlyChannel[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (isThreadOnlyChannel(channel)) {
      parents.push(channel);
    }
  }
  return parents;
};

const fetchAllArchivedThreads = async (
  parent: ThreadOnlyChannel,
): Promise<AnyThreadChannel[]> => {
  const archivedThreads: AnyThreadChannel[] = [];
  let before: Date | undefined;

  while (true) {
    const page = await parent.threads.fetchArchived({
      type: "public",
      limit: ARCHIVED_THREAD_PAGE_LIMIT,
      ...(before ? { before } : {}),
    });
    const pageThreads = [...page.threads.values()];
    archivedThreads.push(...pageThreads);

    if (!page.hasMore || pageThreads.length === 0) {
      break;
    }

    const oldestArchiveTimestamp = pageThreads.at(-1)?.archiveTimestamp;
    if (
      oldestArchiveTimestamp === null ||
      oldestArchiveTimestamp === undefined ||
      oldestArchiveTimestamp === before?.getTime()
    ) {
      break;
    }
    before = new Date(oldestArchiveTimestamp);
  }

  return archivedThreads;
};

const addMatchingThread = (
  thread: AnyThreadChannel,
  tagIdsByParentId: Map<string, Set<string>>,
  matches: Map<string, ThreadByTagSummary>,
): void => {
  const parentId = thread.parentId;
  if (!parentId) {
    return;
  }

  const matchingTagIds = tagIdsByParentId.get(parentId);
  if (
    !matchingTagIds ||
    !thread.appliedTags.some((tagId) => matchingTagIds.has(tagId))
  ) {
    return;
  }

  const parent = thread.parent;
  if (!parent || !isThreadOnlyChannel(parent)) {
    return;
  }

  matches.set(thread.id, summarizeThread(thread, parent));
};

const summarizeThread = (
  thread: AnyThreadChannel,
  parent: ThreadOnlyChannel,
): ThreadByTagSummary => ({
  id: thread.id,
  name: thread.name,
  parentChannelId: parent.id,
  parentChannelName: parent.name,
  archived: Boolean(thread.archived),
  createdAt:
    thread.createdTimestamp === null
      ? null
      : new Date(thread.createdTimestamp).toISOString(),
});

const resolveCreatedTimestamp = (thread: ThreadByTagSummary): number => {
  if (!thread.createdAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(thread.createdAt);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const isThreadOnlyChannel = (
  channel: unknown,
): channel is ThreadOnlyChannel => {
  const type = (channel as { type?: ChannelType } | null)?.type;
  return type === ChannelType.GuildForum || type === ChannelType.GuildMedia;
};

const normalizeTag = (tag: string): string => tag.trim().toLowerCase();

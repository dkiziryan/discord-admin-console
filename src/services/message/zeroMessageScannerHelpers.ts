import {
  AnyThreadChannel,
  ChannelType,
  Collection,
  GuildTextBasedChannel,
  type Client,
  type Guild,
} from "discord.js";
import type { ChannelScanCoverage, LastActivityType } from "../../models/types";

type ThreadFetchParent = GuildTextBasedChannel & {
  threads: {
    fetchActive?: () => Promise<{ threads: Collection<string, AnyThreadChannel> }>;
    fetchArchived?: (
      options?: Record<string, unknown>,
    ) => Promise<{ threads: Collection<string, AnyThreadChannel>; hasMore?: boolean }>;
  };
};

export const fetchGuild = async (client: Client, guildId: string): Promise<Guild> => {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found.`);
    }
    return guild;
  } catch (error) {
    throw new Error(`Failed to fetch guild ${guildId}: ${(error as Error).message}`);
  }
};

export const buildExcludedCategorySet = (categories: string[]): Set<string> => {
  return new Set(
    categories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
};

const isPublicThread = (channel: unknown): channel is AnyThreadChannel => {
  const kind = (channel as { type?: ChannelType }).type;
  return (
    kind === ChannelType.PublicThread ||
    kind === ChannelType.AnnouncementThread
  );
};

const hasThreadManager = (
  channel: unknown,
): channel is ThreadFetchParent => {
  const kind = (channel as { type?: ChannelType }).type;
  const threadManager = (channel as { threads?: unknown }).threads;
  return Boolean(
    threadManager &&
      (kind === ChannelType.GuildText ||
        kind === ChannelType.GuildAnnouncement ||
        kind === ChannelType.GuildForum),
  );
};

const resolveCategoryName = (
  channel: GuildTextBasedChannel | AnyThreadChannel,
): string | null => {
  const parent = channel.parent;
  if (!parent) {
    return null;
  }

  if (parent.type === ChannelType.GuildCategory) {
    return parent.name;
  }

  return parent.parent?.type === ChannelType.GuildCategory
    ? parent.parent.name
    : null;
};

export const resolveScanTargetLabel = (
  channel: GuildTextBasedChannel | AnyThreadChannel,
): string => {
  if (isPublicThread(channel)) {
    return channel.parent?.name
      ? `thread ${channel.parent.name} / ${channel.name}`
      : `thread ${channel.name}`;
  }

  return channel.name;
};

const fetchArchivedPublicThreads = async (
  channel: ThreadFetchParent,
  onCheckCancelled?: () => void,
): Promise<AnyThreadChannel[]> => {
  const threads: AnyThreadChannel[] = [];
  let before: Date | undefined;

  while (true) {
    onCheckCancelled?.();
    const result = await channel.threads.fetchArchived?.({
      type: "public",
      fetchAll: true,
      ...(before ? { before } : {}),
    });

    if (!result || result.threads.size === 0) {
      break;
    }

    const page = Array.from(result.threads.values()).filter(isPublicThread);
    threads.push(...page);

    if (!result.hasMore || page.length === 0) {
      break;
    }

    const oldestThread = page[page.length - 1];
    const archivedAt =
      oldestThread.archiveTimestamp === null
        ? null
        : new Date(oldestThread.archiveTimestamp);
    if (!archivedAt) {
      break;
    }

    before = archivedAt;
  }

  return threads;
};

export const resolveTargetChannels = async (
  guild: Guild,
  channelNames: string[],
  excludedCategories: Set<string>,
  options: {
    includeArchivedThreads?: boolean;
    onCheckCancelled?: () => void;
  } = {},
): Promise<{
  channels: GuildTextBasedChannel[];
  matchedChannelCount: number;
  skippedChannels: string[];
}> => {
  const { includeArchivedThreads = false, onCheckCancelled } = options;
  const normalizedTargets = new Set(
    channelNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const hasExplicitTargets = normalizedTargets.size > 0;
  const matched: GuildTextBasedChannel[] = [];
  const skippedChannels: string[] = [];
  const seen = new Set<string>();
  let matchedChannelCount = 0;

  const considerChannel = (channel: GuildTextBasedChannel | AnyThreadChannel) => {
    const channelName = channel.name.toLowerCase();
    const parentName = isPublicThread(channel)
      ? channel.parent?.name?.toLowerCase()
      : null;
    if (
      hasExplicitTargets &&
      !normalizedTargets.has(channelName) &&
      (!parentName || !normalizedTargets.has(parentName))
    ) {
      return;
    }

    matchedChannelCount += 1;
    const targetLabel = resolveScanTargetLabel(channel);
    const categoryName = resolveCategoryName(channel);
    if (
      categoryName &&
      excludedCategories.has(categoryName.trim().toLowerCase())
    ) {
      skippedChannels.push(
        `${targetLabel} (excluded category: ${categoryName})`,
      );
      return;
    }

    if (seen.has(channel.id)) {
      return;
    }

    seen.add(channel.id);
    matched.push(channel);
  };

  const addChildThreads = async (channel: unknown) => {
    onCheckCancelled?.();
    if (!hasThreadManager(channel)) {
      return;
    }

    const activeThreads = await channel.threads
      .fetchActive?.()
      .catch(() => null);
    activeThreads?.threads.forEach((thread) => {
      if (isPublicThread(thread)) {
        considerChannel(thread);
      }
    });

    if (includeArchivedThreads) {
      const archivedThreads = await fetchArchivedPublicThreads(
        channel,
        onCheckCancelled,
      ).catch(() => []);
      archivedThreads.forEach(considerChannel);
    }
  };

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);

  for (const channel of guild.channels.cache.values()) {
    onCheckCancelled?.();
    if (channel?.type === ChannelType.GuildText) {
      considerChannel(channel);
    }
    await addChildThreads(channel);
  }

  activeThreads?.threads.forEach((thread) => {
    if (isPublicThread(thread)) {
      considerChannel(thread);
    }
  });

  return { channels: matched, matchedChannelCount, skippedChannels };
};

export const scanChannelHistory = async (
  channel: GuildTextBasedChannel,
  remainingIds: Set<string>,
  options: {
    countReactionsAsActivity?: boolean;
    lastActivityByMemberId?: Map<string, LastActivityType>;
    maxMessagesPerChannel?: number;
    onMemberProgress?: () => void;
    onCheckCancelled?: () => void;
  },
): Promise<ChannelScanCoverage> => {
  const {
    countReactionsAsActivity = false,
    lastActivityByMemberId,
    maxMessagesPerChannel,
    onMemberProgress,
    onCheckCancelled,
  } = options;
  let totalMessages = 0;
  let lastMessageId: string | undefined;
  let newestMessageTimestamp: number | null = null;
  let oldestMessageTimestamp: number | null = null;
  let reachedMessageLimit = false;

  const markReactionUsersAsActive = (
    users: Iterable<{ id: string; bot?: boolean | null }>,
  ) => {
    for (const user of users) {
      if (user.bot || !remainingIds.has(user.id)) {
        continue;
      }

      remainingIds.delete(user.id);
      lastActivityByMemberId?.set(user.id, "reaction");
      onMemberProgress?.();
    }
  };

  while (true) {
    onCheckCancelled?.();
    if (remainingIds.size === 0) {
      break;
    }

    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastMessageId ? { before: lastMessageId } : {}),
    });

    if (batch.size === 0) {
      break;
    }

    const orderedMessages = Array.from(batch.values()).sort(
      (messageA, messageB) => messageA.createdTimestamp - messageB.createdTimestamp,
    );

    for (const message of orderedMessages) {
      onCheckCancelled?.();
      if (
        maxMessagesPerChannel !== undefined &&
        totalMessages >= maxMessagesPerChannel
      ) {
        reachedMessageLimit = true;
        break;
      }

      totalMessages += 1;
      newestMessageTimestamp =
        newestMessageTimestamp === null
          ? message.createdTimestamp
          : Math.max(newestMessageTimestamp, message.createdTimestamp);
      oldestMessageTimestamp =
        oldestMessageTimestamp === null
          ? message.createdTimestamp
          : Math.min(oldestMessageTimestamp, message.createdTimestamp);

      if (!message.author.bot && remainingIds.has(message.author.id)) {
        remainingIds.delete(message.author.id);
        lastActivityByMemberId?.set(message.author.id, "message");
        onMemberProgress?.();
      }

      const reactions = message.reactions?.cache;
      if (countReactionsAsActivity && reactions && remainingIds.size > 0) {
        for (const reaction of reactions.values()) {
          onCheckCancelled?.();
          markReactionUsersAsActive(reaction.users.cache.values());

          if (remainingIds.size === 0) {
            break;
          }

          const reactionCount = reaction.count ?? reaction.users.cache.size;
          if (reaction.users.cache.size >= reactionCount) {
            continue;
          }

          const users = await reaction.users.fetch().catch(() => null);
          if (!users) {
            continue;
          }

          markReactionUsersAsActive(users.values());

          if (remainingIds.size === 0) {
            break;
          }
        }
      }

      if (remainingIds.size === 0) {
        break;
      }
    }

    if (remainingIds.size === 0) {
      break;
    }

    if (
      maxMessagesPerChannel !== undefined &&
      totalMessages >= maxMessagesPerChannel
    ) {
      reachedMessageLimit = true;
      break;
    }

    const oldestMessage = orderedMessages[0];
    lastMessageId = oldestMessage.id;
  }

  return {
    channelName: resolveScanTargetLabel(channel),
    messagesScanned: totalMessages,
    newestMessageAt:
      newestMessageTimestamp === null
        ? null
        : new Date(newestMessageTimestamp).toISOString(),
    oldestMessageAt:
      oldestMessageTimestamp === null
        ? null
        : new Date(oldestMessageTimestamp).toISOString(),
    reachedMessageLimit,
  };
};

export const buildSkippedPreview = (skippedChannels: string[], limit: number): string => {
  if (skippedChannels.length === 0) {
    return "";
  }

  const shown = skippedChannels.slice(0, limit);
  let preview = shown.join(", ");
  if (skippedChannels.length > limit) {
    preview += `, +${skippedChannels.length - limit} more`;
  }
  return preview;
};

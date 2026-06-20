import path from "node:path";

import { Client, DiscordAPIError, GuildMember } from "discord.js";

import { ScanCancelledError } from "../errors";

import { loadIgnoredUserIds } from "../ignoredUsers/ignoredUsers";
import { writeUserCsv } from "../csv/userCsv";
import { formatDiscordName } from "../../utils/discordMemberName";
import { resolveScanChannelConcurrency } from "../../utils/scanConcurrency";

import type {
  ChannelScanCoverage,
  LastActivityType,
  ScanZeroMessagesOptions,
  ScanZeroMessagesResult,
} from "../../models/types";
import {
  buildExcludedCategorySet,
  fetchGuild,
  resolveScanTargetLabel,
  resolveTargetChannels,
  scanChannelHistory,
  buildSkippedPreview,
} from "./zeroMessageScannerHelpers";
export type {
  ScanProgressCallbacks,
  ScanZeroMessagesOptions,
  ScanZeroMessagesResult,
} from "../../models/types";

const SUMMARY_PREVIEW_LIMIT = 10;
const SKIPPED_PREVIEW_LIMIT = 5;
const ZERO_MESSAGE_CSV_PREFIX = "users-with-zero-messages";

const buildCoverageWarning = (
  scanMode: "exact" | "fast",
  channelCoverage: ChannelScanCoverage[],
): string | null => {
  if (scanMode !== "fast") {
    return null;
  }

  const cappedChannels = channelCoverage
    .filter((coverage) => coverage.reachedMessageLimit)
    .map((coverage) => coverage.channelName);

  if (cappedChannels.length === 0) {
    return null;
  }

  return `Fast scan reached the message limit in ${cappedChannels.join(", ")}. Older posts may not have been scanned.`;
};

export const scanZeroMessageUsers = async (
  client: Client,
  options: ScanZeroMessagesOptions,
): Promise<ScanZeroMessagesResult> => {
  const {
    guildId,
    discordUserId,
    targetChannelNames,
    excludedCategories = [],
    dryRun = false,
    countReactionsAsActivity = false,
    maxMessagesPerChannel,
    ignoredUserIds: providedIgnoredUserIds,
    progressCallbacks,
    isCancelled,
  } = options;

  const throwIfCancelled = () => {
    if (isCancelled?.()) {
      throw new ScanCancelledError();
    }
  };

  throwIfCancelled();
  const guild = await fetchGuild(client, guildId);
  const scanMode = maxMessagesPerChannel === undefined ? "exact" : "fast";

  if (dryRun) {
    const csvPath = await writeUserCsv(
      ZERO_MESSAGE_CSV_PREFIX,
      [],
      { guildId, discordUserId },
      ["User ID", "Username", "Last Activity Type"],
      { filenameStyle: "date-version" },
    );
    return {
      guildName: guild.name,
      totalMembersChecked: 0,
      totalMessagesScanned: 0,
      zeroMessageUsers: [],
      lastActivityByMemberId: new Map(),
      skippedChannels: [],
      processedChannels: [],
      csvPath,
      previewNames: [],
      moreCount: 0,
      skippedPreview: "",
      scanMode,
      excludedCategories,
      channelCoverage: [],
      coverageWarning: null,
    };
  }

  await guild.members.fetch();
  throwIfCancelled();
  await guild.channels.fetch();
  throwIfCancelled();

  const ignoredUserIds =
    providedIgnoredUserIds ?? (await loadIgnoredUserIds(guildId));
  const members = guild.members.cache.filter((member) => !member.user.bot);
  const remainingIds = new Set(
    Array.from(members.keys()).filter(
      (memberId) => !ignoredUserIds.has(memberId),
    ),
  );
  const lastActivityByMemberId = new Map<string, LastActivityType>();
  const totalMembers = remainingIds.size;
  const updateMemberProgress = () => {
    progressCallbacks?.onMemberProgress?.(
      totalMembers - remainingIds.size,
      totalMembers,
    );
  };
  updateMemberProgress();

  if (remainingIds.size === 0) {
    const csvPath = await writeUserCsv(
      ZERO_MESSAGE_CSV_PREFIX,
      [],
      { guildId, discordUserId },
      ["User ID", "Username", "Last Activity Type"],
      { filenameStyle: "date-version" },
    );
    return {
      guildName: guild.name,
      totalMembersChecked: 0,
      totalMessagesScanned: 0,
      zeroMessageUsers: [],
      lastActivityByMemberId,
      skippedChannels: [],
      processedChannels: [],
      csvPath,
      previewNames: [],
      moreCount: 0,
      skippedPreview: "",
      scanMode,
      excludedCategories,
      channelCoverage: [],
      coverageWarning: null,
    };
  }

  const {
    channels: matchedTargetChannels,
    matchedChannelCount,
    skippedChannels,
  } = await resolveTargetChannels(
    guild,
    targetChannelNames,
    buildExcludedCategorySet(excludedCategories),
    throwIfCancelled,
  );

  const hasExplicitTargetChannels = targetChannelNames.some(
    (name) => name.trim().length > 0,
  );

  if (matchedChannelCount === 0) {
    throw new Error(
      hasExplicitTargetChannels
        ? "No target channels found with the provided names."
        : "No text channels were found for zero-message scan.",
    );
  }

  const targetChannels = matchedTargetChannels.filter((channel) => {
    const channelLabel = resolveScanTargetLabel(channel);
    const me = guild.members.me;
    const canReadHistory = me
      ? channel.permissionsFor(me)?.has("ReadMessageHistory") &&
        channel.permissionsFor(me)?.has("ViewChannel")
      : true;

    if (!canReadHistory) {
      skippedChannels.push(`${channelLabel} (missing history permission)`);
      return false;
    }

    return true;
  });

  if (targetChannels.length === 0) {
    throw new Error("No eligible channels were found for zero-message scan.");
  }

  const totalChannels = targetChannels.length;
  progressCallbacks?.onChannelsResolved?.(totalChannels);
  let totalMessagesScanned = 0;
  const processedChannels: string[] = [];
  const channelCoverage: ChannelScanCoverage[] = [];
  let nextChannelIndex = 0;
  let completedChannels = 0;

  const scanNextChannel = async () => {
    while (remainingIds.size > 0) {
      throwIfCancelled();
      const index = nextChannelIndex;
      nextChannelIndex += 1;
      if (index >= targetChannels.length) {
        return;
      }

      const channel = targetChannels[index];
      const channelName = channel.name;
      processedChannels.push(channelName);

      progressCallbacks?.onChannelStart?.(
        channelName,
        index + 1,
        totalChannels,
      );

      try {
        const coverage = await scanChannelHistory(channel, remainingIds, {
          countReactionsAsActivity,
          lastActivityByMemberId,
          maxMessagesPerChannel,
          onMemberProgress: updateMemberProgress,
          onCheckCancelled: throwIfCancelled,
        });
        channelCoverage.push(coverage);
        totalMessagesScanned += coverage.messagesScanned;
      } catch (error) {
        if (error instanceof DiscordAPIError) {
          if (error.code === 50013) {
            skippedChannels.push(`${channelName} (forbidden)`);
          } else {
            skippedChannels.push(
              `${channelName} (HTTP error: ${error.message})`,
            );
          }
        } else {
          skippedChannels.push(
            `${channelName} (error: ${(error as Error).message})`,
          );
        }
      } finally {
        completedChannels += 1;
        progressCallbacks?.onChannelComplete?.(
          channelName,
          completedChannels,
          totalChannels,
        );
      }
    }
  };

  const channelConcurrency = Math.min(
    resolveScanChannelConcurrency(),
    targetChannels.length,
  );
  await Promise.all(
    Array.from({ length: channelConcurrency }, () => scanNextChannel()),
  );

  throwIfCancelled();
  const zeroMessageUsers = Array.from(remainingIds)
    .map((memberId) => members.get(memberId))
    .filter((maybeMember): maybeMember is GuildMember => Boolean(maybeMember));

  zeroMessageUsers.sort((a, b) =>
    formatDiscordName(a).localeCompare(formatDiscordName(b)),
  );

  const csvRows = zeroMessageUsers.map((member) => ({
    id: member.id,
    lastActivityType: lastActivityByMemberId.get(member.id) ?? "none",
    username: formatDiscordName(member),
  }));

  throwIfCancelled();
  const csvPath = await writeUserCsv(
    ZERO_MESSAGE_CSV_PREFIX,
    csvRows.map((row) => [row.id, row.username, row.lastActivityType]),
    { guildId, discordUserId },
    ["User ID", "Username", "Last Activity Type"],
    { filenameStyle: "date-version" },
  );

  const previewNames = zeroMessageUsers
    .slice(0, SUMMARY_PREVIEW_LIMIT)
    .map(formatDiscordName);
  const moreCount = Math.max(zeroMessageUsers.length - previewNames.length, 0);

  const skippedPreview = buildSkippedPreview(
    skippedChannels,
    SKIPPED_PREVIEW_LIMIT,
  );
  const coverageWarning = buildCoverageWarning(scanMode, channelCoverage);

  return {
    guildName: guild.name,
    totalMembersChecked: totalMembers,
    totalMessagesScanned,
    zeroMessageUsers,
    lastActivityByMemberId,
    skippedChannels,
    processedChannels,
    csvPath,
    previewNames,
    moreCount,
    skippedPreview,
    scanMode,
    excludedCategories,
    channelCoverage,
    coverageWarning,
  };
};

export const mapResultToResponse = (result: ScanZeroMessagesResult) => {
  return {
    guildName: result.guildName,
    csvPath: path.basename(result.csvPath),
    zeroMessageCount: result.zeroMessageUsers.length,
    totalMembersChecked: result.totalMembersChecked,
    totalMessagesScanned: result.totalMessagesScanned,
    skippedChannels: result.skippedChannels,
    processedChannels: result.processedChannels,
    previewNames: result.previewNames,
    moreCount: result.moreCount,
    skippedPreview: result.skippedPreview,
    scanMode: result.scanMode,
    excludedCategories: result.excludedCategories,
    channelCoverage: result.channelCoverage,
    coverageWarning: result.coverageWarning,
  };
};

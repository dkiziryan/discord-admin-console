import type { GuildMember } from "discord.js";
import type {
  ChannelScanCoverage,
  ZeroMessageScanMode,
} from "../shared/apiTypes";

export type {
  ApiError,
  ArchiveChannelAction,
  ArchiveChannelsRequest,
  ArchiveChannelsResponse,
  ArchivedChannelSummary,
  ArchiveChannelsResult,
  ChannelScanCoverage,
  CleanupRolesRequest,
  CleanupRolesResponse,
  CleanupRolesResult,
  CsvFileListResponse,
  CsvFileMetadata,
  CsvRow,
  CsvRowsResponse,
  DefaultChannelsResponse,
  DefaultInactiveCategoriesResponse,
  GuildWorkflowSettings,
  GuildWorkflowSettingsResponse,
  IgnoredUser,
  IgnoredUsersResponse,
  ImportIgnoredUsersResponse,
  InactiveScanResponse,
  InactiveScanStatus,
  JobHistoryItem,
  JobHistoryResponse,
  KickFromCsvFileResult,
  KickFromCsvRequest,
  KickFromCsvResponse,
  LocalDevSettings,
  RemoveThreadsByTagRequest,
  RemoveThreadsByTagResponse,
  RemoveThreadsByTagResult,
  ScanResponse,
  ScanStatus,
  ScanZeroMessagesResponse,
  ThreadByTagAction,
  ThreadByTagSummary,
  UpdateGuildWorkflowSettingsRequest,
  ZeroMessageScanMode,
  ZeroMessagesRequest,
} from "../shared/apiTypes";

export type ScanProgressCallbacks = {
  onChannelsResolved?(total: number): void;
  onChannelStart?(channelName: string, index: number, total: number): void;
  onChannelComplete?(channelName: string, index: number, total: number): void;
  onMemberProgress?(processedMembers: number, totalMembers: number): void;
  onMessageProgress?(totalMessages: number): void;
};

export type ScanZeroMessagesOptions = {
  guildId: string;
  discordUserId: string;
  targetChannelNames: string[];
  excludedCategories?: string[];
  dryRun?: boolean;
  countReactionsAsActivity?: boolean;
  includeArchivedThreads?: boolean;
  maxMessagesPerChannel?: number;
  ignoredUserIds?: Set<string>;
  isCancelled?: () => boolean;
  progressCallbacks?: ScanProgressCallbacks;
};

export type ScanZeroMessagesResult = {
  guildName: string;
  totalMembersChecked: number;
  totalMessagesScanned: number;
  zeroMessageUsers: GuildMember[];
  lastActivityByMemberId: Map<string, LastActivityType>;
  skippedChannels: string[];
  processedChannels: string[];
  csvPath: string;
  previewNames: string[];
  moreCount: number;
  skippedPreview: string;
  scanMode: ZeroMessageScanMode;
  excludedCategories: string[];
  channelCoverage: ChannelScanCoverage[];
  coverageWarning: string | null;
};

export type StartServerOptions = {
  port: number;
  guildId: string;
};

export type ScanInactiveMembersOptions = {
  guildId: string;
  discordUserId: string;
  days: number;
  excludedCategories?: string[];
  countReactionsAsActivity?: boolean;
  countThreadCreationAsActivity?: boolean;
  maxMessagesPerChannel?: number;
  ignoredUserIds?: Set<string>;
  progressCallbacks?: ScanProgressCallbacks;
  isCancelled?: () => boolean;
};

export type LastActivityType = "none" | "message" | "reaction" | "thread";

export type ScanInactiveMembersResult = {
  guildName: string;
  cutoffIso: string;
  totalMembersChecked: number;
  totalMessagesScanned: number;
  inactiveMembers: GuildMember[];
  lastActivityByMemberId: Map<string, LastActivityType>;
  skippedChannels: string[];
  processedChannels: string[];
  csvPath: string;
  previewNames: string[];
  moreCount: number;
  skippedPreview: string;
};

export type CleanupRolesOptions = {
  guildId: string;
  dryRun?: boolean;
};

export type ArchiveChannelsOptions = {
  guildId: string;
  days: number;
  channelIds?: string[];
  dryRun?: boolean;
  action?: "archive" | "delete";
  excludedCategories?: string[];
};

export type RemoveThreadsByTagOptions = {
  guildId: string;
  tag: string;
  limit: number;
  threadIds?: string[];
  dryRun?: boolean;
  action?: "archive" | "delete";
};

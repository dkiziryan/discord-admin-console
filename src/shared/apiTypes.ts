export type ZeroMessageScanMode = "exact" | "fast";

export type ChannelScanCoverage = {
  channelName: string;
  messagesScanned: number;
  newestMessageAt: string | null;
  oldestMessageAt: string | null;
  reachedMessageLimit: boolean;
};

export type ScanZeroMessagesResponse = {
  message: string;
  channels: string[];
  data: {
    guildName: string;
    csvPath: string;
    zeroMessageCount: number;
    totalMembersChecked: number;
    totalMessagesScanned: number;
    skippedChannels: string[];
    processedChannels: string[];
    previewNames: string[];
    moreCount: number;
    skippedPreview: string;
    scanMode: ZeroMessageScanMode;
    excludedCategories: string[];
    channelCoverage: ChannelScanCoverage[];
    coverageWarning: string | null;
  };
};

export type ScanResponse = ScanZeroMessagesResponse;

export type ZeroMessagesRequest = {
  channelNames?: string[];
  excludedCategories?: string[];
  dryRun?: boolean;
  countReactionsAsActivity?: boolean;
  includeArchivedThreads?: boolean;
  maxMessagesPerChannel?: number;
};

export type ScanStatus = {
  inProgress: boolean;
  currentChannel: string | null;
  currentIndex: number;
  totalChannels: number;
  processedChannels: number;
  processedMembers: number;
  totalMembers: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastMessage: string | null;
  errorMessage: string | null;
  result: ScanZeroMessagesResponse | null;
};

export type ApiError = {
  message: string;
};

export type DefaultChannelsResponse = {
  channels: string[];
};

export type DefaultInactiveCategoriesResponse = {
  categories: string[];
};

export type CsvFileMetadata = {
  filename: string;
  size: number;
  modifiedAt: string;
  rowCount?: number;
  jobId?: string | null;
  jobType?: string | null;
  jobStatus?: string | null;
  jobCreatedAt?: string | null;
  jobFinishedAt?: string | null;
  createdByUsername?: string | null;
};

export type CsvFileListResponse = {
  files: CsvFileMetadata[];
};

export type CsvRow = Record<string, string>;

export type CsvRowsResponse = {
  filename: string;
  columns: string[];
  rows: CsvRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  search: string;
};

export type JobHistoryItem = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  guildId: string | null;
  summary: string;
  errorMessage: string | null;
};

export type JobHistoryResponse = {
  jobs: JobHistoryItem[];
};

export type GuildWorkflowSettings = {
  discordGuildId: string;
  defaultTargetChannels: string[];
  inactiveExcludedCategories: string[];
};

export type GuildWorkflowSettingsResponse = {
  settings: GuildWorkflowSettings;
};

export type UpdateGuildWorkflowSettingsRequest = {
  defaultTargetChannels: string[];
  inactiveExcludedCategories: string[];
};

export type IgnoredUser = {
  id: string;
  discordUserId: string;
  username: string | null;
  createdAt: string;
};

export type IgnoredUsersResponse = {
  users: IgnoredUser[];
  count: number;
};

export type ImportIgnoredUsersResponse = {
  message: string;
  addedCount: number;
  skippedCount: number;
  totalCount: number;
};

export type LocalDevSettings = {
  available: boolean;
  useProductionData: boolean;
};

export type KickFromCsvFileResult = {
  filename: string;
  dryRun: boolean;
  totalRows: number;
  matchedUsers: number;
  attemptedKicks: number;
  successfulKicks: number;
  failures: string[];
};

export type KickFromCsvRequest = {
  filenames: string[];
  dryRun?: boolean;
};

export type KickFromCsvResponse = {
  message: string;
  results: KickFromCsvFileResult[];
};

export type InactiveScanResponse = {
  message: string;
  data: {
    guildName: string;
    csvPath: string;
    cutoffIso: string;
    inactiveCount: number;
    totalMembersChecked: number;
    totalMessagesScanned: number;
    skippedChannels: string[];
    processedChannels: string[];
    previewNames: string[];
    moreCount: number;
    skippedPreview: string;
  };
};

export type InactiveScanStatus = {
  inProgress: boolean;
  currentChannel: string | null;
  currentIndex: number;
  totalChannels: number;
  processedChannels: number;
  totalMessages: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastMessage: string | null;
  errorMessage: string | null;
  result: InactiveScanResponse | null;
};

export type CleanupRolesRequest = {
  dryRun?: boolean;
};

export type CleanupRolesResult = {
  guildName: string;
  totalRoles: number;
  deletableRoleCount: number;
  deletedRoleCount: number;
  previewNames: string[];
  moreCount: number;
  failures: string[];
};

export type CleanupRolesResponse = {
  message: string;
  data: CleanupRolesResult;
};

export type ArchiveChannelAction = "archive" | "delete";

export type ArchiveChannelsRequest = {
  days: number;
  channelIds?: string[];
  dryRun?: boolean;
  action?: ArchiveChannelAction;
};

export type ArchivedChannelSummary = {
  id: string;
  name: string;
  lastMessageAt: string | null;
};

export type ArchiveChannelsResult = {
  inactiveChannels: ArchivedChannelSummary[];
  processedCount: number;
  archiveCategoryId: string | null;
  action: ArchiveChannelAction;
  failures: string[];
};

export type ArchiveChannelsResponse = {
  message: string;
  data: ArchiveChannelsResult & {
    days: number;
  };
};

export type ThreadByTagAction = "archive" | "delete";

export type RemoveThreadsByTagRequest = {
  tag: string;
  limit: number;
  threadIds?: string[];
  dryRun?: boolean;
  action?: ThreadByTagAction;
};

export type ThreadByTagSummary = {
  id: string;
  name: string;
  parentChannelId: string;
  parentChannelName: string;
  archived: boolean;
};

export type RemoveThreadsByTagResult = {
  tag: string;
  action: ThreadByTagAction;
  matchingThreads: ThreadByTagSummary[];
  totalMatchingCount: number;
  moreCount: number;
  processedCount: number;
  alreadyArchivedCount: number;
  failures: string[];
};

export type RemoveThreadsByTagResponse = {
  message: string;
  data: RemoveThreadsByTagResult & {
    limit: number;
  };
};

export type {
  ApiError,
  ArchiveChannelAction,
  ArchiveChannelsRequest,
  ArchiveChannelsResponse,
  ArchivedChannelSummary,
  ChannelScanCoverage,
  CleanupRolesRequest,
  CleanupRolesResponse,
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
  ScanResponse,
  ScanStatus,
  ScanZeroMessagesResponse,
  UpdateGuildWorkflowSettingsRequest,
  ZeroMessageScanMode,
  ZeroMessagesRequest,
} from "../../../src/shared/apiTypes";

import type { ScanResponse } from "../../../src/shared/apiTypes";

export type ResultsPageProps = {
  result: ScanResponse;
  previewLines: string[] | null;
  statusMessage: string | null;
  onRunAnotherScan: () => void;
};

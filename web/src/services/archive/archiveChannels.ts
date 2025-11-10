import type {
  ArchiveChannelsRequest,
  ArchiveChannelsResponse,
} from "../../models/types";
import { apiJson } from "../apiClient";

export const requestArchiveChannels = async (
  payload: ArchiveChannelsRequest,
): Promise<ArchiveChannelsResponse> =>
  apiJson<ArchiveChannelsResponse>("/api/inactive-channels", {
    errorMessage: "Failed to archive channels.",
    method: "POST",
    json: payload,
  });

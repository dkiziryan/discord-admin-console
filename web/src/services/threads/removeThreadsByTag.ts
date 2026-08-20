import type {
  RemoveThreadsByTagRequest,
  RemoveThreadsByTagResponse,
} from "../../models/types";
import { apiJson } from "../apiClient";

export const requestRemoveThreadsByTag = async (
  payload: RemoveThreadsByTagRequest,
): Promise<RemoveThreadsByTagResponse> =>
  apiJson<RemoveThreadsByTagResponse>("/api/threads/by-tag", {
    errorMessage: "Failed to process threads by tag.",
    method: "POST",
    json: payload,
  });

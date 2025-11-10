import type {
  CleanupRolesRequest,
  CleanupRolesResponse,
} from "../../models/types";
import { apiJson } from "../apiClient";

export const requestRoleCleanup = async (
  payload?: CleanupRolesRequest,
): Promise<CleanupRolesResponse> =>
  apiJson<CleanupRolesResponse>("/api/cleanup-roles", {
    errorMessage: "Failed to remove roles.",
    method: "POST",
    json: payload ?? {},
  });

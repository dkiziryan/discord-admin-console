import type { JobHistoryItem, JobHistoryResponse } from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchJobHistory = async (
  limit?: number,
): Promise<JobHistoryItem[]> => {
  const query = typeof limit === "number" ? `?limit=${limit}` : "";
  const payload = await apiJson<JobHistoryResponse>(`/api/job-history${query}`, {
    errorMessage: "Failed to load activity history.",
  });

  return payload.jobs;
};

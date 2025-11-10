import { apiVoid } from "../apiClient";

export const cancelScan = async (): Promise<void> =>
  apiVoid("/api/cancel-scan", {
    errorMessage: "Failed to cancel scan.",
    method: "POST",
  });

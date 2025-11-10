import { apiVoid } from "../apiClient";

export const cancelInactiveScan = async (): Promise<void> =>
  apiVoid("/api/cancel-inactive", {
    errorMessage: "Failed to cancel inactive scan.",
    method: "POST",
  });

import { apiVoid } from "../apiClient";

export const cancelKickJob = async (): Promise<void> =>
  apiVoid("/api/cancel-kick", {
    errorMessage: "Failed to cancel kick job.",
    method: "POST",
  });

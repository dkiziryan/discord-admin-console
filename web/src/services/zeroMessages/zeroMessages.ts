import type { ZeroMessagesRequest } from "../../models/types";
import { apiVoid } from "../apiClient";

export const requestZeroMessageScan = async (
  payload: ZeroMessagesRequest,
): Promise<void> =>
  apiVoid("/api/zero-messages", {
    allowedStatuses: [202],
    errorMessage: "Failed to run scan.",
    method: "POST",
    json: payload,
  });

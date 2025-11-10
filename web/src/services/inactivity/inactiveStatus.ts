import type { InactiveScanStatus } from "../../models/types";
import { tryApiJson } from "../apiClient";

export const fetchInactiveStatus =
  async (): Promise<InactiveScanStatus | null> =>
    tryApiJson<InactiveScanStatus>("/api/inactive-status", {
      errorMessage: "Failed to load inactive scan status.",
    });

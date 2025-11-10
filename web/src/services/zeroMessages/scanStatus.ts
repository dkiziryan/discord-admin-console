import type { ScanStatus } from "../../models/types";
import { tryApiJson } from "../apiClient";

export const fetchScanStatus = async (): Promise<ScanStatus | null> =>
  tryApiJson<ScanStatus>("/api/scan-status", {
    errorMessage: "Failed to load zero-message scan status.",
  });

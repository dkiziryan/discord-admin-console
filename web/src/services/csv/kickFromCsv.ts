import type { KickFromCsvResponse } from "../../models/types";
import { apiJson } from "../apiClient";

export const kickFromCsv = async (payload: {
  filenames: string[];
  dryRun: boolean;
}): Promise<KickFromCsvResponse> =>
  apiJson<KickFromCsvResponse>("/api/kick-from-csv", {
    errorMessage: "Failed to kick from CSV.",
    method: "POST",
    json: payload,
  });

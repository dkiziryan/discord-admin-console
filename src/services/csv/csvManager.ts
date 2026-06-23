import type { CsvFileMetadata } from "../../models/types";
import {
  deleteScopedCsvFile,
  listScopedCsvFiles,
  type CsvOwnerScope,
} from "./csvStorage";

export const listCsvFiles = async (
  scope: CsvOwnerScope,
): Promise<CsvFileMetadata[]> => {
  return listScopedCsvFiles(scope);
};

export const deleteCsvFile = async (
  filename: string,
  scope: CsvOwnerScope,
): Promise<void> => {
  await deleteScopedCsvFile(filename, scope);
};

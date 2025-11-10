import { promises as fs } from "fs";
import path from "path";

import type { CsvFileMetadata } from "../../models/types";
import {
  getScopedCsvDirectory,
  type CsvOwnerScope,
} from "./csvStorage";

export const listCsvFiles = async (
  scope: CsvOwnerScope,
): Promise<CsvFileMetadata[]> => {
  const csvDirectory = getScopedCsvDirectory(scope);
  await fs.mkdir(csvDirectory, { recursive: true });
  const entries = await fs.readdir(csvDirectory, { withFileTypes: true });

  const csvFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".csv"),
  );

  const metadata = await Promise.all(
    csvFiles.map(async (entry) => {
      const filepath = path.join(csvDirectory, entry.name);
      const stats = await fs.stat(filepath);
      const rowCount = await countRows(filepath);
      return {
        filename: entry.name,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        rowCount,
      };
    }),
  );

  metadata.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return metadata;
};

const countRows = async (filepath: string): Promise<number> => {
  const fileContents = await fs.readFile(filepath, "utf8");
  const lines = fileContents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return 0;
  }
  return lines.length - 1;
};

import { promises as fs } from "fs";
import path from "path";

import {
  assertCsvFileWithinLimit,
  getScopedCsvDirectory,
  resolveCsvFilename,
  type CsvOwnerScope,
} from "./csvStorage";

export type CsvRow = Record<string, string>;

export const resolveCsvPath = async (
  filename: string,
  scope: CsvOwnerScope,
): Promise<string> => {
  const csvDirectory = getScopedCsvDirectory(scope);
  await fs.mkdir(csvDirectory, { recursive: true });

  const safeFilename = resolveCsvFilename(filename);
  const resolved = path.resolve(csvDirectory, safeFilename);

  const relative = path.relative(csvDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid CSV filename.");
  }

  try {
    const stats = await fs.stat(resolved);
    assertCsvFileWithinLimit(stats.size);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`CSV file not found: ${filename}`);
    }
    throw error;
  }

  return resolved;
};

export const readCsvRows = async (filepath: string): Promise<CsvRow[]> => {
  const contents = await fs.readFile(filepath, "utf8");
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row: CsvRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });
    rows.push(row);
  }

  return rows;
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
};

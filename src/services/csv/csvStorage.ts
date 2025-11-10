import { promises as fs } from "fs";
import type { Dirent } from "fs";
import path from "path";

const DEFAULT_CSV_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const DEFAULT_CSV_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

export type CsvOwnerScope = {
  guildId: string;
  discordUserId: string;
};

export const getCsvBaseDirectory = (): string => {
  const configuredDirectory = process.env.CSV_DIRECTORY?.trim();
  return configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.resolve(process.cwd(), "csv");
};

export const getCsvFileLimitBytes = (): number => {
  return readPositiveIntegerEnv(
    "CSV_FILE_LIMIT_BYTES",
    DEFAULT_CSV_FILE_LIMIT_BYTES,
  );
};

export const getCsvStorageLimitBytes = (): number => {
  return readPositiveIntegerEnv(
    "CSV_STORAGE_LIMIT_BYTES",
    DEFAULT_CSV_STORAGE_LIMIT_BYTES,
  );
};

export const getScopedCsvDirectory = (scope: CsvOwnerScope): string => {
  return path.join(
    getCsvBaseDirectory(),
    safePathSegment(scope.guildId, "guild ID"),
    safePathSegment(scope.discordUserId, "Discord user ID"),
  );
};

export const ensureCsvStorageCapacity = async (
  bytesToAdd: number,
): Promise<void> => {
  const storageLimitBytes = getCsvStorageLimitBytes();
  const currentSizeBytes = await calculateDirectorySize(getCsvBaseDirectory());

  if (currentSizeBytes + bytesToAdd > storageLimitBytes) {
    throw new Error(
      `CSV storage limit exceeded. Current usage is ${currentSizeBytes} bytes and the limit is ${storageLimitBytes} bytes.`,
    );
  }
};

export const assertCsvFileWithinLimit = (sizeBytes: number): void => {
  const fileLimitBytes = getCsvFileLimitBytes();
  if (sizeBytes > fileLimitBytes) {
    throw new Error(
      `CSV file is ${sizeBytes} bytes and exceeds the ${fileLimitBytes} byte limit.`,
    );
  }
};

export const resolveCsvFilename = (filename: string): string => {
  const trimmed = filename.trim();
  if (
    !trimmed ||
    trimmed.includes("\\") ||
    trimmed !== path.basename(trimmed) ||
    !trimmed.endsWith(".csv")
  ) {
    throw new Error("Invalid CSV filename.");
  }

  return trimmed;
};

const calculateDirectorySize = async (directory: string): Promise<number> => {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const filepath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return calculateDirectorySize(filepath);
      }
      if (!entry.isFile()) {
        return 0;
      }

      const stats = await fs.stat(filepath);
      return stats.size;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
};

const readPositiveIntegerEnv = (
  variableName: string,
  defaultValue: number,
): number => {
  const rawValue = process.env[variableName]?.trim();
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultValue;
};

const safePathSegment = (value: string, label: string): string => {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
};

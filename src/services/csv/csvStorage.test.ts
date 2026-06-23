import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deleteScopedCsvFile,
  readScopedCsvFile,
  writeScopedCsvFile,
} from "./csvStorage";

test("deleteScopedCsvFile removes a scoped local CSV", async () => {
  const originalCsvDirectory = process.env.CSV_DIRECTORY;
  const originalCsvStorageDriver = process.env.CSV_STORAGE_DRIVER;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "csv-storage-"));

  process.env.CSV_DIRECTORY = directory;
  delete process.env.CSV_STORAGE_DRIVER;

  try {
    const scope = {
      discordUserId: "222222222222222222",
      guildId: "111111111111111111",
    };

    await writeScopedCsvFile("users.csv", "User ID,Username\n1,Alice\n", scope);
    await deleteScopedCsvFile("users.csv", scope);

    await assert.rejects(
      () => readScopedCsvFile("users.csv", scope),
      /CSV file not found: users\.csv/,
    );
  } finally {
    if (originalCsvDirectory === undefined) {
      delete process.env.CSV_DIRECTORY;
    } else {
      process.env.CSV_DIRECTORY = originalCsvDirectory;
    }

    if (originalCsvStorageDriver === undefined) {
      delete process.env.CSV_STORAGE_DRIVER;
    } else {
      process.env.CSV_STORAGE_DRIVER = originalCsvStorageDriver;
    }

    await fs.rm(directory, { force: true, recursive: true });
  }
});

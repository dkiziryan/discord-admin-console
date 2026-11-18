import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deleteScopedCsvFile,
  listScopedCsvFiles,
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

test("listScopedCsvFiles honors the S3 URL style with a custom endpoint", async (t) => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    CSV_STORAGE_DRIVER: "s3",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_BUCKET: "csv-bucket",
    S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "auto",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
  };
  t.after(() => {
    process.env = originalEnv;
  });

  const scope = { discordUserId: "222", guildId: "111" };
  const query = "?list-type=2&prefix=csv%2F111%2F222%2F";
  const request = t.mock.method(globalThis, "fetch", async () => {
    return new Response("<ListBucketResult/>");
  });

  for (const { setting, address } of [
    { setting: "false", address: "https://csv-bucket.storage.example.test/" },
    { setting: "true", address: "https://storage.example.test/csv-bucket" },
    { setting: undefined, address: "https://storage.example.test/csv-bucket" },
  ]) {
    if (setting === undefined) {
      delete process.env.S3_FORCE_PATH_STYLE;
    } else {
      process.env.S3_FORCE_PATH_STYLE = setting;
    }

    await listScopedCsvFiles(scope);
    assert.equal(String(request.mock.calls.at(-1)?.arguments[0]), address + query);
  }
});

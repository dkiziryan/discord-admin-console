import type { Prisma } from "@prisma/client";

import type { CsvFileMetadata } from "../../models/types";
import { getPrismaClient } from "../../utils/prismaClient";
import {
  countCsvRows,
  deleteScopedCsvFile,
  listScopedCsvFiles,
  readScopedCsvFile,
  type CsvOwnerScope,
} from "./csvStorage";

export const listCsvFiles = async (
  scope: CsvOwnerScope,
): Promise<CsvFileMetadata[]> => {
  const files = await listScopedCsvFiles(scope);
  const [rowCounts, jobMetadata] = await Promise.all([
    loadCsvRowCounts(files, scope),
    loadCsvJobMetadata(files, scope),
  ]);

  return files.map((file) => ({
    ...file,
    rowCount: rowCounts.get(file.filename),
    ...(jobMetadata.get(file.filename) ?? {}),
  }));
};

export const deleteCsvFile = async (
  filename: string,
  scope: CsvOwnerScope,
): Promise<void> => {
  await deleteScopedCsvFile(filename, scope);
};

type CsvJobMetadata = Pick<
  CsvFileMetadata,
  | "createdByUsername"
  | "jobCreatedAt"
  | "jobFinishedAt"
  | "jobId"
  | "jobStatus"
  | "jobType"
>;

type CsvArtifactRecord = {
  filename: string;
  job: {
    createdAt: Date;
    createdByUser: {
      username: string;
    };
    finishedAt: Date | null;
    id: string;
    inputJson: Prisma.JsonValue | null;
    status: string;
    type: string;
  };
};

const loadCsvRowCounts = async (
  files: CsvFileMetadata[],
  scope: CsvOwnerScope,
): Promise<Map<string, number>> => {
  const rowCounts = new Map<string, number>();

  await Promise.all(
    files.map(async (file) => {
      try {
        const csvFile = await readScopedCsvFile(file.filename, scope);
        rowCounts.set(file.filename, countCsvRows(csvFile.contents));
      } catch (error) {
        console.error(
          `Failed to count rows for CSV export ${file.filename}: ${(error as Error).message}`,
        );
      }
    }),
  );

  return rowCounts;
};

const loadCsvJobMetadata = async (
  files: CsvFileMetadata[],
  scope: CsvOwnerScope,
): Promise<Map<string, CsvJobMetadata>> => {
  const metadata = new Map<string, CsvJobMetadata>();
  const filenames = files.map((file) => file.filename);
  if (filenames.length === 0) {
    return metadata;
  }

  try {
    const prisma = await getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { discordUserId: scope.discordUserId },
      select: { id: true },
    });

    if (!user) {
      return metadata;
    }

    const artifacts: CsvArtifactRecord[] = await prisma.artifact.findMany({
      where: {
        filename: { in: filenames },
        kind: "csv",
        job: {
          is: {
            createdByUserId: user.id,
          },
        },
      },
      include: {
        job: {
          include: {
            createdByUser: {
              select: { username: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const artifact of artifacts) {
      if (metadata.has(artifact.filename)) {
        continue;
      }
      if (readJsonString(artifact.job.inputJson, "guildId") !== scope.guildId) {
        continue;
      }

      metadata.set(artifact.filename, {
        createdByUsername: artifact.job.createdByUser.username,
        jobCreatedAt: artifact.job.createdAt.toISOString(),
        jobFinishedAt: artifact.job.finishedAt?.toISOString() ?? null,
        jobId: artifact.job.id,
        jobStatus: artifact.job.status,
        jobType: artifact.job.type,
      });
    }
  } catch (error) {
    console.error(
      `Failed to load CSV export job metadata: ${(error as Error).message}`,
    );
  }

  return metadata;
};

const readJsonString = (
  value: Prisma.JsonValue | null,
  key: string,
): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const maybeValue = value[key];
  return typeof maybeValue === "string" ? maybeValue : null;
};

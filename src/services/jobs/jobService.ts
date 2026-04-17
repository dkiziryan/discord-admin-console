import path from "node:path";

import type { JobStatus, JobType, Prisma } from "@prisma/client";

import { getPrismaClient } from "../../utils/prismaClient";

type CreateRunningJobOptions = {
  discordUserId: string;
  inputJson?: Prisma.InputJsonValue;
  type: JobType;
};

type CompleteJobOptions = {
  resultJson?: Prisma.InputJsonValue;
};

type FailJobOptions = {
  errorMessage: string;
  status: Extract<JobStatus, "cancelled" | "failed">;
};

type RegisterCsvArtifactOptions = {
  csvPath: string;
  jobId: string;
};

export const createRunningJob = async ({
  discordUserId,
  inputJson,
  type,
}: CreateRunningJobOptions): Promise<string> => {
  const prisma = await getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { discordUserId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("Authenticated user record was not found.");
  }

  const job = await prisma.job.create({
    data: {
      createdByUserId: user.id,
      inputJson,
      startedAt: new Date(),
      status: "running",
      type,
    },
    select: { id: true },
  });

  return job.id;
};

export const completeJob = async (
  jobId: string,
  options: CompleteJobOptions = {},
): Promise<void> => {
  await updateJobStatus(jobId, {
    finishedAt: new Date(),
    resultJson: options.resultJson,
    status: "completed",
  });
};

export const failJob = async (
  jobId: string,
  options: FailJobOptions,
): Promise<void> => {
  await updateJobStatus(jobId, {
    errorMessage: options.errorMessage,
    finishedAt: new Date(),
    status: options.status,
  });
};

export const registerCsvArtifact = async ({
  csvPath,
  jobId,
}: RegisterCsvArtifactOptions): Promise<void> => {
  const prisma = await getPrismaClient();
  await prisma.artifact.create({
    data: {
      filename: path.basename(csvPath),
      jobId,
      kind: "csv",
      storagePath: csvPath,
    },
  });
};

const updateJobStatus = async (
  jobId: string,
  data: Prisma.JobUpdateInput,
): Promise<void> => {
  const prisma = await getPrismaClient();
  await prisma.job.update({
    where: { id: jobId },
    data,
  });
};

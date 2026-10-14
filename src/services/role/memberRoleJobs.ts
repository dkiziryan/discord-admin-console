import { observeMemberRoleRateLimits } from "./memberRoleRateLimits";
import { emptyMemberRoleScanSummary } from "./memberRoleEligibility";
import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import type { MemberRoleJobStatus, UpdateMemberRolesRequest } from "../../shared/apiTypes";
import { MEMBER_ROLE_BATCH_SIZE } from "./memberRoleBatches";
import { RoleUpdateError, updateMemberRoles } from "./updateMemberRoles";

// Like the existing scan status, jobs live in this server process and survive browser refreshes.
export const createMemberRoleJobs = (client: Client) => {
  const jobs = new Map<string, MemberRoleJobStatus>();
  return {
    get: (guildId: string) => jobs.get(guildId) ?? null,
    start: (guildId: string, actorId: string, request: UpdateMemberRolesRequest) => {
      if (jobs.get(guildId)?.inProgress) {
        throw new RoleUpdateError("A member role update is already running. Reconnect to its progress.", 409);
      }
      const now = new Date().toISOString();
      const job: MemberRoleJobStatus = {
        id: randomUUID(), scanSummary: emptyMemberRoleScanSummary(), rateLimitedUntil: null, inProgress: true, request,
        phase: "preparing", checkedCount: 0, matchedCount: 0, processedCount: 0,
        updatedCount: 0, skippedCount: 0, failedCount: 0,
        batchNumber: 0, totalBatches: 0, batchSize: MEMBER_ROLE_BATCH_SIZE,
        startedAt: now, updatedAt: now, finishedAt: null, result: null, errorMessage: null,
      };
      const logProgress = () => console.info("Member role job", {
        jobId: job.id, guildId, roleId: request.roleId, dryRun: request.dryRun !== false,
        phase: job.phase, batch: job.batchNumber, totalBatches: job.totalBatches,
        checked: job.checkedCount, matched: job.matchedCount, processed: job.processedCount,
        updated: job.updatedCount, skipped: job.skippedCount, failed: job.failedCount,
      });
      jobs.set(guildId, job);
      logProgress();
      // Send 202 before any Discord work; proxy timeouts no longer hide the result.
      setImmediate(() => {
        const stopObserving = observeMemberRoleRateLimits(client, guildId, until => {
          if (!job.rateLimitedUntil || until > job.rateLimitedUntil) job.rateLimitedUntil = until;
        });
        void updateMemberRoles(client, guildId, actorId, request, progress => {
          const boundaryChanged = job.phase !== progress.phase || job.batchNumber !== progress.batchNumber;
          Object.assign(job, progress, { updatedAt: new Date().toISOString() });
          if (boundaryChanged) logProgress();
        }).then(result => {
          Object.assign(job, { result, phase: "completed" });
        }).catch((error: Error) => {
          Object.assign(job, { phase: "failed", errorMessage: error.message });
          logProgress();
        }).finally(() => {
          stopObserving();
          job.rateLimitedUntil = null;
          job.inProgress = false;
          job.finishedAt = job.updatedAt = new Date().toISOString();
        });
      });
      return job;
    },
  };
};

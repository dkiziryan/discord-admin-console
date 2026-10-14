import type { MemberRoleJobStatus } from "../../models/types";

export const MemberRoleProgressView = ({ job, elapsedSeconds, quietSeconds, rateLimitSeconds, lastCheckedAt }: {
  job: MemberRoleJobStatus;
  elapsedSeconds: number;
  quietSeconds: number;
  rateLimitSeconds: number;
  lastCheckedAt: number | null;
}) => (
  <section aria-label="Role update progress" aria-live="polite">
    <h3>{job.inProgress ? (job.request.dryRun !== false ? "Dry run running" : "Role update running") : job.phase === "failed" ? "Role update stopped" : job.failedCount > 0 ? "Role update completed with errors" : "Role update complete"}</h3>
    <p>{job.phase === "preparing" ? "Checking permissions and loading roles..."
      : job.phase === "scanning" ? "Scanning server members..."
      : job.phase === "pausing" ? "Pausing between batches..."
      : job.phase === "updating" ? "Updating member roles..."
      : job.phase === "failed" ? "The job stopped with an error." : "Finished."}</p>
    <p>Elapsed: {elapsedSeconds}s. Members checked: {job.checkedCount}. Matching: {job.matchedCount}.</p>
    {job.scanSummary && <p>Excluded: {job.scanSummary.bots} bots, {job.scanSummary.excludedByRole} by role, {job.scanSummary.noChangeNeeded} needing no change.</p>}
    {job.totalBatches > 0 && <>
      <p>Batch {job.batchNumber} of {job.totalBatches}, up to {job.batchSize} members per batch.</p>
      <progress aria-label="Members processed" value={job.processedCount} max={job.matchedCount} />
      <p>Processed: {job.processedCount} / {job.matchedCount}. Updated: {job.updatedCount}. Skipped: {job.skippedCount}. Failed: {job.failedCount}.</p>
    </>}
    {job.inProgress && <>
      <p>Last progress: {quietSeconds}s ago. {lastCheckedAt ? `Last server response: ${new Date(lastCheckedAt).toLocaleTimeString()}.` : "Connecting to progress..."}</p>
      {rateLimitSeconds > 0 && <p role="status">Discord rate limit: some requests are waiting up to {rateLimitSeconds}s before they can continue. The job will continue automatically.</p>}
      {rateLimitSeconds === 0 && quietSeconds >= 30 && <p role="status">No new member progress for {quietSeconds}s. The job is still marked running; Discord requests may be waiting or rate limited. Keep this page open to monitor.</p>}
      <p>You can reopen this tool to reconnect. Status is retained while the server process is running.</p>
    </>}
    {job.errorMessage && <p role="alert">{job.errorMessage}</p>}
  </section>
);

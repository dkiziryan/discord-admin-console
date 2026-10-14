import { isProtectedMemberRoleName, memberRoleExclusions } from "../../../../src/shared/memberRolePolicy";
import { useEffect, useRef, useState } from "react";
import type { MemberRoleOption, UpdateMemberRolesRequest } from "../../models/types";
import { fetchMemberRoles } from "../../services/roles/updateMemberRoles";
import { useMemberRoleJob } from "../../hooks/useMemberRoleJob";
import { MemberRoleScanBreakdown } from "./MemberRoleScanBreakdown";
import { MemberRoleProgressView } from "./MemberRoleProgressView";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import styles from "./UpdateMemberRolesPanel.module.css";

export const UpdateMemberRolesPanel = () => {
  const [roles, setRoles] = useState<MemberRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { job, start, recovered, busy, checking, starting, monitorError, startError, lastCheckedAt, elapsedSeconds, quietSeconds, rateLimitSeconds, reset } = useMemberRoleJob();
  const hydratedJob = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<UpdateMemberRolesRequest["action"]>("add");
  const [dryRunOnly, setDryRunOnly] = useState(true);
  const [specificUsers, setSpecificUsers] = useState(false);
  const [userInput, setUserInput] = useState("");
  const userIds = [...new Set(userInput.trim().split(/[\s,]+/).filter(Boolean))];
  const validUsers = !specificUsers || (userIds.length > 0 && userIds.length <= 100 && userIds.every(id => /^[1-9]\d{0,19}$/.test(id)));
  const [roleId, setRoleId] = useState("");
  const [excludedRoleIds, setExcludedRoleIds] = useState<string[]>([]);
  const effectiveExcludedRoleIds = memberRoleExclusions(excludedRoleIds, roles);
  const preview = job?.request.dryRun !== false ? job?.result : null;
  const result = job?.request.dryRun === false ? job.result : null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMemberRoles().then(response => {
      if (cancelled) return;
      setRoles(response.roles);
      if (!hydratedJob.current) setExcludedRoleIds(response.roles.filter(role =>
        isProtectedMemberRoleName(role.name),
      ).map(role => role.id));
    }).catch((reason: Error) => {
      if (!cancelled) setError(reason.message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  useEffect(() => {
    if (!job || !recovered || hydratedJob.current === job.id) return;
    hydratedJob.current = job.id;
    setAction(job.request.action);
    setRoleId(job.request.roleId);
    setExcludedRoleIds(job.request.excludedRoleIds);
    setSpecificUsers(job.request.userIds !== undefined);
    setUserInput(job.request.userIds?.join(", ") ?? "");
    setDryRunOnly(job.request.dryRun !== false);
  }, [job, recovered]);

  const invalidate = () => { reset(); setError(null); };
  const run = async (dryRun: boolean) => {
    if (busy || !validUsers || (!dryRun && dryRunOnly)) return;
    setError(null);
    setConfirmOpen(false);
    await start({ action, roleId, excludedRoleIds: effectiveExcludedRoleIds, dryRun, ...(specificUsers ? { userIds } : {}) });
  };
  const target = roles.find(role => role.id === roleId);
  const valid = validUsers && !!target?.canUpdate && !isProtectedMemberRoleName(target.name) && !effectiveExcludedRoleIds.includes(roleId);

  return (
    <section className={styles.panel}>
      <p>Add or remove one role for all matching members. Members with any excluded role are skipped. Limited, in-between / in between, and bots are always excluded.</p>
      {checking && <p role="status">Checking for a running role update...</p>}
      {starting && <p role="status">Starting role update...</p>}
      {job && <MemberRoleProgressView job={job} elapsedSeconds={elapsedSeconds} quietSeconds={quietSeconds} rateLimitSeconds={rateLimitSeconds} lastCheckedAt={lastCheckedAt} />}
      {job?.phase === "failed" && job.request.dryRun === false && !busy && <button type="button" className="secondary-button" onClick={() => void run(true)}>Preview remaining members</button>}
      {monitorError && <p role="alert">{monitorError}</p>}
      {startError && <p role="alert">{startError}</p>}
      {loading && <p role="status">Loading server roles...</p>}
      <fieldset disabled={loading || busy || confirmOpen} className={styles.fields}>
        <legend>Role update</legend>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={dryRunOnly} onChange={event => { setDryRunOnly(event.target.checked); invalidate(); }} />
          Dry run only (no role changes)
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={specificUsers} onChange={event => { setSpecificUsers(event.target.checked); invalidate(); }} />
          Limit to specific users
        </label>
        {specificUsers && <>
          <label>Discord user IDs
            <textarea rows={3} value={userInput} placeholder="Enter user IDs separated by commas, spaces, or new lines"
              onChange={event => { setUserInput(event.target.value); invalidate(); }} aria-describedby="role-user-help" />
          </label>
          <small id="role-user-help">Only these users will be checked. Enter 1 to 100 Discord user IDs. Role exclusions still apply.</small>
          {!validUsers && <p role="alert">Enter between 1 and 100 valid Discord user IDs.</p>}
        </>}
        <p>Scope: {specificUsers ? `${userIds.length} specified user(s)` : "All server members"}.</p>
        <label>Action
          <select value={action} onChange={event => { setAction(event.target.value as typeof action); invalidate(); }}>
            <option value="add">Add role</option><option value="remove">Remove role</option>
          </select>
        </label>
        <label>Role to update
          <select value={roleId} onChange={event => { setRoleId(event.target.value); invalidate(); }}>
            <option value="">Select a role</option>
            {roles.filter(role => role.canUpdate && !isProtectedMemberRoleName(role.name)).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <fieldset className={styles.exclusions}>
          <legend>Exclude members with any of these roles</legend>
          {roles.map(role => {
            const protectedRole = isProtectedMemberRoleName(role.name);
            return <label key={role.id} className={styles.checkbox}>
              <input type="checkbox" checked={effectiveExcludedRoleIds.includes(role.id)} disabled={protectedRole}
                onChange={event => {
                  setExcludedRoleIds(memberRoleExclusions(event.target.checked
                    ? [...effectiveExcludedRoleIds, role.id]
                    : effectiveExcludedRoleIds.filter(id => id !== role.id), roles));
                  invalidate();
                }} />
              <span>{role.name}{protectedRole ? " (always excluded)" : ""}</span>
            </label>;
          })}
        </fieldset>
        <small>Check each role to exclude. Limited and in-between (including in between) are always excluded and cannot be unchecked.</small>
        {!loading && !roles.some(role => role.canUpdate) && <p>No roles are available for you and the bot to manage.</p>}
        {effectiveExcludedRoleIds.includes(roleId) && <p role="alert">The target role cannot also be an excluded role.</p>}
        <button type="button" className="primary-button" disabled={!valid} onClick={() => void run(true)}>
          {busy ? "Working..." : (dryRunOnly ? "Run dry run" : "Preview role update")}
        </button>
      </fieldset>
      {preview && <div className={styles.results}>
        <h3>Preview: {action === "add" ? "Add" : "Remove"} {preview.data.roleName}</h3>
        <p role="status">{preview.message}</p>
        <p>Checked {preview.data.totalMembers} members. Members who already have the role when adding, or lack it when removing, need no change.</p>
        <MemberRoleScanBreakdown data={preview.data} action={action} />
        <ul>{preview.data.previewNames.map((name, index) => <li key={index}>{name}</li>)}</ul>
        {preview.data.matchedCount > preview.data.previewNames.length && <p>And {preview.data.matchedCount - preview.data.previewNames.length} more.</p>}
        {dryRunOnly && <p>Dry run complete. No roles were changed. Clear "Dry run only" and preview again to enable applying.</p>}
        {!dryRunOnly && <button type="button" className="primary-button" disabled={busy || preview.data.matchedCount === 0} onClick={() => setConfirmOpen(true)}>Apply role update</button>}
      </div>}
      {result && <div className={styles.results}>
        <h3>Role update summary</h3><p role="status">{result.message}</p>
        <p>Updated: {result.data.updatedCount}. Skipped during recheck: {result.data.skippedCount}. Failed: {result.data.failures.length}.</p>
        <MemberRoleScanBreakdown data={result.data} action={action} />
        <p>Preview the remaining members to check for anyone still needing this change. Successful updates are excluded automatically based on their current roles.</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(true)}>Preview remaining members</button>
        {result.data.failures.length > 0 && <details><summary>{result.data.failures.length} issue(s)</summary>
          <ul>{result.data.failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul>
        </details>}
      </div>}
      {error && <div role="alert"><p className="status error">{error}</p>
        {roles.length === 0 && <button type="button" className="secondary-button" disabled={loading} onClick={() => setLoadKey(key => key + 1)}>Reload roles</button>}
      </div>}
      <ConfirmationModal isOpen={confirmOpen} title="Confirm member role update" confirmLabel="Confirm role update" isConfirming={busy}
        message={<><p>{action === "add" ? "Add" : "Remove"} {target?.name} {action === "add" ? "for" : "from"} approximately {preview?.data.matchedCount} member(s)?</p>
          <p>Scope: {specificUsers ? `Only these Discord user IDs: ${userIds.join(", ")}` : "All server members"}.</p>
          <p>Excluding: {roles.filter(role => effectiveExcludedRoleIds.includes(role.id)).map(role => role.name).join(", ") || "No roles selected"}.</p>
          <p>Membership and exclusions are checked again when applying. The final count may change.</p></>}
        onCancel={() => setConfirmOpen(false)} onConfirm={() => void run(false)} />
    </section>
  );
};

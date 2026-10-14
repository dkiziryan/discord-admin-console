import { useEffect, useState } from "react";
import type { MemberRoleOption, UpdateMemberRolesRequest, UpdateMemberRolesResponse } from "../../models/types";
import { fetchMemberRoles, requestMemberRoleUpdate } from "../../services/roles/updateMemberRoles";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import styles from "./UpdateMemberRolesPanel.module.css";

export const UpdateMemberRolesPanel = () => {
  const [roles, setRoles] = useState<MemberRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<UpdateMemberRolesRequest["action"]>("add");
  const [dryRunOnly, setDryRunOnly] = useState(true);
  const [specificUsers, setSpecificUsers] = useState(false);
  const [userInput, setUserInput] = useState("");
  const userIds = [...new Set(userInput.trim().split(/[\s,]+/).filter(Boolean))];
  const validUsers = !specificUsers || (userIds.length > 0 && userIds.length <= 100 && userIds.every(id => /^[1-9]\d{0,19}$/.test(id)));
  const [roleId, setRoleId] = useState("");
  const [excludedRoleIds, setExcludedRoleIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<UpdateMemberRolesResponse | null>(null);
  const [result, setResult] = useState<UpdateMemberRolesResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMemberRoles().then(response => {
      if (cancelled) return;
      setRoles(response.roles);
      setExcludedRoleIds(response.roles.filter(role =>
        ["limited", "in-between"].includes(role.name.trim().toLowerCase()),
      ).map(role => role.id));
    }).catch((reason: Error) => {
      if (!cancelled) setError(reason.message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const invalidate = () => { setPreview(null); setResult(null); setError(null); };
  const run = async (dryRun: boolean) => {
    if (busy || !validUsers || (!dryRun && dryRunOnly)) return;
    setBusy(true);
    setError(null);
    setConfirmOpen(false);
    setPreview(null);
    setResult(null);
    try {
      const response = await requestMemberRoleUpdate({ action, roleId, excludedRoleIds, dryRun, ...(specificUsers ? { userIds } : {}) });
      if (dryRun) setPreview(response);
      else setResult(response);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const target = roles.find(role => role.id === roleId);
  const valid = validUsers && !!target?.canUpdate && !excludedRoleIds.includes(roleId);

  return (
    <section className={styles.panel}>
      <p>Add or remove one role for all matching members. Members with any excluded role are skipped. Bots are always skipped.</p>
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
            {roles.filter(role => role.canUpdate).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label>Exclude members with any of these roles
          <select multiple size={Math.min(6, Math.max(3, roles.length))} value={excludedRoleIds}
            onChange={event => { setExcludedRoleIds(Array.from(event.target.selectedOptions, option => option.value)); invalidate(); }}>
            {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <small>Hold Ctrl or Command to select multiple roles or clear selections. Limited and in-between are selected by default when available.</small>
        {!loading && !roles.some(role => role.canUpdate) && <p>No roles are available for you and the bot to manage.</p>}
        {excludedRoleIds.includes(roleId) && <p role="alert">The target role cannot also be an excluded role.</p>}
        <button type="button" className="primary-button" disabled={!valid} onClick={() => void run(true)}>
          {busy ? "Working..." : (dryRunOnly ? "Run dry run" : "Preview role update")}
        </button>
      </fieldset>
      {preview && <div className={styles.results}>
        <h3>Preview: {action === "add" ? "Add" : "Remove"} {preview.data.roleName}</h3>
        <p role="status">{preview.message}</p>
        <p>Checked {preview.data.totalMembers} members. Members who already have the role when adding, or lack it when removing, need no change.</p>
        <ul>{preview.data.previewNames.map((name, index) => <li key={index}>{name}</li>)}</ul>
        {preview.data.matchedCount > preview.data.previewNames.length && <p>And {preview.data.matchedCount - preview.data.previewNames.length} more.</p>}
        {dryRunOnly && <p>Dry run complete. No roles were changed. Clear "Dry run only" and preview again to enable applying.</p>}
        {!dryRunOnly && <button type="button" className="primary-button" disabled={busy || preview.data.matchedCount === 0} onClick={() => setConfirmOpen(true)}>Apply role update</button>}
      </div>}
      {result && <div className={styles.results}>
        <h3>Role update summary</h3><p role="status">{result.message}</p>
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
          <p>Excluding: {roles.filter(role => excludedRoleIds.includes(role.id)).map(role => role.name).join(", ") || "No roles selected"}.</p>
          <p>Membership and exclusions are checked again when applying. The final count may change.</p></>}
        onCancel={() => setConfirmOpen(false)} onConfirm={() => void run(false)} />
    </section>
  );
};

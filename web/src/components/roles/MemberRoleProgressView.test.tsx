// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MemberRoleJobStatus } from "../../models/types";
import { fetchMemberRoles, fetchMemberRoleStatus, requestMemberRoleUpdate } from "../../services/roles/updateMemberRoles";
import { UpdateMemberRolesPanel } from "./UpdateMemberRolesPanel";

vi.mock("../../services/roles/updateMemberRoles", () => ({
  fetchMemberRoles: vi.fn(), fetchMemberRoleStatus: vi.fn(), requestMemberRoleUpdate: vi.fn(),
}));
const running = (): MemberRoleJobStatus => ({
  id: "job-1", inProgress: true, request: { action: "add", roleId: "10", excludedRoleIds: ["20"], dryRun: false },
  phase: "updating", checkedCount: 1000, matchedCount: 50, processedCount: 12,
  updatedCount: 10, skippedCount: 1, failedCount: 1,
  batchNumber: 1, totalBatches: 2, batchSize: 25,
  startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  finishedAt: null, result: null, errorMessage: null,
});
const mount = async () => { render(<UpdateMemberRolesPanel />); await act(async () => {}); };
const advance = async (ms = 1500) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchMemberRoles).mockResolvedValue({ roles: [
    { id: "10", name: "Member", canUpdate: true }, { id: "20", name: "limited", canUpdate: true },
  ] });
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job: running() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

it("reconnects to an active job and shows real counts without submitting another request", async () => {
  await mount();
  expect(screen.getByText("Role update running")).toBeTruthy();
  expect(screen.getByText(/Batch 1 of 2/)).toBeTruthy();
  expect(screen.getByText(/Updated: 10. Skipped: 1. Failed: 1/)).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Members processed" })).toHaveProperty("value", 12);
  expect((screen.getByLabelText("Role to update") as HTMLSelectElement).closest("fieldset")).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("Dry run only (no role changes)")).toHaveProperty("checked", false);
  expect(requestMemberRoleUpdate).not.toHaveBeenCalled();
});
it("polls through batch pauses and completion, then stops polling", async () => {
  const job = running();
  vi.mocked(fetchMemberRoleStatus).mockResolvedValueOnce({ job }).mockResolvedValueOnce({ job: { ...job, phase: "pausing", processedCount: 25 } }).mockResolvedValue({ job: {
    ...job, inProgress: false, phase: "completed", processedCount: 50, updatedCount: 48, finishedAt: new Date().toISOString(),
    result: { message: "Updated 48 member(s).", data: { guildName: "Guild", roleName: "Member", totalMembers: 1000, matchedCount: 50, updatedCount: 48, skippedCount: 1, previewNames: [], failures: ["A user: Missing access"] } },
  } });
  await mount(); await advance();
  expect(screen.getByText("Pausing between batches...")).toBeTruthy();
  await advance();
  expect(screen.getByText("Role update summary")).toBeTruthy();
  expect(screen.getByText("Updated 48 member(s).")).toBeTruthy();
  await advance(5000);
  expect(fetchMemberRoleStatus).toHaveBeenCalledTimes(3);
});
it("shows elapsed time and a stall notice after 30 seconds without progress", async () => {
  const job = running();
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job });
  await mount(); await advance(31_000);
  expect(screen.getByText(/No new member progress for 31s/)).toBeTruthy();
  expect(screen.getByText(/Elapsed: 31s/)).toBeTruthy();
  expect(screen.getByText(/Last server response:/)).toBeTruthy();
});
it("keeps progress and blocks submissions while reconnecting after a status failure", async () => {
  const job = running();
  vi.mocked(fetchMemberRoleStatus).mockResolvedValueOnce({ job }).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ job: { ...job, processedCount: 20 } });
  await mount(); await advance();
  expect(screen.getByRole("alert").textContent).toContain("Progress connection lost");
  expect(screen.getByRole("progressbar")).toHaveProperty("value", 12);
  await advance();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("progressbar")).toHaveProperty("value", 20);
  expect(requestMemberRoleUpdate).not.toHaveBeenCalled();
});
it("shows a backend error when a job stops", async () => {
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job: { ...running(), inProgress: false, phase: "failed", errorMessage: "Missing Manage Roles permission" } });
  await mount();
  expect(screen.getByRole("alert").textContent).toContain("Missing Manage Roles permission");
  expect(screen.getByText("Role update stopped")).toBeTruthy();
});
it("reports lost job status instead of treating a server restart as success", async () => {
  vi.mocked(fetchMemberRoleStatus).mockResolvedValueOnce({ job: running() }).mockResolvedValue({ job: null });
  await mount(); await advance();
  expect(screen.getByRole("alert").textContent).toContain("completion is unknown");
  expect(screen.queryByText("Role update summary")).toBeNull();
});
it("reconnects after a lost start response without sending the update twice", async () => {
  vi.mocked(fetchMemberRoleStatus).mockResolvedValueOnce({ job: null }).mockResolvedValue({ job: { ...running(), request: { ...running().request, dryRun: true } } });
  vi.mocked(requestMemberRoleUpdate).mockRejectedValue(new Error("Request timed out"));
  await mount();
  fireEvent.change(screen.getByLabelText("Role to update"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
  await act(async () => {});
  expect(screen.getByText("Dry run running")).toBeTruthy();
  await advance(3000);
  expect(requestMemberRoleUpdate).toHaveBeenCalledTimes(1);
});
it("does not overlap status polls on a slow connection and cleans up on unmount", async () => {
  let resolve!: (value: { job: MemberRoleJobStatus | null }) => void;
  vi.mocked(fetchMemberRoleStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<UpdateMemberRolesPanel />);
  await advance(6000);
  expect(fetchMemberRoleStatus).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ job: running() }); });
  view.unmount();
  await advance(6000);
  expect(fetchMemberRoleStatus).toHaveBeenCalledTimes(1);
});

it("shows an actual Discord rate-limit wait instead of a generic stall warning", async () => {
  const job = { ...running(), startedAt: new Date(Date.now() - 40_000).toISOString(), updatedAt: new Date(Date.now() - 40_000).toISOString(), rateLimitedUntil: new Date(Date.now() + 5000).toISOString() };
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job });
  await mount();
  expect(screen.getByText(/Discord rate limit:.*5s/)).toBeTruthy();
  expect(screen.queryByText(/No new member progress/)).toBeNull();
  await advance(2000);
  expect(screen.getByText(/Discord rate limit:.*3s/)).toBeTruthy();
});
it("marks completed runs with failures as completed with errors", async () => {
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job: { ...running(), inProgress: false, phase: "completed" } });
  await mount();
  expect(screen.getByText("Role update completed with errors")).toBeTruthy();
});

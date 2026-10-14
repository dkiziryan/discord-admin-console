// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateMemberRolesPanel } from "./UpdateMemberRolesPanel";
import { fetchMemberRoles, fetchMemberRoleStatus, requestMemberRoleUpdate } from "../../services/roles/updateMemberRoles";

vi.mock("../../services/roles/updateMemberRoles", () => ({ fetchMemberRoleStatus: vi.fn(), fetchMemberRoles: vi.fn(), requestMemberRoleUpdate: vi.fn() }));
import type { MemberRoleJobStatus, UpdateMemberRolesRequest, UpdateMemberRolesResponse } from "../../models/types";

let jobNumber = 0;
const completed = (request: UpdateMemberRolesRequest, result: UpdateMemberRolesResponse): { job: MemberRoleJobStatus } => ({ job: {
  id: String(++jobNumber), request, inProgress: false, phase: "completed", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  checkedCount: result.data.totalMembers, matchedCount: result.data.matchedCount, processedCount: result.data.updatedCount, updatedCount: result.data.updatedCount, skippedCount: 0, failedCount: result.data.failures.length, batchNumber: 0, totalBatches: 0, batchSize: 25, result, errorMessage: null,
} });
const response = { message: "2 member(s) match this role update.", data: {
  guildName: "Guild", roleName: "Member", totalMembers: 6, matchedCount: 2, updatedCount: 0,
  skippedCount: 0, previewNames: ["Alice", "Bob"], failures: [],
} };
beforeEach(() => {
  vi.mocked(fetchMemberRoles).mockResolvedValue({ roles: [
    { id: "10", name: "Member", canUpdate: true }, { id: "20", name: "limited", canUpdate: true },
    { id: "30", name: "in-between", canUpdate: true }, { id: "40", name: "Integration", canUpdate: false },
  ] });
  vi.mocked(fetchMemberRoleStatus).mockResolvedValue({ job: null });
  vi.mocked(requestMemberRoleUpdate).mockImplementation(async payload => completed(payload, response));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const selectTarget = async (applyMode = true) => {
  await screen.findAllByRole("option", { name: "Member" });
  if (applyMode) fireEvent.click(screen.getByLabelText("Dry run only (no role changes)"));
  fireEvent.change(screen.getByLabelText("Role to update"), { target: { value: "10" } });
};

describe("UpdateMemberRolesPanel", () => {
  it.each(["add", "remove"])("previews and confirms %s with both default exclusions", async action => {
    render(<UpdateMemberRolesPanel />);
    expect(screen.getByRole("button", { name: "Working..." })).toHaveProperty("disabled", true);
    await selectTarget();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: action } });
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(requestMemberRoleUpdate).toHaveBeenCalledWith({ action, roleId: "10", excludedRoleIds: ["20", "30"], dryRun: true });
    fireEvent.click(screen.getByRole("button", { name: "Apply role update" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(requestMemberRoleUpdate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm role update" }));
    await screen.findByText("Role update summary");
    expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith({ action, roleId: "10", excludedRoleIds: ["20", "30"], dryRun: false });
  });
  it("allows cancellation without applying and invalidates previews on filter changes", async () => {
    render(<UpdateMemberRolesPanel />); await selectTarget();
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    await screen.findByText("Alice");
    fireEvent.click(screen.getByRole("button", { name: "Apply role update" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requestMemberRoleUpdate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Integration" }));
    expect(screen.queryByText("Alice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    await waitFor(() => expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ excludedRoleIds: ["20", "30", "40"] })));
  });
  it("blocks target/exclusion conflicts and omits unmanageable targets", async () => {
    render(<UpdateMemberRolesPanel />); await selectTarget();
    expect(Array.from((screen.getByLabelText("Role to update") as HTMLSelectElement).options).some(option => option.value === "40")).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Member" }));
    expect(screen.getByRole("alert").textContent).toContain("cannot also be an excluded role");
    expect(screen.getByRole("button", { name: "Preview role update" })).toHaveProperty("disabled", true);
  });
  it("disables applying when no members match", async () => {
    vi.mocked(requestMemberRoleUpdate).mockImplementation(async payload => completed(payload, { ...response, data: { ...response.data, matchedCount: 0, previewNames: [] } }));
    render(<UpdateMemberRolesPanel />); await selectTarget();
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    expect(await screen.findByRole("button", { name: "Apply role update" })).toHaveProperty("disabled", true);
  });
  it("reports loading errors and allows retry", async () => {
    vi.mocked(fetchMemberRoles).mockRejectedValueOnce(new Error("Missing Manage Roles"));
    render(<UpdateMemberRolesPanel />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload roles" }));
    await selectTarget();
    expect(fetchMemberRoles).toHaveBeenCalledTimes(2);
  });
  it("shows partial failures after applying", async () => {
    vi.mocked(requestMemberRoleUpdate).mockImplementationOnce(async payload => completed(payload, response)).mockImplementationOnce(async payload => completed(payload, { ...response, message: "Updated 1 member; failed 1.", data: { ...response.data, updatedCount: 1, failures: ["Bob: Missing access"] } }));
    render(<UpdateMemberRolesPanel />); await selectTarget();
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply role update" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm role update" }));
    expect(await screen.findByText("Bob: Missing access")).toBeTruthy();
  });
});

describe("Production test controls", () => {
  it("defaults to dry run and cannot apply roles in that mode", async () => {
    render(<UpdateMemberRolesPanel />); await selectTarget(false);
    expect(screen.getByLabelText("Dry run only (no role changes)")).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
    await screen.findByText("Alice");
    expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: true }));
    expect(screen.queryByRole("button", { name: "Apply role update" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Dry run only (no role changes)"));
    expect(screen.queryByText("Alice")).toBeNull();
  });
  it.each(["add", "remove"])("limits %s previews and applying to the entered test users", async action => {
    render(<UpdateMemberRolesPanel />); await selectTarget();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: action } });
    fireEvent.click(screen.getByLabelText("Limit to specific users"));
    expect(screen.getByRole("button", { name: "Preview role update" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Discord user IDs"), { target: { value: "101, 106\n101" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    await screen.findByText("Alice");
    expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith({ action, roleId: "10", excludedRoleIds: ["20", "30"], dryRun: true, userIds: ["101", "106"] });
    fireEvent.click(screen.getByRole("button", { name: "Apply role update" }));
    expect(screen.getByRole("dialog").textContent).toContain("Only these Discord user IDs: 101, 106");
    fireEvent.click(screen.getByRole("button", { name: "Confirm role update" }));
    await screen.findByText("Role update summary");
    expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith({ action, roleId: "10", excludedRoleIds: ["20", "30"], dryRun: false, userIds: ["101", "106"] });
  });
  it("dry runs only selected users and invalidates preview when the user list changes", async () => {
    render(<UpdateMemberRolesPanel />); await selectTarget(false);
    fireEvent.click(screen.getByLabelText("Limit to specific users"));
    fireEvent.change(screen.getByLabelText("Discord user IDs"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
    await screen.findByText("Alice");
    expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: true, userIds: ["101"] }));
    fireEvent.change(screen.getByLabelText("Discord user IDs"), { target: { value: "bad-id" } });
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.getByRole("button", { name: "Run dry run" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("alert").textContent).toContain("valid Discord user IDs");
  });
});

it("explains why members were excluded from the preview", async () => {
  vi.mocked(requestMemberRoleUpdate).mockImplementation(async payload => completed(payload, {
    ...response, data: { ...response.data, scanSummary: { pagesRead: 1, bots: 1, excludedByRole: 2, noChangeNeeded: 1 } },
  }));
  render(<UpdateMemberRolesPanel />); await selectTarget();
  fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
  expect(await screen.findByText("Bots excluded: 1")).toBeTruthy();
  expect(screen.getByText("Excluded by selected roles: 2")).toBeTruthy();
  expect(screen.getByText("Already have the role: 1")).toBeTruthy();
  expect(screen.getByText("Matching members needing a change: 2")).toBeTruthy();
});
it("previews only remaining work after a completed update without applying automatically", async () => {
  vi.mocked(requestMemberRoleUpdate)
    .mockImplementationOnce(async payload => completed(payload, response))
    .mockImplementationOnce(async payload => completed(payload, { ...response, message: "Updated 302 of 305.", data: { ...response.data, matchedCount: 305, updatedCount: 302, failures: ["User: temporary failure"] } }))
    .mockImplementationOnce(async payload => completed(payload, { ...response, data: { ...response.data, matchedCount: 3, scanSummary: { pagesRead: 1, bots: 0, excludedByRole: 0, noChangeNeeded: 302 } } }));
  render(<UpdateMemberRolesPanel />); await selectTarget();
  fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply role update" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm role update" }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview remaining members" }));
  expect(await screen.findByText("Already have the role: 302")).toBeTruthy();
  expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith({ action: "add", roleId: "10", excludedRoleIds: ["20", "30"], dryRun: true });
  expect(requestMemberRoleUpdate).toHaveBeenCalledTimes(3);
});

it.each(["in between", "IN BETWEEN", "in\u2011between", "in_between"])("shows checked disabled checkboxes for %s and limited", async name => {
  vi.mocked(fetchMemberRoles).mockResolvedValue({ roles: [
    { id: "10", name: "Improper", canUpdate: true },
    { id: "20", name: "limited", canUpdate: true },
    { id: "30", name, canUpdate: true },
  ] });
  render(<UpdateMemberRolesPanel />);
  await screen.findByRole("checkbox", { name: `${name} (always excluded)` });
  for (const label of ["limited", name]) {
    const checkbox = screen.getByRole("checkbox", { name: `${label} (always excluded)` });
    expect(checkbox).toHaveProperty("disabled", true);
    expect(checkbox).toHaveProperty("checked", true);
  }
  const target = screen.getByLabelText("Role to update") as HTMLSelectElement;
  expect(Array.from(target.options).some(option => ["20", "30"].includes(option.value))).toBe(false);
  fireEvent.change(target, { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Run dry run" }));
  await waitFor(() => expect(requestMemberRoleUpdate).toHaveBeenCalledWith(expect.objectContaining({ excludedRoleIds: ["20", "30"], dryRun: true })));
});

it("allows optional exclusion checkboxes to be checked and unchecked independently", async () => {
  render(<UpdateMemberRolesPanel />); await selectTarget();
  const optional = screen.getByRole("checkbox", { name: "Integration" });
  expect(optional).toHaveProperty("checked", false);
  expect(optional).toHaveProperty("disabled", false);
  fireEvent.click(optional);
  expect(optional).toHaveProperty("checked", true);
  fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
  await screen.findByText("Alice");
  expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ excludedRoleIds: ["20", "30", "40"] }));
  fireEvent.click(optional);
  expect(optional).toHaveProperty("checked", false);
  expect(screen.queryByText("Alice")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
  await waitFor(() => expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ excludedRoleIds: ["20", "30"] })));
});

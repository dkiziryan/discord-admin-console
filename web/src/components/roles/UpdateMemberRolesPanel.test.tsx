// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateMemberRolesPanel } from "./UpdateMemberRolesPanel";
import { fetchMemberRoles, requestMemberRoleUpdate } from "../../services/roles/updateMemberRoles";

vi.mock("../../services/roles/updateMemberRoles", () => ({ fetchMemberRoles: vi.fn(), requestMemberRoleUpdate: vi.fn() }));
const response = { message: "2 member(s) match this role update.", data: {
  guildName: "Guild", roleName: "Member", totalMembers: 6, matchedCount: 2, updatedCount: 0,
  skippedCount: 0, previewNames: ["Alice", "Bob"], failures: [],
} };
beforeEach(() => {
  vi.mocked(fetchMemberRoles).mockResolvedValue({ roles: [
    { id: "10", name: "Member", canUpdate: true }, { id: "20", name: "limited", canUpdate: true },
    { id: "30", name: "in-between", canUpdate: true }, { id: "40", name: "Integration", canUpdate: false },
  ] });
  vi.mocked(requestMemberRoleUpdate).mockResolvedValue(response);
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
    expect(screen.getByRole("button", { name: "Run dry run" })).toHaveProperty("disabled", true);
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
    const exclusions = screen.getByLabelText("Exclude members with any of these roles") as HTMLSelectElement;
    Array.from(exclusions.options).forEach(option => { option.selected = option.value === "30"; });
    fireEvent.change(exclusions);
    expect(screen.queryByText("Alice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview role update" }));
    await waitFor(() => expect(requestMemberRoleUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ excludedRoleIds: ["30"] })));
  });
  it("blocks target/exclusion conflicts and omits unmanageable targets", async () => {
    render(<UpdateMemberRolesPanel />); await selectTarget();
    expect(Array.from((screen.getByLabelText("Role to update") as HTMLSelectElement).options).some(option => option.value === "40")).toBe(false);
    fireEvent.change(screen.getByLabelText("Role to update"), { target: { value: "20" } });
    expect(screen.getByRole("alert").textContent).toContain("cannot also be an excluded role");
    expect(screen.getByRole("button", { name: "Preview role update" })).toHaveProperty("disabled", true);
  });
  it("disables applying when no members match", async () => {
    vi.mocked(requestMemberRoleUpdate).mockResolvedValue({ ...response, data: { ...response.data, matchedCount: 0, previewNames: [] } });
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
    vi.mocked(requestMemberRoleUpdate).mockResolvedValueOnce(response).mockResolvedValueOnce({ ...response, message: "Updated 1 member; failed 1.", data: { ...response.data, updatedCount: 1, failures: ["Bob: Missing access"] } });
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

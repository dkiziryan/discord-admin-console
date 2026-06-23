// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CleanupRolesPanel } from "./CleanupRolesPanel";
import { requestRoleCleanup } from "../../services/roles/cleanupRoles";
import type { CleanupRolesResponse } from "../../models/types";

vi.mock("../../services/roles/cleanupRoles", () => ({
  requestRoleCleanup: vi.fn(),
}));

const previewResponse: CleanupRolesResponse = {
  message: "Found 2 empty role(s) ready for deletion.",
  data: {
    deletableRoleCount: 2,
    deletedRoleCount: 0,
    failures: [],
    guildName: "Test Guild",
    moreCount: 0,
    previewNames: ["empty-one", "empty-two"],
    totalRoles: 12,
  },
};

const deleteResponse: CleanupRolesResponse = {
  message: "Deleted 2 empty role(s).",
  data: {
    ...previewResponse.data,
    deletedRoleCount: 2,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CleanupRolesPanel", () => {
  it("requires the empty role count before deleting roles", async () => {
    vi.mocked(requestRoleCleanup)
      .mockResolvedValueOnce(previewResponse)
      .mockResolvedValueOnce(deleteResponse);

    render(<CleanupRolesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for empty roles" }));

    expect(await screen.findByText("empty-one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 role(s)" }));

    const confirmButton = await screen.findByRole("button", {
      name: "Delete roles",
    });
    expect(confirmButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Empty role count confirmation"), {
      target: { value: "2" },
    });
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(requestRoleCleanup).toHaveBeenLastCalledWith({ dryRun: false });
    });
  });
});

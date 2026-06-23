// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerSettingsPanel } from "./ServerSettingsPanel";
import { fetchIgnoredUsers } from "../../services/settings/ignoredUsers";
import type { IgnoredUser } from "../../models/types";

vi.mock("../../services/settings/ignoredUsers", () => ({
  addIgnoredUser: vi.fn(),
  fetchIgnoredUsers: vi.fn(),
  ignoredUsersExportUrl: "/api/ignored-users/export",
  importIgnoredUsers: vi.fn(),
  removeIgnoredUser: vi.fn(),
}));

const ignoredUser = (index: number): IgnoredUser => ({
  id: `ignored-${index}`,
  discordUserId: `10000000000000000${String(index).padStart(2, "0")}`,
  username: `user-${index}`,
  createdAt: "2026-05-21T12:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ServerSettingsPanel", () => {
  it("pages ignored users ten at a time", async () => {
    vi.mocked(fetchIgnoredUsers).mockResolvedValue({
      count: 11,
      users: Array.from({ length: 11 }, (_, index) => ignoredUser(index + 1)),
    });

    render(<ServerSettingsPanel />);

    expect(await screen.findByText("user-1")).toBeTruthy();
    expect(screen.queryByText("user-11")).toBeNull();
    expect(screen.getByText("1-10 of 11")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next ignored users page"));

    expect(await screen.findByText("user-11")).toBeTruthy();
    expect(screen.getByText("11-11 of 11")).toBeTruthy();
  });
});

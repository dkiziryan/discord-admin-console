// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "./Dashboard";
import { fetchJobHistory } from "../../services/jobs/jobHistory";
import type { AuthUser } from "../../services/auth/auth";

vi.mock("../../services/jobs/jobHistory", () => ({
  fetchJobHistory: vi.fn(),
}));

const user: AuthUser = {
  avatarUrl: null,
  authorizedGuilds: [{ id: "guild-1", name: "Test Guild" }],
  discordUserId: "user-1",
  isAuthorized: true,
  selectedGuildId: "guild-1",
  username: "tester",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard", () => {
  it("renders a compact activity summary from recent job history", async () => {
    vi.mocked(fetchJobHistory).mockResolvedValue([
      {
        createdAt: "2026-06-23T12:00:00.000Z",
        errorMessage: null,
        finishedAt: "2026-06-23T12:01:00.000Z",
        guildId: "guild-1",
        id: "job-1",
        startedAt: "2026-06-23T12:00:00.000Z",
        status: "completed",
        summary: "Inactive scan complete.",
        type: "inactive_scan",
      },
    ]);

    render(
      <Dashboard
        activePanelRequest={null}
        onSelectGuild={async () => undefined}
        user={user}
      />,
    );

    expect(await screen.findByText("Inactive-member scan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Server settings/ })).toBeNull();
    expect(screen.getByText("Running now")).toBeTruthy();
    await waitFor(() => {
      expect(fetchJobHistory).toHaveBeenCalledWith(6);
    });
  });
});

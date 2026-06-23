// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserBadge } from "./UserBadge";
import { fetchLocalDevSettings } from "../../services/settings/localDevSettings";
import type { AuthUser } from "../../services/auth/auth";

vi.mock("../../services/settings/localDevSettings", () => ({
  fetchLocalDevSettings: vi.fn(),
  updateLocalDevSettings: vi.fn(),
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

describe("UserBadge", () => {
  it("opens server settings from the account menu above activity history", () => {
    vi.mocked(fetchLocalDevSettings).mockResolvedValue({
      available: false,
      useProductionData: false,
    });
    const onOpenActivityHistory = vi.fn();
    const onOpenServerSettings = vi.fn();

    render(
      <UserBadge
        user={user}
        onLogout={vi.fn()}
        onOpenActivityHistory={onOpenActivityHistory}
        onOpenServerSettings={onOpenServerSettings}
      />,
    );

    fireEvent.click(screen.getByLabelText("Open account menu"));

    const settingsButton = screen.getByRole("button", {
      name: "Server settings",
    });
    const historyButton = screen.getByRole("button", {
      name: "Activity history",
    });
    const menuItems = Array.from(settingsButton.parentElement?.children ?? []);

    expect(menuItems.indexOf(settingsButton)).toBeLessThan(
      menuItems.indexOf(historyButton),
    );

    fireEvent.click(settingsButton);

    expect(onOpenServerSettings).toHaveBeenCalledTimes(1);
    expect(onOpenActivityHistory).not.toHaveBeenCalled();
  });
});

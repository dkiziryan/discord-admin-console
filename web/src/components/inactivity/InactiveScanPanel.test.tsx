// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InactiveScanPanel } from "./InactiveScanPanel";
import { fetchInactiveStatus } from "../../services/inactivity/inactiveStatus";
import { requestInactiveScan } from "../../services/inactivity/inactiveScan";
import type { InactiveScanResponse, InactiveScanStatus } from "../../models/types";

vi.mock("../../services/inactivity/inactiveStatus", () => ({
  fetchInactiveStatus: vi.fn(),
}));
vi.mock("../../services/inactivity/inactiveScan", () => ({
  requestInactiveScan: vi.fn(),
}));
vi.mock("../../services/inactivity/cancelInactiveScan", () => ({
  cancelInactiveScan: vi.fn(),
}));

const result: InactiveScanResponse = {
  message: "Inactive scan complete.",
  data: {
    guildName: "Test Guild",
    csvPath: "inactive-users.csv",
    cutoffIso: "2025-11-22T12:00:00.000Z",
    inactiveCount: 1,
    totalMembersChecked: 12,
    totalMessagesScanned: 42,
    skippedChannels: [],
    processedChannels: ["general"],
    previewNames: ["Alice"],
    moreCount: 0,
    skippedPreview: "",
  },
};

const completedStatus: InactiveScanStatus = {
  inProgress: false,
  currentChannel: null,
  currentIndex: 1,
  totalChannels: 1,
  processedChannels: 1,
  totalMessages: 42,
  startedAt: "2026-05-21T12:00:00.000Z",
  finishedAt: "2026-05-21T12:00:01.000Z",
  lastMessage: result.message,
  errorMessage: null,
  result,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InactiveScanPanel", () => {
  it("submits a full scan by default and renders polled results", async () => {
    vi.mocked(requestInactiveScan).mockResolvedValue();
    vi.mocked(fetchInactiveStatus).mockResolvedValue(completedStatus);

    render(<InactiveScanPanel />);

    expect(screen.queryByLabelText(/Excluded categories/)).toBeNull();
    expect(screen.queryByText(/Extra categories to exclude/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "180-day fast scan" }),
    ).toBeNull();
    expect(screen.getByLabelText(/Fast scan/)).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.getByLabelText(/Count thread creation/)).toHaveProperty(
      "checked",
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Scan inactive members" }));

    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(requestInactiveScan).toHaveBeenCalledWith({
      days: 180,
      countReactionsAsActivity: false,
      countThreadCreationAsActivity: true,
      maxMessagesPerChannel: undefined,
    });
  });

  it("applies the 365-day full scan preset", async () => {
    vi.mocked(fetchInactiveStatus).mockResolvedValue(null);

    render(<InactiveScanPanel />);

    fireEvent.click(screen.getByRole("button", { name: "365-day full scan" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan inactive members" }));

    expect(requestInactiveScan).toHaveBeenCalledWith({
      days: 365,
      countReactionsAsActivity: false,
      countThreadCreationAsActivity: true,
      maxMessagesPerChannel: undefined,
    });
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ZeroMessageScanner } from "./ZeroMessageScanner";
import { fetchScanStatus } from "../../services/zeroMessages/scanStatus";
import { requestZeroMessageScan } from "../../services/zeroMessages/zeroMessages";
import { fetchDefaultInactiveCategories } from "../../services/inactivity/inactiveDefaults";
import { fetchDefaultChannels } from "../../services/zeroMessages/defaultChannels";
import type { ScanResponse, ScanStatus } from "../../models/types";

vi.mock("../../services/zeroMessages/defaultChannels", () => ({
  fetchDefaultChannels: vi.fn(),
}));
vi.mock("../../services/inactivity/inactiveDefaults", () => ({
  fetchDefaultInactiveCategories: vi.fn(),
}));
vi.mock("../../services/zeroMessages/scanStatus", () => ({
  fetchScanStatus: vi.fn(),
}));
vi.mock("../../services/zeroMessages/zeroMessages", () => ({
  requestZeroMessageScan: vi.fn(),
}));
vi.mock("../../services/zeroMessages/cancelScan", () => ({
  cancelScan: vi.fn(),
}));

const result: ScanResponse = {
  message: "Zero-message scan complete.",
  channels: ["general"],
  data: {
    guildName: "Test Guild",
    csvPath: "zero-message-users.csv",
    zeroMessageCount: 1,
    totalMembersChecked: 12,
    totalMessagesScanned: 42,
    skippedChannels: [],
    processedChannels: ["general"],
    previewNames: ["Alice"],
    moreCount: 0,
    skippedPreview: "",
    scanMode: "exact",
    excludedCategories: ["Affiliate Vendors", "Private"],
    channelCoverage: [
      {
        channelName: "in-between",
        messagesScanned: 123,
        newestMessageAt: "2026-06-20T12:00:00.000Z",
        oldestMessageAt: "2026-05-29T12:00:00.000Z",
        reachedMessageLimit: false,
      },
    ],
    coverageWarning: null,
  },
};

const completedStatus: ScanStatus = {
  inProgress: false,
  currentChannel: null,
  currentIndex: 1,
  totalChannels: 1,
  processedChannels: 1,
  processedMembers: 12,
  totalMembers: 12,
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

describe("ZeroMessageScanner", () => {
  it("submits a blank all-channel scan and renders excluded defaults", async () => {
    vi.mocked(fetchDefaultChannels).mockResolvedValue([]);
    vi.mocked(fetchDefaultInactiveCategories).mockResolvedValue([
      "Affiliate Vendors",
      "Private",
    ]);
    vi.mocked(requestZeroMessageScan).mockResolvedValue();
    vi.mocked(fetchScanStatus).mockResolvedValue(completedStatus);

    render(<ZeroMessageScanner />);

    await waitFor(() => {
      expect(screen.getByLabelText("Target channels")).toHaveProperty(
        "value",
        "",
      );
    });
    expect(screen.queryByText(/Target channel names/)).toBeNull();
    expect(screen.getByText(/Default excluded categories:/)).toBeTruthy();
    expect(screen.getByText(/Affiliate Vendors/)).toBeTruthy();
    expect(screen.getByText(/Private/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Scan for zero-message users" }));

    expect(await screen.findByText("Scan results")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText(/in-between: 123 messages scanned/)).toBeTruthy();
    expect(requestZeroMessageScan).toHaveBeenCalledWith({
      countReactionsAsActivity: false,
      dryRun: false,
    });
  });

  it("renders coverage warnings from approximate scans", async () => {
    vi.mocked(fetchDefaultChannels).mockResolvedValue([]);
    vi.mocked(fetchDefaultInactiveCategories).mockResolvedValue([]);
    vi.mocked(requestZeroMessageScan).mockResolvedValue();
    vi.mocked(fetchScanStatus).mockResolvedValue({
      ...completedStatus,
      result: {
        ...result,
        data: {
          ...result.data,
          scanMode: "fast",
          coverageWarning:
            "Fast scan reached the message limit in in-between. Older posts may not have been scanned.",
        },
      },
    });

    render(<ZeroMessageScanner />);

    fireEvent.click(screen.getByRole("button", { name: "Scan for zero-message users" }));

    expect(await screen.findByText(/Fast scan reached the message limit/)).toBeTruthy();
  });

  it("warns that fast scan is approximate", async () => {
    vi.mocked(fetchDefaultChannels).mockResolvedValue([]);
    vi.mocked(fetchDefaultInactiveCategories).mockResolvedValue([]);
    vi.mocked(fetchScanStatus).mockResolvedValue(null);

    render(<ZeroMessageScanner />);

    fireEvent.click(screen.getByLabelText(/Fast scan/));

    expect(screen.getByText(/Fast scan can miss older posts/)).toBeTruthy();
  });

  it("applies saved server default channels as a preset", async () => {
    vi.mocked(fetchDefaultChannels).mockResolvedValue(["general", "support"]);
    vi.mocked(fetchDefaultInactiveCategories).mockResolvedValue([]);

    render(<ZeroMessageScanner />);

    fireEvent.click(await screen.findByRole("button", { name: "Server defaults" }));

    expect(screen.getByLabelText("Target channels")).toHaveProperty(
      "value",
      "general\nsupport",
    );
  });
});

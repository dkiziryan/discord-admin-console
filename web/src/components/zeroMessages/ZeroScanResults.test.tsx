// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ZeroScanResults } from "./ZeroScanResults";
import type { ScanResponse } from "../../models/types";

const result: ScanResponse = {
  channels: ["general"],
  message: "Zero-message scan complete.",
  data: {
    channelCoverage: Array.from({ length: 12 }, (_, index) => ({
      channelName: `coverage-${index + 1}`,
      messagesScanned: index + 1,
      newestMessageAt: null,
      oldestMessageAt: null,
      reachedMessageLimit: false,
    })),
    coverageWarning: null,
    csvPath: "zero-message-users.csv",
    excludedCategories: [],
    guildName: "Test Guild",
    moreCount: 0,
    previewNames: ["Alice"],
    processedChannels: ["general"],
    scanMode: "exact",
    skippedChannels: Array.from(
      { length: 12 },
      (_, index) => `skipped-${index + 1}`,
    ),
    skippedPreview: "",
    totalMembersChecked: 12,
    totalMessagesScanned: 42,
    zeroMessageCount: 1,
  },
};

afterEach(() => {
  cleanup();
});

describe("ZeroScanResults", () => {
  it("previews ten covered and skipped channels, with paginated full views", () => {
    render(
      <ZeroScanResults
        result={result}
        previewLines={["Alice"]}
        statusMessage={null}
        onRunAnotherScan={vi.fn()}
      />,
    );

    expect(screen.getByText(/coverage-10: 10 messages scanned/)).toBeTruthy();
    expect(screen.queryByText(/coverage-11/)).toBeNull();
    expect(screen.getByText("skipped-10")).toBeTruthy();
    expect(screen.queryByText("skipped-11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View full coverage" }));

    expect(screen.getByText("Full channel coverage")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByText(/coverage-11/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(/coverage-11: 11 messages scanned/)).toBeTruthy();
    expect(screen.getByText(/coverage-12: 12 messages scanned/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to scan results" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View full skipped" }));

    expect(screen.getByText("Full skipped channels")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByText("skipped-11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("skipped-11")).toBeTruthy();
    expect(screen.getByText("skipped-12")).toBeTruthy();
  });

  it("collapses and expands coverage previews", () => {
    render(
      <ZeroScanResults
        result={result}
        previewLines={["Alice"]}
        statusMessage={null}
        onRunAnotherScan={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]);

    expect(screen.queryByText(/coverage-1: 1 messages scanned/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText(/coverage-1: 1 messages scanned/)).toBeTruthy();
  });
});

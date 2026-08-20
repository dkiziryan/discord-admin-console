// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityHistoryPanel } from "./ActivityHistoryPanel";
import { fetchJobHistory } from "../../services/jobs/jobHistory";
import { formatJobDate } from "../../utils/jobHistory";

vi.mock("../../services/jobs/jobHistory", () => ({
  fetchJobHistory: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityHistoryPanel", () => {
  it("shows the remove-threads-by-tag action with its recorded date", async () => {
    const createdAt = "2026-08-20T22:18:28.000Z";
    vi.mocked(fetchJobHistory).mockResolvedValue([
      {
        createdAt,
        errorMessage: null,
        finishedAt: "2026-08-20T22:18:30.000Z",
        guildId: "guild-1",
        id: "job-1",
        startedAt: createdAt,
        status: "completed",
        summary: "Archived 2 thread(s) tagged WTB.",
        type: "remove_threads_by_tag",
      },
    ]);

    render(<ActivityHistoryPanel />);

    expect(await screen.findByText("Remove threads by tag")).toBeTruthy();
    expect(screen.getByText(formatJobDate(createdAt))).toBeTruthy();
  });
});

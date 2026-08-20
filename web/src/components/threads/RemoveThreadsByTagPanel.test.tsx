// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoveThreadsByTagPanel } from "./RemoveThreadsByTagPanel";
import { requestRemoveThreadsByTag } from "../../services/threads/removeThreadsByTag";
import type { RemoveThreadsByTagResponse } from "../../models/types";

vi.mock("../../services/threads/removeThreadsByTag", () => ({
  requestRemoveThreadsByTag: vi.fn(),
}));

const previewResponse: RemoveThreadsByTagResponse = {
  message: "Found 4 thread(s) tagged WTB; 2 included in this batch.",
  data: {
    action: "archive",
    alreadyArchivedCount: 0,
    failures: [],
    limit: 2,
    matchingThreads: [
      {
        archived: false,
        createdAt: "2026-08-20T22:18:28.000Z",
        id: "thread-1",
        name: "Wanted boots",
        parentChannelId: "forum-1",
        parentChannelName: "market-a",
      },
      {
        archived: true,
        createdAt: "2026-08-19T22:18:28.000Z",
        id: "thread-2",
        name: "Wanted jacket",
        parentChannelId: "forum-2",
        parentChannelName: "market-b",
      },
    ],
    moreCount: 2,
    processedCount: 0,
    tag: "wtb",
    totalMatchingCount: 4,
  },
};

const deletedResponse: RemoveThreadsByTagResponse = {
  message: "Deleted 2 thread(s) tagged WTB.",
  data: {
    ...previewResponse.data,
    action: "delete",
    matchingThreads: [],
    moreCount: 0,
    processedCount: 2,
    totalMatchingCount: 2,
  },
};

const failedResponse: RemoveThreadsByTagResponse = {
  message: "Archived 1 thread(s) tagged WTB. 1 failed.",
  data: {
    ...previewResponse.data,
    failures: ["thread-2: Missing Access"],
    matchingThreads: [],
    moreCount: 0,
    processedCount: 1,
    totalMatchingCount: 2,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RemoveThreadsByTagPanel", () => {
  it("deletes only the limited, previewed batch after count confirmation", async () => {
    vi.mocked(requestRemoveThreadsByTag)
      .mockResolvedValueOnce(previewResponse)
      .mockResolvedValueOnce(deletedResponse);

    render(<RemoveThreadsByTagPanel />);

    fireEvent.change(screen.getByLabelText("Thread tag"), {
      target: { value: "wtb" },
    });
    fireEvent.change(screen.getByLabelText("Batch limit"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Preview matching threads" }),
    );

    expect(await screen.findByText("Wanted boots")).toBeTruthy();
    expect(
      screen.getByText("2 additional matching thread(s) will not be processed."),
    ).toBeTruthy();
    expect(requestRemoveThreadsByTag).toHaveBeenNthCalledWith(1, {
      dryRun: true,
      limit: 2,
      tag: "wtb",
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete all 2" }));
    const confirmButton = await screen.findByRole("button", {
      name: "Delete threads",
    });
    expect(confirmButton).toHaveProperty("disabled", true);

    fireEvent.change(
      screen.getByLabelText("Previewed thread count confirmation"),
      { target: { value: "2" } },
    );
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(requestRemoveThreadsByTag).toHaveBeenLastCalledWith({
        action: "delete",
        dryRun: false,
        limit: 2,
        tag: "wtb",
        threadIds: ["thread-1", "thread-2"],
      });
    });
  });

  it("renders an action result with failures as an error", async () => {
    vi.mocked(requestRemoveThreadsByTag)
      .mockResolvedValueOnce(previewResponse)
      .mockResolvedValueOnce(failedResponse);

    render(<RemoveThreadsByTagPanel />);

    fireEvent.change(screen.getByLabelText("Thread tag"), {
      target: { value: "wtb" },
    });
    fireEvent.change(screen.getByLabelText("Batch limit"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Preview matching threads" }),
    );

    await screen.findByText("Wanted boots");
    fireEvent.click(screen.getByRole("button", { name: "Archive all 2" }));
    fireEvent.change(
      screen.getByLabelText("Previewed thread count confirmation"),
      { target: { value: "2" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive threads" }));

    const errorStatus = await screen.findByText(failedResponse.message);
    expect(errorStatus.classList.contains("error")).toBe(true);
    expect(errorStatus.classList.contains("success")).toBe(false);
    expect(screen.getByText("thread-2: Missing Access")).toBeTruthy();
  });
});

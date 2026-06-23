// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchiveChannelsPanel } from "./ArchiveChannelsPanel";
import { requestArchiveChannels } from "../../services/archive/archiveChannels";
import { fetchDefaultInactiveCategories } from "../../services/inactivity/inactiveDefaults";
import type { ArchiveChannelsResponse } from "../../models/types";

vi.mock("../../services/archive/archiveChannels", () => ({
  requestArchiveChannels: vi.fn(),
}));

vi.mock("../../services/inactivity/inactiveDefaults", () => ({
  fetchDefaultInactiveCategories: vi.fn(),
}));

const previewResponse: ArchiveChannelsResponse = {
  message: "Found 2 inactive channel(s).",
  data: {
    action: "archive",
    archiveCategoryId: null,
    days: 90,
    failures: [],
    inactiveChannels: [
      { id: "channel-1", name: "general", lastMessageAt: null },
      { id: "channel-2", name: "random", lastMessageAt: null },
    ],
    processedCount: 0,
  },
};

const archivedResponse: ArchiveChannelsResponse = {
  message: "Archived 2 channel(s).",
  data: {
    ...previewResponse.data,
    inactiveChannels: [],
    processedCount: 2,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ArchiveChannelsPanel", () => {
  it("requires the selected channel count before archiving channels", async () => {
    vi.mocked(fetchDefaultInactiveCategories).mockResolvedValue(["Private"]);
    vi.mocked(requestArchiveChannels)
      .mockResolvedValueOnce(previewResponse)
      .mockResolvedValueOnce(archivedResponse);

    render(<ArchiveChannelsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Preview inactive channels" }));

    expect(await screen.findByText("#general")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive 2 selected" }));

    const confirmButton = await screen.findByRole("button", {
      name: "Archive channels",
    });
    expect(confirmButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Selected channel count confirmation"), {
      target: { value: "2" },
    });
    expect(confirmButton).toHaveProperty("disabled", false);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(requestArchiveChannels).toHaveBeenLastCalledWith({
        action: "archive",
        channelIds: ["channel-1", "channel-2"],
        days: 90,
        dryRun: false,
      });
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScanStatus } from "../../models/types";
import { fetchScanStatus } from "./scanStatus";

const status: ScanStatus = {
  inProgress: false,
  currentChannel: null,
  currentIndex: 0,
  totalChannels: 0,
  processedChannels: 0,
  processedMembers: 0,
  totalMembers: 0,
  startedAt: null,
  finishedAt: null,
  lastMessage: null,
  errorMessage: null,
  result: null,
};

describe("fetchScanStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bypasses browser caches when polling scan status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(status), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchScanStatus();

    expect(result).toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan-status",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
  });
});

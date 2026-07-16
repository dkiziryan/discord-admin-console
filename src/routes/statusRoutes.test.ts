import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

import express from "express";

import type { ScanStatus } from "../models/types";
import { registerStatusRoutes } from "./statusRoutes";

const listen = (app: express.Application): Promise<Server> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

test("scan status responses are not cacheable", async (t) => {
  const app = express();
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

  registerStatusRoutes(app, {
    activeCancellationByGuild: new Map(),
    getInactiveStatus: () => ({
      inProgress: false,
      currentChannel: null,
      currentIndex: 0,
      totalChannels: 0,
      processedChannels: 0,
      totalMessages: 0,
      startedAt: null,
      finishedAt: null,
      lastMessage: null,
      errorMessage: null,
      result: null,
    }),
    getScanStatus: () => status,
    inactiveCancellationByGuild: new Map(),
    isInactiveProcessingByGuild: new Map(),
    isKickProcessingByGuild: new Map(),
    isProcessingByGuild: new Map(),
    kickCancellationByGuild: new Map(),
    requireSelectedGuildId: () => "guild-test",
    updateInactiveStatus: () => undefined,
    updateScanStatus: () => undefined,
  });

  const server = await listen(app);
  t.after(() => {
    server.close();
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/scan-status`,
  );

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), status);
});

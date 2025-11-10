import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";

import {
  isAuthenticatedRequest,
  isAuthorizedRequest,
} from "../utils/authSession";

const asRequest = (req: unknown): Request => req as Request;

test("isAuthenticatedRequest returns true when auth user is present", () => {
  const req = asRequest({
    session: {
      authUser: {
        discordUserId: "user-1",
        username: "tester",
        avatarUrl: null,
        isAuthorized: true,
        authorizedGuilds: [{ id: "guild-1", name: "Test Guild" }],
        selectedGuildId: "guild-1",
      },
    },
  });

  assert.equal(isAuthenticatedRequest(req), true);
});

test("isAuthenticatedRequest returns false when auth user is missing", () => {
  const req = asRequest({
    session: {},
  });

  assert.equal(isAuthenticatedRequest(req), false);
});

test("isAuthorizedRequest returns true when auth user is authorized", () => {
  const req = asRequest({
    session: {
      authUser: {
        discordUserId: "user-1",
        username: "tester",
        avatarUrl: null,
        isAuthorized: true,
        authorizedGuilds: [{ id: "guild-1", name: "Test Guild" }],
        selectedGuildId: "guild-1",
      },
    },
  });

  assert.equal(isAuthorizedRequest(req), true);
});

test("isAuthorizedRequest returns false when auth user is unauthorized", () => {
  const req = asRequest({
    session: {
      authUser: {
        discordUserId: "user-1",
        username: "tester",
        avatarUrl: null,
        isAuthorized: false,
        authorizedGuilds: [],
        selectedGuildId: null,
      },
    },
  });

  assert.equal(isAuthorizedRequest(req), false);
});

test("isAuthorizedRequest returns false when no guild is selected", () => {
  const req = asRequest({
    session: {
      authUser: {
        discordUserId: "user-1",
        username: "tester",
        avatarUrl: null,
        isAuthorized: true,
        authorizedGuilds: [{ id: "guild-1", name: "Test Guild" }],
        selectedGuildId: null,
      },
    },
  });

  assert.equal(isAuthorizedRequest(req), false);
});

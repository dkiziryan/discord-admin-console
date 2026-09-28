import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import * as prismaClient from "../../utils/prismaClient";
import { authenticateDiscordUser, buildDiscordLoginUrl } from "./discordOAuth";

const CLIENT_SECRET = "test-client-secret";
const AUTH_CODE = "test-authorization-code";
const ACCESS_TOKEN = "test-access-token";
const REDIRECT_URI = "https://console.example/auth/discord/callback";

const setup = (t: TestContext) => {
  const env = {
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: CLIENT_SECRET,
    DISCORD_OAUTH_REDIRECT_URI: REDIRECT_URI,
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    });
  }

  const upsert = t.mock.fn(async (_args: unknown) => ({}));
  t.mock.method(prismaClient, "getPrismaClient", async () => ({
    user: { upsert },
  }));
  const log = t.mock.method(console, "error", () => undefined);
  return { upsert, log };
};

const failureCases = [
  {
    name: "invalid client credentials",
    status: 401,
    error: "invalid_client",
    hint: "Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET",
  },
  {
    name: "invalid authorization code",
    status: 400,
    error: "invalid_grant",
    hint: "Start a new login from the dashboard.",
  },
  {
    name: "invalid token request",
    status: 400,
    error: "invalid_request",
    hint: "including DISCORD_OAUTH_REDIRECT_URI",
  },
  {
    name: "unauthorized application",
    status: 400,
    error: "unauthorized_client",
    hint: "not authorized to use this OAuth grant",
  },
  {
    name: "unsupported grant",
    status: 400,
    error: "unsupported_grant_type",
    hint: "rejected the OAuth grant type",
  },
  {
    name: "invalid scope",
    status: 400,
    error: "invalid_scope",
    hint: "rejected the requested OAuth scope",
  },
  {
    name: "rate limit",
    status: 429,
    hint: "Wait a few minutes",
  },
  {
    name: "non-JSON service failure",
    status: 502,
    body: "<html>Bad gateway</html>",
    hint: "temporarily unavailable",
  },
  {
    name: "empty response",
    status: 400,
    body: "",
    hint: "check the backend application logs",
  },
  {
    name: "null response",
    status: 400,
    body: "null",
    hint: "check the backend application logs",
  },
  {
    name: "non-string error code",
    status: 400,
    body: '{"error":{"unexpected":"value"}}',
    hint: "check the backend application logs",
  },
  {
    name: "unrecognized error containing secrets",
    status: 400,
    body: JSON.stringify({ error: `${CLIENT_SECRET} ${AUTH_CODE} ${ACCESS_TOKEN}` }),
    hint: "check the backend application logs",
  },
  {
    name: "inherited object property is not an OAuth error",
    status: 400,
    body: '{"error":"constructor"}',
    hint: "check the backend application logs",
  },
];

for (const scenario of failureCases) {
  test(`Discord token exchange reports ${scenario.name} safely`, async (t) => {
    const { upsert, log } = setup(t);
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      new Response(
        scenario.body ??
          JSON.stringify({
            error: scenario.error,
            error_description: `${CLIENT_SECRET} ${AUTH_CODE} ${ACCESS_TOKEN}`,
            access_token: ACCESS_TOKEN,
          }),
        { status: scenario.status },
      ),
    );

    await assert.rejects(authenticateDiscordUser(AUTH_CODE), (error: Error) => {
      assert.ok(error.message.includes(`HTTP ${scenario.status}`));
      assert.ok(error.message.includes(scenario.hint));
      if (scenario.error) {
        assert.ok(error.message.includes(scenario.error));
        assert.equal(log.mock.calls[0].arguments[1].oauthError, scenario.error);
      } else {
        assert.equal(log.mock.calls[0].arguments[1].oauthError, "unknown");
      }
      const diagnostics =
        error.message + JSON.stringify(log.mock.calls[0].arguments);
      for (const secret of [CLIENT_SECRET, AUTH_CODE, ACCESS_TOKEN]) {
        assert.ok(!diagnostics.includes(secret));
      }
      return true;
    });

    assert.equal(log.mock.callCount(), 1);
    assert.equal(log.mock.calls[0].arguments[1].status, scenario.status);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(upsert.mock.callCount(), 0);
  });
}

for (const avatar of [null, "avatar-hash"]) {
  test(`Discord login still succeeds with avatar ${avatar}`, async (t) => {
    const { upsert, log } = setup(t);
    const loginUrl = new URL(buildDiscordLoginUrl("test-state"));
    const fetchMock = t.mock.method(globalThis, "fetch", async (
      url: Parameters<typeof fetch>[0],
      options?: RequestInit,
    ) => {
      if (url === "https://discord.com/api/v10/oauth2/token") {
        assert.equal(options?.method, "POST");
        assert.equal(
          new Headers(options?.headers).get("Content-Type"),
          "application/x-www-form-urlencoded",
        );
        assert.ok(options?.body instanceof URLSearchParams);
        assert.deepEqual(Object.fromEntries(options.body), {
          client_id: loginUrl.searchParams.get("client_id"),
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code: AUTH_CODE,
          redirect_uri: loginUrl.searchParams.get("redirect_uri"),
        });
        return Response.json({ access_token: ACCESS_TOKEN });
      }
      assert.equal(url, "https://discord.com/api/v10/users/@me");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        `Bearer ${ACCESS_TOKEN}`,
      );
      return Response.json({ id: "user-1", username: "tester", avatar });
    });

    const user = await authenticateDiscordUser(AUTH_CODE);

    assert.deepEqual(user, {
      discordUserId: "user-1",
      username: "tester",
      avatarUrl: avatar
        ? `https://cdn.discordapp.com/avatars/user-1/${avatar}.png`
        : null,
    });
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(upsert.mock.callCount(), 1);
    assert.equal(log.mock.callCount(), 0);
  });
}

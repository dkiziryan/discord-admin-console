import assert from "node:assert/strict";
import test from "node:test";
import type { Application, Request, Response } from "express";
import { registerMemberRoleRoutes } from "./memberRoleRoute";

type Handler = (req: Request, res: Response) => Promise<void>;
const fixture = () => {
  const handlers = new Map<string, Handler>();
  let status = 200;
  let body: unknown;
  let selected = "1";
  let authenticated = "actor";
  let ready = true;
  let permission = true;
  const app = {
    get: (_path: string, handler: Handler) => handlers.set("get", handler),
    post: (_path: string, handler: Handler) => handlers.set("post", handler),
  };
  const res = {
    status: (code: number) => { status = code; return res; },
    json: (value: unknown) => { body = value; return res; },
    setHeader: () => res,
  };
  const client = {
    isReady: () => ready,
    guilds: { fetch: async () => ({
      id: "1", name: "Guild", ownerId: "owner",
      roles: { fetch: async () => new Map([["10", { id: "10", name: "Member", managed: false, editable: true }]]) },
      members: {
        fetch: async () => ({ id: "actor", permissions: { has: () => permission }, roles: { highest: { comparePositionTo: () => 1 } } }),
        fetchMe: async () => ({ permissions: { has: () => permission } }),
      },
    }) },
    rest: { get: async () => [] },
  };
  registerMemberRoleRoutes(app as unknown as Application, {
    client: client as never,
    requireSelectedGuildId: () => { if (!selected) res.status(400).json({ message: "Select a server" }); return selected || null; },
    requireAuthenticatedDiscordUserId: () => { if (!authenticated) res.status(401).json({ message: "Sign in" }); return authenticated || null; },
  });
  return {
    invoke: async (method: string, input?: unknown) => {
      await handlers.get(method)!({ body: input } as Request, res as unknown as Response);
      return { status, body };
    },
    noGuild: () => { selected = ""; }, noAuth: () => { authenticated = ""; },
    notReady: () => { ready = false; }, deny: () => { permission = false; },
  };
};
for (const method of ["get", "post"]) {
  for (const [setup, expected] of [["noGuild", 400], ["noAuth", 401], ["notReady", 503]] as const) {
    test(`${method} rejects ${setup}`, async () => {
      const f = fixture(); f[setup]();
      assert.equal((await f.invoke(method)).status, expected);
    });
  }
}
test("GET lists roles for the selected server", async () => {
  const result = await fixture().invoke("get");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { roles: [{ id: "10", name: "Member", canUpdate: true }] });
});
test("POST validates malformed requests", async () => {
  assert.equal((await fixture().invoke("post", { action: "delete" })).status, 400);
});
test("POST returns forbidden for insufficient role permissions", async () => {
  const f = fixture(); f.deny();
  assert.equal((await f.invoke("post", { action: "add", roleId: "10", excludedRoleIds: [] })).status, 403);
});
test("POST defaults to preview and releases its guild lock", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const result = await f.invoke("post", { action: "add", roleId: "10", excludedRoleIds: [] });
    assert.equal(result.status, 200);
    assert.match((result.body as { message: string }).message, /0 member/);
  }
});

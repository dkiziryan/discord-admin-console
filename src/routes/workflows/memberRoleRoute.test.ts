import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import type { Application, Request, Response } from "express";
import type { MemberRoleJobStatus } from "../../shared/apiTypes";
import { registerMemberRoleRoutes } from "./memberRoleRoute";

type Handler = (req: Request, res: Response) => void | Promise<void>;
const request = { action: "add", roleId: "10", excludedRoleIds: [] };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const fixture = () => {
  const handlers = new Map<string, Handler>();
  let status = 200;
  let body: unknown;
  let cacheControl: unknown;
  let selected = "1";
  let authenticated = "actor";
  let ready = true;
  let permission = true;
  const app = {
    get: (path: string, handler: Handler) => handlers.set(`get:${path}`, handler),
    post: (path: string, handler: Handler) => handlers.set(`post:${path}`, handler),
  };
  const res = {
    status: (code: number) => { status = code; return res; },
    json: (value: unknown) => { body = structuredClone(value); return res; },
    setHeader: (_key: string, value: unknown) => { cacheControl = value; return res; },
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
    rest: Object.assign(new EventEmitter(), { get: async (): Promise<unknown[]> => [] }),
  };
  registerMemberRoleRoutes(app as unknown as Application, {
    client: client as never,
    requireSelectedGuildId: () => { if (!selected) res.status(400).json({ message: "Select a server" }); return selected || null; },
    requireAuthenticatedDiscordUserId: () => { if (!authenticated) res.status(401).json({ message: "Sign in" }); return authenticated || null; },
  });
  return {
    invoke: async (method: string, input?: unknown, path = "/api/member-roles") => {
      status = 200;
      await handlers.get(`${method}:${path}`)!({ body: input } as Request, res as unknown as Response);
      return { status, body, cacheControl };
    },
    noGuild: () => { selected = ""; }, noAuth: () => { authenticated = ""; },
    notReady: () => { ready = false; }, deny: () => { permission = false; },
    select: (id: string) => { selected = id; }, client,
  };
};
const readStatus = async (f: ReturnType<typeof fixture>) => {
  const result = await f.invoke("get", undefined, "/api/member-roles/status");
  return (result.body as { job: MemberRoleJobStatus | null }).job;
};
for (const method of ["get", "post"]) {
  for (const [setup, expected] of [["noGuild", 400], ["noAuth", 401], ["notReady", 503]] as const) {
    test(`${method} rejects ${setup}`, async () => {
      const f = fixture(); f[setup]();
      assert.equal((await f.invoke(method)).status, expected);
    });
  }
}
for (const [setup, expected] of [["noGuild", 400], ["noAuth", 401]] as const) {
  test(`status requires ${setup === "noGuild" ? "a selected guild" : "authentication"}`, async () => {
    const f = fixture(); f[setup]();
    assert.equal((await f.invoke("get", undefined, "/api/member-roles/status")).status, expected);
  });
}
test("GET lists roles for the selected server", async () => {
  const result = await fixture().invoke("get");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { roles: [{ id: "10", name: "Member", canUpdate: true }] });
});
test("POST validates malformed requests before starting work", async () => {
  const f = fixture();
  assert.equal((await f.invoke("post", { action: "delete" })).status, 400);
  assert.equal(await readStatus(f), null);
});
test("POST returns immediately and status retains the dry-run result", async () => {
  const f = fixture();
  const accepted = await f.invoke("post", request);
  assert.equal(accepted.status, 202);
  assert.equal((accepted.body as { job: MemberRoleJobStatus }).job.phase, "preparing");
  await tick();
  const status = await readStatus(f);
  assert.equal(status?.inProgress, false);
  assert.equal(status?.request.dryRun, true);
  assert.match(status?.result?.message ?? "", /Dry run: 0 member/);
  assert.ok(status?.finishedAt);
  assert.equal((await f.invoke("get", undefined, "/api/member-roles/status")).cacheControl, "no-store");
  assert.equal((await f.invoke("post", request)).status, 202);
  await tick();
});
test("failed jobs expose errors and allow another run", async () => {
  const f = fixture(); f.deny();
  assert.equal((await f.invoke("post", request)).status, 202);
  await tick();
  const status = await readStatus(f);
  assert.equal(status?.phase, "failed");
  assert.match(status?.errorMessage ?? "", /Manage Roles/);
  assert.equal(status?.inProgress, false);
  assert.equal((await f.invoke("post", request)).status, 202);
  await tick();
});
test("running jobs block duplicates, survive status reads, and remain scoped to their guild", async () => {
  const f = fixture();
  let release!: () => void;
  f.client.rest.get = () => new Promise(resolve => { release = () => resolve([]); });
  await f.invoke("post", request);
  await tick();
  assert.equal((await readStatus(f))?.phase, "scanning");
  assert.equal((await f.invoke("post", request)).status, 409);
  assert.equal((await readStatus(f))?.inProgress, true);
  f.select("2");
  assert.equal(await readStatus(f), null);
  f.select("1");
  release();
  await tick();
  assert.equal((await readStatus(f))?.phase, "completed");
});

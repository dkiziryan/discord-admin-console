import assert from "node:assert/strict";
import test from "node:test";
import { listMemberRoles, parseRoleUpdateRequest, updateMemberRoles } from "./updateMemberRoles";

const request = { action: "add" as "add" | "remove", roleId: "10", excludedRoleIds: ["20", "30"], dryRun: true };
const member = (id: string, roles: string[] = [], bot = false) => ({ user: { id, username: `user-${id}`, bot }, roles });
const fixture = () => {
  const writes: string[] = [];
  let canManage = true;
  let above = true;
  let editable = true;
  const roles = new Map(["10", "20", "30", "40", "1"].map(id => [id, {
    id, name: id, managed: id === "40", get editable() { return editable; },
  }]));
  const members = [member("101"), member("102", ["20"]), member("103", ["30"]),
    member("104", ["10"]), member("105", [], true), member("106")];
  let pages = [members];
  const current = new Map(members.map(value => [value.user.id, value]));
  const guild = { id: "1", name: "Guild", ownerId: "owner", roles: { fetch: async () => roles }, members: {
    fetch: async () => ({ id: "actor", permissions: { has: () => canManage }, roles: { highest: { comparePositionTo: () => above ? 1 : 0 } } }),
    fetchMe: async () => ({ permissions: { has: () => canManage } }),
  } };
  const client = { guilds: { fetch: async () => guild }, rest: {
    get: async (route: string) => route.endsWith("/members") ? pages.shift() ?? [] : current.get(route.split("/").at(-1)!),
    put: async (route: string) => { writes.push(`add:${route}`); },
    delete: async (route: string) => { writes.push(`remove:${route}`); },
  } };
  return { client, writes, current, setPages: (value: typeof pages) => { pages = value; },
    setRoleName: (id: string, name: string) => { roles.get(id)!.name = name; },
    deny: () => { canManage = false; }, lower: () => { above = false; }, uneditable: () => { editable = false; } };
};

for (const action of ["add", "remove"] as const) {
  test(`${action} previews only humans without any excluded role and needing a change`, async () => {
    const f = fixture();
    const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action });
    assert.equal(result.data.matchedCount, action === "add" ? 2 : 1);
    assert.equal(result.data.totalMembers, 6);
    assert.equal(result.data.updatedCount, 0);
    assert.deepEqual(f.writes, []);
  });
  test(`${action} uses single-role mutations and rechecks exclusions`, async () => {
    const f = fixture();
    f.current.set("101", member("101", ["20"]));
    const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action, dryRun: false });
    assert.equal(result.data.updatedCount, 1);
    assert.equal(result.data.skippedCount, action === "add" ? 1 : 0);
    assert.equal(f.writes.length, 1);
    assert.match(f.writes[0]!, new RegExp(`^${action}:.*roles/10$`));
  });
}

for (const body of [null, {}, { ...request, action: "delete" }, { ...request, roleId: "bad" },
  { ...request, excludedRoleIds: ["10"] }, { ...request, excludedRoleIds: [null] }, { ...request, dryRun: "false" }]) {
  test(`rejects invalid request ${JSON.stringify(body)}`, () => assert.throws(() => parseRoleUpdateRequest(body)));
}
test("requests default to preview and deduplicate exclusions", () => {
  assert.deepEqual(parseRoleUpdateRequest({ ...request, dryRun: undefined, excludedRoleIds: ["20", "20"] }), { ...request, excludedRoleIds: ["20"] });
});
for (const mode of ["deny", "lower", "uneditable"] as const) {
  test(`blocks mutation for ${mode} permissions or hierarchy`, async () => {
    const f = fixture(); f[mode]();
    await assert.rejects(updateMemberRoles(f.client as never, "1", "actor", { ...request, dryRun: false }));
    assert.deepEqual(f.writes, []);
  });
}
test("lists exclusion roles while marking managed and everyone roles unavailable", async () => {
  const f = fixture();
  const roles = await listMemberRoles(f.client as never, "1", "actor");
  assert.equal(roles.some(role => role.id === "1"), false);
  assert.equal(roles.find(role => role.id === "40")?.canUpdate, false);
  assert.equal(roles.find(role => role.id === "10")?.canUpdate, true);
});
test("rejects deleted exclusion roles before any writes", async () => {
  const f = fixture();
  await assert.rejects(updateMemberRoles(f.client as never, "1", "actor", { ...request, excludedRoleIds: ["99"], dryRun: false }));
  assert.deepEqual(f.writes, []);
});
test("reads subsequent pages rather than relying on cached guild members", async () => {
  const f = fixture();
  f.setPages([Array.from({ length: 1000 }, (_, index) => member(String(index + 1000))), [member("2001")]]);
  const result = await updateMemberRoles(f.client as never, "1", "actor", request);
  assert.equal(result.data.matchedCount, 1001);
  assert.equal(result.data.previewNames.length, 10);
});
test("reports member failures and continues the batch", async () => {
  const f = fixture();
  f.client.rest.put = async route => { if (route.includes("/101/")) throw new Error("Missing access"); f.writes.push(route); };
  const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, dryRun: false });
  assert.equal(result.data.updatedCount, 1);
  assert.equal(result.data.failures.length, 1);
});
test("aborts incomplete pagination before mutations", async () => {
  const f = fixture();
  const page = Array.from({ length: 1000 }, (_, index) => member(String(index + 1000)));
  f.setPages([page, page]);
  await assert.rejects(updateMemberRoles(f.client as never, "1", "actor", { ...request, dryRun: false }), /finish reading|duplicate members/);
  assert.deepEqual(f.writes, []);
});

for (const action of ["add", "remove"] as const) {
  for (const dryRun of [true, false]) {
    test(`${action} with explicit users and dryRun=${dryRun} never targets other members`, async () => {
      const f = fixture();
      const result = await updateMemberRoles(f.client as never, "1", "actor", {
        ...request, action, dryRun, userIds: [action === "add" ? "101" : "104", "102"],
      });
      assert.equal(result.data.totalMembers, 2);
      assert.equal(result.data.matchedCount, 1);
      assert.equal(result.data.updatedCount, dryRun ? 0 : 1);
      assert.equal(f.writes.length, dryRun ? 0 : 1);
      assert.equal(f.writes.some(route => route.includes("/106/")), false);
      if (dryRun) assert.match(result.message, /Dry run:.*No roles were changed/);
    });
  }
}
for (const userIds of [[], ["bad"], [null], "101", ["0"], Array(101).fill("101")]) {
  test(`rejects invalid explicit users ${JSON.stringify(userIds).slice(0, 50)}`, () => {
    assert.throws(() => parseRoleUpdateRequest({ ...request, userIds }), /valid Discord user IDs/);
  });
}
test("deduplicates explicit users", () => {
  assert.deepEqual(parseRoleUpdateRequest({ ...request, userIds: ["101", "101"] }).userIds, ["101"]);
});
test("unknown explicit user aborts before changing any members", async () => {
  const f = fixture();
  await assert.rejects(updateMemberRoles(f.client as never, "1", "actor", {
    ...request, dryRun: false, userIds: ["101", "999"],
  }), /No roles were changed/);
  assert.deepEqual(f.writes, []);
});
test("explicit users do not invoke the full member scan", async () => {
  const f = fixture();
  const originalGet = f.client.rest.get;
  f.client.rest.get = async route => {
    assert.equal(route.endsWith("/members"), false);
    return originalGet(route);
  };
  await updateMemberRoles(f.client as never, "1", "actor", { ...request, userIds: ["101"] });
});

for (const action of ["add", "remove"] as const) {
  test(`${action} reports scanning, batch progress and partial failures accurately`, async () => {
    const f = fixture();
    const progress: import("../../shared/apiTypes").MemberRoleProgress[] = [];
    f.client.rest[action === "add" ? "put" : "delete"] = async () => { throw new Error("Missing access"); };
    const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action, dryRun: false }, value => progress.push(value));
    assert.ok(progress.some(value => value.phase === "scanning" && value.checkedCount === 6));
    assert.ok(progress.some(value => value.phase === "updating" && value.batchNumber === 1));
    const last = progress.at(-1)!;
    assert.equal(last.phase, "completed");
    assert.equal(last.processedCount, result.data.matchedCount);
    assert.equal(last.failedCount, result.data.failures.length);
    assert.equal(last.updatedCount, 0);
    assert.equal(last.totalBatches, 1);
  });
}
test("dry-run progress never enters an updating batch", async () => {
  const f = fixture();
  const phases: string[] = [];
  await updateMemberRoles(f.client as never, "1", "actor", request, progress => phases.push(progress.phase));
  assert.deepEqual(phases, ["preparing", "scanning", "scanning", "completed"]);
  assert.deepEqual(f.writes, []);
});

for (const action of ["add", "remove"] as const) {
  test(`${action} processes a second batch and rechecks roles changed during the pause`, async () => {
    const f = fixture();
    const members = Array.from({ length: 26 }, (_, i) => member(String(i + 1000), action === "remove" ? ["10"] : []));
    f.setPages([members]);
    for (const value of members) f.current.set(value.user.id, value);
    const progress: import("../../shared/apiTypes").MemberRoleProgress[] = [];
    const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action, dryRun: false }, value => {
      progress.push(value);
      if (value.phase === "pausing") f.current.set("1025", member("1025", ["10", "20"]));
    });
    assert.equal(result.data.updatedCount, 25);
    assert.equal(result.data.skippedCount, 1);
    assert.equal(f.writes.length, 25);
    assert.equal(progress.find(value => value.phase === "pausing")?.processedCount, 25);
    assert.equal(progress.find(value => value.batchNumber === 2)?.processedCount, 25);
    assert.equal(progress.at(-1)?.processedCount, 26);
    assert.equal(progress.at(-1)?.totalBatches, 2);
  });
}

test("explains every scanned member without double counting exclusions", async () => {
  const f = fixture();
  f.setPages([[member("101"), member("102", ["20", "30"]), member("103", ["10"]), member("104", ["20"], true)]]);
  const result = await updateMemberRoles(f.client as never, "1", "actor", request);
  assert.deepEqual(result.data.scanSummary, { pagesRead: 1, bots: 1, excludedByRole: 1, noChangeNeeded: 1 });
  assert.equal(result.data.totalMembers, 4);
  assert.equal(result.data.matchedCount, 1);
});
for (const action of ["add", "remove"] as const) {
  test(`${action} after 302 successes changes only the remaining members`, async () => {
    const f = fixture();
    const members = Array.from({ length: 305 }, (_, i) => member(String(i + 1000),
      (action === "add" ? i < 302 : i >= 302) ? ["10"] : []));
    f.setPages([members]);
    for (const value of members) f.current.set(value.user.id, value);
    const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action, dryRun: false });
    assert.equal(result.data.totalMembers, 305);
    assert.equal(result.data.scanSummary?.noChangeNeeded, 302);
    assert.equal(result.data.matchedCount, 3);
    assert.equal(result.data.updatedCount, 3);
    assert.equal(f.writes.length, 3);
    assert.ok(f.writes.every(route => /\/(1302|1303|1304)\//.test(route)));
  });
}
test("reports completed-with-errors instead of hiding a partial result", async () => {
  const f = fixture();
  f.client.rest.put = async route => { if (route.includes("/101/")) throw new Error("Forbidden"); };
  const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, dryRun: false });
  assert.match(result.message, /Updated 1 of 2/);
  assert.match(result.message, /Completed with errors/);
});

for (const name of ["limited", "in between", "in-between", "IN BETWEEN", "in\u2011between", "in\u2013between"]) {
  for (const action of ["add", "remove"] as const) {
    for (const dryRun of [true, false]) {
      test(`${action} excludes ${name} with dryRun=${dryRun} even if the client sends no exclusions`, async () => {
        const f = fixture();
        f.setRoleName("30", name);
        const protectedMember = member("101", ["30", ...(action === "remove" ? ["10"] : [])]);
        const eligibleMember = member("106", action === "remove" ? ["10"] : []);
        f.setPages([[protectedMember, eligibleMember]]);
        f.current.set("101", protectedMember);
        f.current.set("106", eligibleMember);
        const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, action, dryRun, excludedRoleIds: [] });
        assert.equal(result.data.matchedCount, 1);
        assert.equal(result.data.scanSummary?.excludedByRole, 1);
        assert.equal(result.data.updatedCount, dryRun ? 0 : 1);
        assert.ok(f.writes.every(route => route.includes("/106/")));
      });
    }
  }
}
test("protects an explicitly targeted test user with the spaced role name", async () => {
  const f = fixture();
  f.setRoleName("30", "in between");
  f.current.set("101", member("101", ["30"]));
  const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, userIds: ["101"], dryRun: false, excludedRoleIds: [] });
  assert.equal(result.data.matchedCount, 0);
  assert.deepEqual(f.writes, []);
});
test("rechecks mandatory protection acquired after the member scan", async () => {
  const f = fixture();
  f.setRoleName("30", "in between");
  f.current.set("101", member("101", ["30"]));
  const result = await updateMemberRoles(f.client as never, "1", "actor", { ...request, dryRun: false, excludedRoleIds: [] });
  assert.equal(result.data.skippedCount, 1);
  assert.ok(f.writes.every(route => !route.includes("/101/")));
});
test("protected roles cannot be chosen as bulk targets", async () => {
  const f = fixture();
  f.setRoleName("30", "in between");
  await assert.rejects(updateMemberRoles(f.client as never, "1", "actor", { ...request, roleId: "30", excludedRoleIds: [], dryRun: false }), /protected/);
  assert.deepEqual(f.writes, []);
  assert.equal((await listMemberRoles(f.client as never, "1", "actor")).find(role => role.id === "30")?.canUpdate, false);
});

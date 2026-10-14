import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { observeMemberRoleRateLimits } from "./memberRoleRateLimits";

for (const global of [true, false]) {
  test(`reports ${global ? "global" : "guild member"} Discord wait and removes listeners`, () => {
    const rest = new EventEmitter();
    const waits: string[] = [];
    const before = Date.now();
    const stop = observeMemberRoleRateLimits({ rest } as never, "1", until => waits.push(until));
    rest.emit("rateLimited", { global, url: global ? "https://discord.com/api/v10/other" : "https://discord.com/api/v10/guilds/1/members/2/roles/3", retryAfter: 100, timeToReset: 5000, sublimitTimeout: 50 });
    assert.equal(waits.length, 1);
    assert.ok(Date.parse(waits[0]!) >= before + 5000);
    stop();
    assert.equal(rest.listenerCount("rateLimited"), 0);
  });
}
test("ignores rate limits for other guilds and unrelated routes", () => {
  const rest = new EventEmitter();
  const stop = observeMemberRoleRateLimits({ rest } as never, "1", () => assert.fail("Unrelated limit affected this job"));
  for (const url of ["https://discord.com/api/v10/guilds/2/members/3", "https://discord.com/api/v10/guilds/1/channels"]) {
    rest.emit("rateLimited", { global: false, url, retryAfter: 100, timeToReset: 200, sublimitTimeout: 0 });
  }
  stop();
});

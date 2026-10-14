import assert from "node:assert/strict";
import test from "node:test";
import { MEMBER_ROLE_BATCH_PAUSE_MS, MEMBER_ROLE_CONCURRENCY, processMemberRoleBatches } from "./memberRoleBatches";

for (const count of [0, 1, 25, 26, 51, 327, 1001]) {
  test(`processes ${count} members in bounded batches with pauses only between batches`, async () => {
    const processed: number[] = [];
    const boundaries: Array<[number, boolean, number]> = [];
    const pauses: number[] = [];
    let active = 0;
    let maxActive = 0;
    await processMemberRoleBatches(Array.from({ length: count }, (_, i) => i), async value => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      processed.push(value);
      active--;
    }, (number, pausing) => boundaries.push([number, pausing, processed.length]), async ms => {
      assert.equal(active, 0);
      pauses.push(ms);
    });
    assert.deepEqual(processed.slice().sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    assert.equal(maxActive, Math.min(count, MEMBER_ROLE_CONCURRENCY));
    assert.equal(pauses.length, Math.max(0, Math.ceil(count / 25) - 1));
    assert.ok(pauses.every(ms => ms === MEMBER_ROLE_BATCH_PAUSE_MS));
    assert.deepEqual(boundaries.filter(([, pausing]) => !pausing).map(([, , done]) => done), Array.from({ length: Math.ceil(count / 25) }, (_, i) => i * 25));
  });
}

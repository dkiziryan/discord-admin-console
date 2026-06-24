import assert from "node:assert/strict";
import test from "node:test";

import { resolveZeroMessageTargetChannels } from "./workflowRoutes";

test("resolveZeroMessageTargetChannels uses request channels when provided", () => {
  assert.deepEqual(
    resolveZeroMessageTargetChannels(["general"], ["announcements"]),
    ["general"],
  );
});

test("resolveZeroMessageTargetChannels falls back to server default channels", () => {
  assert.deepEqual(
    resolveZeroMessageTargetChannels([], ["general", "support"]),
    ["general", "support"],
  );
});

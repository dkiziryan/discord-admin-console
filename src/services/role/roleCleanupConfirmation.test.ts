import test from "node:test";
import assert from "node:assert/strict";
import { isRoleCleanupConfirmation } from "./roleCleanupConfirmation";

test("isRoleCleanupConfirmation accepts a yes reply from the original user to the prompt", () => {
  const result = isRoleCleanupConfirmation({
    responseAuthorId: "user-1",
    expectedAuthorId: "user-1",
    responseContent: " yes ",
    responseReferenceMessageId: "prompt-1",
    promptMessageId: "prompt-1",
  });

  assert.equal(result, true);
});

test("isRoleCleanupConfirmation rejects unrelated messages in the same channel", () => {
  const result = isRoleCleanupConfirmation({
    responseAuthorId: "user-1",
    expectedAuthorId: "user-1",
    responseContent: "yes",
    responseReferenceMessageId: null,
    promptMessageId: "prompt-1",
  });

  assert.equal(result, false);
});

test("isRoleCleanupConfirmation rejects replies from a different user", () => {
  const result = isRoleCleanupConfirmation({
    responseAuthorId: "user-2",
    expectedAuthorId: "user-1",
    responseContent: "yes",
    responseReferenceMessageId: "prompt-1",
    promptMessageId: "prompt-1",
  });

  assert.equal(result, false);
});

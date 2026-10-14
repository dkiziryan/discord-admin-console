import assert from "node:assert/strict";
import test from "node:test";
import { isProtectedMemberRoleName, memberRoleExclusions } from "./memberRolePolicy";

for (const name of ["limited", " LIMITED ", "in between", "in-between", "In Between", "inbetween", "in_between", "in\u2011between", "in\u2013between", "in\u2014between", "in\u00a0between", "in\u200bbetween", "ＩＮ ＢＥＴＷＥＥＮ"]) {
  test(`protects role name ${JSON.stringify(name)}`, () => assert.equal(isProtectedMemberRoleName(name), true));
}
for (const name of ["Improper", "unlimited", "very limited", "inbetweeners", "Member"]) {
  test(`does not misclassify ${name}`, () => assert.equal(isProtectedMemberRoleName(name), false));
}
test("always adds every matching role ID including duplicate role names", () => {
  assert.deepEqual(memberRoleExclusions(["other", "1"], [
    { id: "1", name: "in-between" }, { id: "2", name: "in between" },
    { id: "3", name: "limited" }, { id: "4", name: "Improper" },
  ]), ["1", "2", "3", "other"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getClerkAuthState,
  membershipForAuthState,
  signedOutMembership,
} from "./membership-state";

test("signed-in to signed-out transition cannot reuse premium membership", () => {
  const previousMembership = {
    authenticated: true,
    premium: true,
    role: "admin" as const,
    email: "admin@example.com",
  };

  assert.equal(getClerkAuthState(true, true, "user_admin"), "signed-in");
  assert.equal(getClerkAuthState(false, true, "user_admin"), "unknown");
  assert.equal(getClerkAuthState(true, false, null), "signed-out");
  assert.deepEqual(
    membershipForAuthState("signed-out", previousMembership),
    signedOutMembership,
  );
  assert.deepEqual(
    membershipForAuthState("unknown", previousMembership),
    signedOutMembership,
  );
});
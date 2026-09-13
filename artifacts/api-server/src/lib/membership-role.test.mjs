import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteMember,
  isAdministrator,
  membershipRole,
} from "./membership-role.ts";

test("only the configured administrator email receives the admin role", () => {
  assert.equal(membershipRole("owner@example.com", "OWNER@example.com"), "admin");
  assert.equal(membershipRole("member@example.com", "owner@example.com"), "free");
  assert.equal(membershipRole("member@example.com", undefined), "free");
});

test("administrator checks do not grant access to free members", () => {
  assert.equal(isAdministrator("admin"), true);
  assert.equal(isAdministrator("free"), false);
  assert.equal(isAdministrator("paid"), false);
});

test("administrators cannot delete their own account", () => {
  assert.equal(canDeleteMember("user_admin", "user_admin"), false);
  assert.equal(canDeleteMember("user_admin", "user_member"), true);
});
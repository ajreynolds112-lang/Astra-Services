import { test } from "node:test";
import assert from "node:assert/strict";
import { appAccessAllowed, appAssignmentInput, appUpdateInput, githubRepository } from "./appAccess";

test("verified clients need an assignment, not payment", () => {
  assert.equal(appAccessAllowed(false, true, true), true);
  assert.equal(appAccessAllowed(false, false, true), false);
  assert.equal(appAccessAllowed(false, true, false), false);
  assert.equal(appAccessAllowed(false, false, false), false);
});

test("any valid email can be assigned before registration and is normalized", () => {
  assert.deepEqual(appAssignmentInput.parse({ email: " Tester@Example.com " }), { email: "tester@example.com" });
  assert.equal(appAssignmentInput.safeParse({ userId: "user_existing" }).success, true);
  for (const input of [{}, { email: "not-an-email" }, { email: "tester@example.com", userId: "user_existing" }, { email: "tester@example.com", isDev: true }]) {
    assert.equal(appAssignmentInput.safeParse(input).success, false);
  }
});

test("verified staff can manage apps without a subscription", () => {
  assert.equal(appAccessAllowed(true, false, false), true);
});

test("Expo Go previews accept public native links, not websites or private servers", () => {
  for (const previewUrl of ["exp://demo.exp.direct", "exps://mobile.example.com", "exp://mobile.example.com:80/path?project=demo", null]) {
    assert.equal(appUpdateInput.safeParse({ previewUrl }).success, true);
  }
  for (const previewUrl of ["https://expo.dev/accounts/owner/projects/app", "https://example.com", "javascript:alert(1)", "exp:///path", "exp://localhost:8081", "exp://192.168.1.2:8081", "exp://10.0.0.2", "exp://127.0.0.1", "exp://u:p@example.com", "exp://[::1]", "exp://app.local", "myapp://expo-development-client"]) {
    assert.equal(appUpdateInput.safeParse({ previewUrl }).success, false, previewUrl);
  }
});

test("links cannot inject scripts, credentials, local addresses or fake TestFlight hosts", () => {
  for (const siteUrl of ["javascript:alert(1)", "http://example.com", "https://localhost", "https://127.0.0.1", "https://u:p@example.com", "https://192.168.0.1"]) {
    assert.equal(appUpdateInput.safeParse({ siteUrl }).success, false);
  }
  assert.equal(appUpdateInput.safeParse({ testflightUrl: "https://testflight.apple.com.evil.example/j/demo" }).success, false);
  assert.equal(appUpdateInput.safeParse({ testflightUrl: "https://testflight.apple.com/j/example", siteUrl: null }).success, true);
});

test("repository and directory validation prevents unintended source destinations", () => {
  assert.deepEqual(githubRepository("https://github.com/ajreynolds112-lang/CYBAZONE-Official-App.git"), {
    owner: "ajreynolds112-lang", name: "CYBAZONE-Official-App",
  });
  assert.throws(() => githubRepository("https://github.com/owner/repo/blob/main/file"));
  assert.equal(appUpdateInput.safeParse({ appDirectory: "../outside" }).success, false);
  assert.equal(appUpdateInput.safeParse({ appDirectory: "/absolute" }).success, false);
  assert.equal(appUpdateInput.safeParse({ appDirectory: "artifacts/mobile", ascAppId: "1234567890" }).success, true);
  assert.equal(appUpdateInput.safeParse({ automationConfigured: true }).success, false);
});
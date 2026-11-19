import { test } from "node:test";
import assert from "node:assert/strict";
import { expoGoLink } from "./expo-go";

test("only native Expo Go links produce a launch button destination", () => {
  assert.equal(expoGoLink(" exp://demo.exp.direct "), "exp://demo.exp.direct");
  assert.equal(expoGoLink("exps://mobile.example.com"), "exps://mobile.example.com");
  for (const url of [null, "", "https://example.com", "https://expo.dev/accounts/me/projects/app", "javascript:alert(1)", "exp://localhost:8081", "exp://192.168.0.1", "exp://u:p@example.com", "exp://[::1]", "exp://app.local"]) {
    assert.equal(expoGoLink(url), null);
  }
});
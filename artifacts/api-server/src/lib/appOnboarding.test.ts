import { test } from "node:test";
import assert from "node:assert/strict";
import { appOnboardingMessage, sendAppOnboarding } from "./appOnboarding";

const input = { appId: "app-1", appName: "CYBAZONE", name: "Client", email: "client@example.com", previewUrl: "exp://preview.example.com", portalOrigin: "https://astra.example.com", eventId: "assignment-1" };

test("onboarding names the app and gives every client the phone process", () => {
  const message = appOnboardingMessage(input);
  assert.match(message.subject, /added to CYBAZONE/);
  for (const content of ["1.", "2.", "3.", "4.", "5.", "6.", "Expo Go", "iPhone", "Android", "client@example.com", "https://astra.example.com/portal/apps/app-1", "Open in Expo Go", "paid", "not a website", "server"]) {
    assert.ok(message.text.includes(content), content);
  }
  assert.match(message.text, /No purchase or paid plan is needed/);
  assert.match(message.text, /email address assigned to this project/);
  assert.doesNotMatch(message.text, /Both a paid plan and assignment/);
});

test("a pending preview never tells clients their native app is ready", () => {
  const message = appOnboardingMessage({ ...input, previewUrl: null });
  assert.match(message.text, /not ready yet/);
  assert.doesNotMatch(message.text, /Your Expo Go preview link is connected/);
});

test("delivery fails explicitly without a verified client sender", async () => {
  await assert.rejects(sendAppOnboarding(input, { from: "", apiKey: "test-only", fetch: async () => { throw new Error("must not send"); } }), /verified.*sender/i);
  await assert.rejects(sendAppOnboarding(input, { from: "ASTRA <onboarding@resend.dev>", apiKey: "test-only" }), /verified.*sender/i);
});

test("a send uses the client's address and stable assignment idempotency key", async () => {
  let calls = 0;
  await sendAppOnboarding(input, {
    from: "ASTRA <apps@studio.example.com>", apiKey: "test-only",
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.to, ["client@example.com"]);
      assert.match(body.subject, /CYBAZONE/);
      assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "app-onboarding/assignment-1");
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
});

test("provider failure is not reported as a delivered email", async () => {
  await assert.rejects(sendAppOnboarding(input, {
    from: "ASTRA <apps@studio.example.com>", apiKey: "test-only",
    fetch: async () => new Response(JSON.stringify({ message: "Sending domain not verified" }), { status: 403 }),
  }), /not sent.*403/i);
});
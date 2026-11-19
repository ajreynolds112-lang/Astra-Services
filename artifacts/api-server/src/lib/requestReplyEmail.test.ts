import assert from "node:assert/strict";
import test from "node:test";
import { replyEmailConfiguration, requestReplyMessage, sendRequestReplyEmail, requestReplyAllowed } from "./requestReplyEmail";

const input = { replyId: 7, requestId: 3, name: "Client", email: "client@example.com", appName: "CYBAZONE", title: "Update the homepage", message: "The change is ready to review.", authorName: "Studio" };
const config = { from: "ASTRA <requests@astra-services.org>", apiKey: "test-key" };

test("only verified owner/dev accounts can reply", () => {
  assert.equal(requestReplyAllowed({ emailVerified: true, isOwner: true, isDev: false }), true);
  assert.equal(requestReplyAllowed({ emailVerified: true, isOwner: false, isDev: true }), true);
  assert.equal(requestReplyAllowed({ emailVerified: true, isOwner: false, isDev: false }), false);
  assert.equal(requestReplyAllowed({ emailVerified: false, isOwner: true, isDev: true }), false);
});

test("email includes the request context, exact reply, and admin name", () => {
  const mail = requestReplyMessage({ ...input, title: "Subject\r\ninjection" });
  assert.ok(!/[\r\n]/.test(mail.subject));
  assert.ok(mail.text.includes(input.message));
  assert.ok(mail.text.includes(input.appName));
  assert.ok(mail.text.includes("Request #3"));
  assert.ok(mail.text.includes(input.authorName));
});

test("missing or test sender fails explicitly before contacting Resend", async () => {
  for (const from of ["", "ASTRA <onboarding@resend.dev>"]) {
    assert.ok(replyEmailConfiguration({ from, apiKey: "test" }));
    await assert.rejects(sendRequestReplyEmail(input, { from, apiKey: "test", fetch: async () => { throw new Error("must not fetch"); } }), /verified.*sender/i);
  }
  assert.ok(replyEmailConfiguration({ ...config, apiKey: "" }));
});

test("sends to original requester, uses stable idempotency, and checks acceptance", async () => {
  let calls = 0;
  const mockedFetch: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.to, [input.email]);
    assert.equal(body.text, requestReplyMessage(input).text);
    assert.equal((init!.headers as Record<string, string>)["Idempotency-Key"], "request-reply/7");
    return new Response(JSON.stringify({ id: "email_accepted" }), { status: 200 });
  };
  assert.equal(await sendRequestReplyEmail(input, { ...config, fetch: mockedFetch }), "email_accepted");
  assert.equal(calls, 1);
});

test("provider rejection and unconfirmed acceptance are failures, not sent", async () => {
  await assert.rejects(sendRequestReplyEmail(input, { ...config, fetch: async () => new Response("rejected", { status: 403 }) }), /rejected.*403/);
  await assert.rejects(sendRequestReplyEmail(input, { ...config, fetch: async () => new Response("{}") }), /confirm/);
  await assert.rejects(sendRequestReplyEmail(input, { ...config, fetch: async () => { throw new Error("network offline"); } }), /network offline/);
});

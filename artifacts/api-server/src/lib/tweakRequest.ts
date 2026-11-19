import type { Logger } from "pino";
import type { TweakRequestInput } from "@workspace/api-zod";
import { commitRequestFile, emailUpdate } from "./requestDelivery";
import { updateRecipients } from "./account";

const PRIORITY_LABEL: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "request";
}

export class CommitFailedError extends Error {}

/**
 * Write the request to the repo's Requests folder, then email every update recipient.
 * Test requests get a TEST_ filename prefix, a do-not-implement banner, and a [TEST] subject.
 */
export async function deliverTweakRequest(opts: {
  profile: { name: string; email: string };
  planLabel: string;
  r: TweakRequestInput;
  test: boolean;
  log: Logger;
}): Promise<{ fileName: string; emailed: boolean }> {
  const { profile, planLabel, r, test, log } = opts;
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `${test ? "TEST_" : ""}${stamp}_${slug(profile.name)}_${slug(r.title)}.txt`;

  const body = [
    ...(test ? ["*** TEST REQUEST — sent from the ASTRA dev section to check delivery. Do not implement. ***", ""] : []),
    `Name: ${profile.name}`,
    `Email: ${profile.email}`,
    "",
    `Submitted: ${now.toISOString()}`,
    `Plan: ${planLabel}`,
    `App: ${r.appName}`,
    `Request title: ${r.title}`,
    `Priority: ${PRIORITY_LABEL[r.priority] ?? r.priority}`,
    "",
    "1. What the app does right now",
    r.currentBehavior.trim(),
    "",
    "2. Exactly how it should work after the change",
    r.desiredBehavior.trim(),
    "",
    "3. Where in the app (screens, pages, buttons, features)",
    r.location.trim(),
    "",
    "4. Step-by-step flow from the user's point of view",
    r.userFlow.trim(),
    "",
    "5. How we'll know it's done (acceptance criteria)",
    r.acceptanceCriteria.trim(),
    "",
    "6. Additional notes",
    r.notes?.trim() || "(none)",
    "",
  ].join("\n");

  try {
    await commitRequestFile(fileName, body, `${test ? "[TEST] " : ""}App tweak request: ${r.title} (${profile.name})`);
  } catch (err) {
    log.error({ err }, "tweak-request commit failed");
    throw new CommitFailedError("commit failed");
  }

  // Each recipient gets their own email so one failure doesn't block the others.
  // `emailed` reflects whether the owner's copy went out.
  let emailed = false;
  try {
    const recipients = await updateRecipients();
    const subject = `${test ? "[TEST] " : ""}New app tweak request: ${r.title} — ${profile.name}`;
    const results = await Promise.allSettled(recipients.map((to) => emailUpdate(to, subject, body, profile.email)));
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        if (i === 0) emailed = true;
      } else {
        log.error({ err: result.reason, to: recipients[i] }, "tweak-request email failed");
      }
    });
  } catch (err) {
    log.error({ err }, "tweak-request email lookup failed");
  }

  return { fileName, emailed };
}

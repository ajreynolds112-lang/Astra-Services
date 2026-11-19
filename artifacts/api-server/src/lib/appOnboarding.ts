import { OWNER_EMAIL } from "./requestDelivery";

type OnboardingInput = {
  appId: string; appName: string; name: string; email: string;
  previewUrl: string | null; portalOrigin: string; eventId: string;
};

export function appOnboardingMessage(input: OnboardingInput) {
  if (!input.portalOrigin) throw new Error("Email not sent: configure ASTRA_PUBLIC_URL with the published HTTPS site address.");
  const origin = new URL(input.portalOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password) {
    throw new Error("Configure ASTRA_PUBLIC_URL with the published HTTPS site address.");
  }
  const appName = input.appName.replace(/[\r\n]+/g, " ").trim();
  const appUrl = `${origin.origin}/portal/apps/${encodeURIComponent(input.appId)}`;
  const ready = /^exps?:\/\//i.test(input.previewUrl ?? "");
  return {
    subject: `You've been added to ${appName} — phone setup instructions`,
    text: `Hi ${input.name || "there"},

You've been added to ${appName} in your ASTRA client portal.

Follow these steps to see the native app on your phone:

1. Install the official Expo Go app on your iPhone from the App Store, or on your Android phone from Google Play.
2. On your phone, open ${origin.origin}/portal in Safari or Chrome.
3. Sign in with ${input.email}, the email address assigned to this project. If you haven't registered yet, create an account with that same email and complete email verification. No purchase or paid plan is needed to view your assigned app.
4. Open your assigned app, ${appName}, in the portal. You can also use this direct project link: ${appUrl}
5. Tap "Open in Expo Go" and allow your phone to open Expo Go. This opens the native app, not a website preview. Follow any supported Expo Go/project sign-in prompts. Never share passwords or use the studio owner's credentials.
6. Wait for the app to load, then explore the screens and features. Return to your ASTRA portal to submit feedback or a tweak request.

${ready ? "Your Expo Go preview link is connected. The live preview still depends on the studio's preview server being online." : "Your Expo Go preview is not ready yet. If the portal shows a pending message, wait for the studio to connect it before trying step 5."}

Important:
- A verified login with the assigned email is required. Viewing your assigned app is free; being added does not grant paid tweak-request or billing features or change your payment plan.
- Use an internet connection. A live preview works only while the studio's preview server is running; it is not an always-on App Store release.
- If the button will not open, install/update Expo Go, reopen this link in Safari or Chrome, and try again. Follow any project sign-in instructions you are shown.
- If you see an SDK/version mismatch, an unavailable preview, or an account-access error, reply to this email for help. Do not buy another plan to fix it.
- You do not need TestFlight for this Expo Go preview; TestFlight is a separate testing option.

Reply to this email if you need help.

ASTRA`,
  };
}

/** Client mail must use a verified domain; Resend's test sender cannot reach clients. */
export async function sendAppOnboarding(input: OnboardingInput, config?: {
  from: string; apiKey: string; fetch?: typeof fetch;
}) {
  const from = config?.from ?? process.env.ASTRA_EMAIL_FROM ?? "";
  const apiKey = config?.apiKey ?? process.env.RESEND_API_KEY;
  if (!from.trim() || /@resend\.dev\b/i.test(from)) {
    throw new Error("Email not sent: configure ASTRA_EMAIL_FROM with a verified Resend sender address. The client is still assigned.");
  }
  if (!apiKey) throw new Error("Email not sent: Resend is not configured. The client is still assigned.");
  const message = appOnboardingMessage(input);
  const response = await (config?.fetch ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": `app-onboarding/${input.eventId}`,
    },
    body: JSON.stringify({ from, to: [input.email], reply_to: OWNER_EMAIL, ...message }),
  });
  if (!response.ok) {
    throw new Error(`Email not sent: Resend rejected delivery (${response.status}). Check the verified sender domain and email settings. The client is still assigned.`);
  }
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Email not sent: Resend did not confirm acceptance. The client is still assigned.");
  return result.id;
}
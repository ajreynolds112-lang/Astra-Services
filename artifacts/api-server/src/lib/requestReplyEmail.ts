import { OWNER_EMAIL } from "./requestDelivery";

type ReplyEmailInput = {
  replyId: number; requestId: number; name: string; email: string;
  appName: string; title: string; message: string; authorName: string;
};
type EmailConfig = { from: string; apiKey: string; fetch?: typeof fetch };

export function requestReplyAllowed(profile: { emailVerified: boolean; isOwner: boolean; isDev: boolean }) {
  return profile.emailVerified && (profile.isOwner || profile.isDev);
}

export function replyEmailConfiguration(config?: EmailConfig): string | null {
  const from = config?.from ?? process.env.ASTRA_EMAIL_FROM ?? "";
  if (!from.trim() || /@resend\.dev\b/i.test(from)) {
    return "Client email requires a verified Resend sender. Configure ASTRA_EMAIL_FROM; replies are saved and can be retried afterward.";
  }
  if (!(config?.apiKey ?? process.env.RESEND_API_KEY)) return "Resend is not configured. Replies are saved; configure email before retrying.";
  return null;
}

export function requestReplyMessage(input: ReplyEmailInput) {
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  return {
    subject: `ASTRA reply to your request: ${title}`,
    text: `Hi ${input.name || "there"},

${input.authorName} from ASTRA replied to your request.

Request #${input.requestId}
App: ${input.appName}
Request: ${title}

${input.message}

— ${input.authorName}
ASTRA

You can reply to this email to contact the studio.`,
  };
}

export async function sendRequestReplyEmail(input: ReplyEmailInput, config?: EmailConfig) {
  const configurationError = replyEmailConfiguration(config);
  if (configurationError) throw new Error(configurationError);
  const response = await (config?.fetch ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config?.apiKey ?? process.env.RESEND_API_KEY}`,
      "Idempotency-Key": `request-reply/${input.replyId}`,
    },
    body: JSON.stringify({
      from: config?.from ?? process.env.ASTRA_EMAIL_FROM,
      to: [input.email], reply_to: OWNER_EMAIL,
      ...requestReplyMessage(input),
    }),
  });
  if (!response.ok) throw new Error(`Email service rejected delivery (${response.status}). Check the verified sender and Resend settings, then retry this saved reply.`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Email service did not confirm acceptance. Retry this saved reply.");
  return result.id;
}

import { githubApi } from "./localDevelopment";

export const REQUESTS_REPO = "ajreynolds112-lang/CYBAZONE-Official-App";
export const REQUESTS_FOLDER = "Requests";
export const OWNER_EMAIL = "ajreynolds112@gmail.com";

/** Commit a new text file into the Requests folder of the app repo. */
export async function commitRequestFile(fileName: string, content: string, commitMessage: string): Promise<void> {
  const path = `/repos/${REQUESTS_REPO}/contents/${REQUESTS_FOLDER}/${encodeURIComponent(fileName)}`;
  const options = {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/vnd.github+json" },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, "utf8").toString("base64"),
    }),
  };
  const res = await githubApi(path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub commit failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** Email the full request to one recipient via Resend. */
export async function emailUpdate(to: string, subject: string, text: string, replyTo: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: "ASTRA Requests <onboarding@resend.dev>",
      to: [to],
      reply_to: replyTo,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

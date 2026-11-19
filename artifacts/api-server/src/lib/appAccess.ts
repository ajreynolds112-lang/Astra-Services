import { z } from "zod";

export function appAccessAllowed(staff: boolean, emailVerified: boolean, assigned: boolean): boolean {
  return staff || (emailVerified && assigned);
}

export const appAssignmentInput = z.object({
  userId: z.string().min(1).max(100).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()).optional(),
}).strict().refine((value) => Boolean(value.userId) !== Boolean(value.email), "Provide either an email address or a registered account.");

function publicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) &&
      !/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  } catch {
    return false;
  }
}

const link = z.string().trim().max(2048).refine(publicHttpsUrl, "Use a public HTTPS URL.").nullable();
const expoLink = z.string().trim().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return ["exp:", "exps:"].includes(url.protocol) && !!url.hostname &&
      !url.hostname.endsWith(".local") &&
      publicHttpsUrl(value.replace(/^exps?:\/\//i, "https://"));
  } catch { return false; }
}, "Use a public exp:// or exps:// Expo Go link, not a website, dashboard, or local Wi-Fi address.").nullable();
const directory = z.string().trim().max(200)
  .refine((path) => path === "" || path.split("/").every((part) => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== "." && part !== ".."),
    "Use a relative app directory without parent-directory segments.");

export function githubRepository(url: string): { owner: string; name: string } {
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(url);
  if (!match || match[2] === "." || match[2] === "..") throw new Error("Use a GitHub repository URL, not a file or another host.");
  return { owner: match[1]!, name: match[2]! };
}

export const appUpdateInput = z.object({
  siteUrl: link.optional(),
  previewUrl: expoLink.optional(),
  testflightUrl: link.refine((value) => value == null || new URL(value).hostname === "testflight.apple.com",
    "Use an actual TestFlight invitation from testflight.apple.com.").optional(),
  repositoryUrl: link.refine((value) => {
    if (value == null) return true;
    try { githubRepository(value); return true; } catch { return false; }
  }, "Use a GitHub repository URL.").optional(),
  appDirectory: directory.optional(),
  ascAppId: z.string().trim().regex(/^\d{5,15}$/, "Enter the numeric App Store Connect app ID.").nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field.");
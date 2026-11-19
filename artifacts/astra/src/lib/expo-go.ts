/** Legacy web preview URLs must never be shown as native Expo Go launches. */
export function expoGoLink(value: string | null): string | null {
  if (!value) return null;
  const link = value.trim();
  try {
    const url = new URL(link);
    if (!["exp:", "exps:"].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.hostname.endsWith(".local") ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return null;
    return link;
  } catch { return null; }
}
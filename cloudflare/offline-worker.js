// Cloudflare Worker on astra-services.org/*: passes traffic to the Mac's tunnel, and when the
// Mac is off or asleep (tunnel down → 52x/530) shows a friendly "closed" page instead of an error.
// Set the Worker variable OFFLINE_MESSAGE in the Cloudflare dashboard (keeps contact details out of git).
export default {
  async fetch(request, env) {
    let response;
    try {
      response = await fetch(request);
    } catch {
      response = null;
    }
    if (response && !(response.status >= 520 && response.status <= 530)) return response;

    const headers = { "Cache-Control": "no-store", "Retry-After": "600" };
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return Response.json({ error: "ASTRA is offline right now." }, { status: 503, headers });
    }
    const message = escapeHtml(env.OFFLINE_MESSAGE || "The client portal is currently closed. Contact ASTRA to open it.");
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ASTRA</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ef;color:#1a1a2e;
font:16px/1.5 system-ui,sans-serif;padding:16px}main{max-width:28rem;text-align:center}
h1{font:600 2rem Georgia,serif;margin:0 0 .5rem}</style></head>
<body><main><h1>✦ ASTRA</h1><p>${message}</p></main></body></html>`,
      { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  },
};

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

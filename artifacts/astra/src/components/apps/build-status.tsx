import type { AppBuild } from "@workspace/api-client-react";

export function buildLabel(status: string): { label: string; tone: string } {
  switch (status.toUpperCase()) {
    case "FINISHED": return { label: "Build finished (Apple processing not confirmed)", tone: "bg-secondary text-foreground" };
    case "ERRORED": return { label: "Build failed", tone: "bg-destructive/10 text-destructive" };
    case "CANCELED": return { label: "Build canceled", tone: "bg-muted text-muted-foreground" };
    case "IN_PROGRESS": return { label: "Building", tone: "bg-secondary text-foreground" };
    case "IN_QUEUE": case "NEW": return { label: "Queued", tone: "bg-secondary text-foreground" };
    default: return { label: status.replace(/_/g, " ").toLowerCase(), tone: "bg-muted text-muted-foreground" };
  }
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function BuildList({ builds, error }: { builds: AppBuild[]; error: string | null }) {
  return (
    <div data-testid="list-builds">
      {error && <p className="mb-3 text-sm text-destructive" role="alert" data-testid="text-build-error">Could not read builds from Expo: {error}</p>}
      {builds.length === 0 && !error && <p className="text-sm text-muted-foreground" data-testid="text-no-builds">No builds recorded yet.</p>}
      <ul className="divide-y divide-border">
        {builds.map((b) => {
          const s = buildLabel(b.status);
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" data-testid={`row-build-${b.id}`}>
              <div>
                <span className={`rounded-full px-2.5 py-1 text-xs ${s.tone}`}>{s.label}</span>
                <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                  {b.platform}{b.version ? ` v${b.version}` : ""}{b.buildNumber ? ` (${b.buildNumber})` : ""} · {fmtDate(b.createdAt)}
                </p>
              </div>
              {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-xs text-foreground underline underline-offset-4" data-testid={`link-build-${b.id}`}>Build details</a>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

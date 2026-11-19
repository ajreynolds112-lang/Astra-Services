import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useGetClientApps, useSyncExpoApps, getGetClientAppsQueryKey, type PortalMe } from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";
import { fmtDate } from "./build-status";

export function AppsSection({ me }: { me: PortalMe }) {
  const staff = me.isOwner || me.isDev;
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useGetClientApps({ query: { queryKey: getGetClientAppsQueryKey(), refetchInterval: 30000 } });
  const sync = useSyncExpoApps();

  function onSync() {
    sync.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetClientAppsQueryKey() }) });
  }

  return (
    <section className="mt-10 rounded-3xl border border-border bg-card p-6 md:p-10" aria-labelledby="apps-heading" data-testid="section-apps">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="apps-heading" className="text-2xl font-semibold tracking-tight text-foreground">{staff ? "All apps" : "Your apps"}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {staff ? "Every Expo app on the studio account. Open one to assign clients and configure testing." : "Open your app to find its links and how to test it."}
          </p>
        </div>
        {staff && (
          <button type="button" onClick={onSync} disabled={sync.isPending} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60" data-testid="button-sync-apps">
            <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /> {sync.isPending ? "Syncing…" : "Sync from Expo"}
          </button>
        )}
      </div>
      {sync.isError && <p className="mt-4 text-sm text-destructive" role="alert">{apiErrorMessage(sync.error, "Sync failed.")}</p>}
      {data && staff && (
        <p className="mt-4 text-xs text-muted-foreground" data-testid="text-sync-state">
          {data.expoConnected ? "Expo connected." : "Expo is not connected."} {data.lastSyncedAt ? `Last synced ${fmtDate(data.lastSyncedAt)}.` : "Never synced."}
        </p>
      )}
      {data?.syncError && staff && <p className="mt-2 text-sm text-destructive" role="alert" data-testid="text-sync-error">Last sync error: {data.syncError}</p>}

      <div className="mt-6">
        {isLoading && <div className="space-y-3" aria-busy="true" data-testid="skeleton-apps">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {error && (
          <p className="text-sm text-destructive" role="alert" data-testid="text-apps-error">
            {apiErrorMessage(error, "Could not load apps.")}{" "}
            <button type="button" onClick={() => refetch()} className="underline underline-offset-4" data-testid="button-retry-apps">Retry</button>
          </p>
        )}
        {data && data.apps.length === 0 && (
          <div className="rounded-2xl bg-secondary px-5 py-6 text-sm text-foreground" data-testid="text-no-apps">
            {staff ? "No apps found. Sync from Expo to import the studio account's apps." : "No app has been assigned to your account yet. We'll assign it once your project is set up. Contact us if you expected to see one."}
          </div>
        )}
        {data && data.apps.length > 0 && (
          <ul className="divide-y divide-border">
            {data.apps.map((a) => (
              <li key={a.id}>
                <Link href={`/portal/apps/${a.id}`} className="group flex items-center justify-between gap-4 py-4" data-testid={`link-app-${a.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium text-foreground">{a.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {a.slug}{staff && a.assignedToMe ? " · assigned to you" : ""}{staff && !a.automationConfigured ? " · automation not configured" : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

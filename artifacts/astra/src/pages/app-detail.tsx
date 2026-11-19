import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetPortalMe, useGetClientApp, getGetClientAppQueryKey } from "@workspace/api-client-react";
import { PortalHeader } from "@/pages/portal";
import { AppLinks } from "@/components/apps/app-links";
import { BuildList } from "@/components/apps/build-status";
import { Assignments, AppSettings, Automation } from "@/components/apps/app-admin";
import { apiErrorMessage } from "@/lib/format";

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8" data-testid={`card-${id}`}>
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function AppDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: me, isLoading: meLoading, error: meError } = useGetPortalMe();
  const allowed = !!me && me.emailVerified !== false;
  const staff = !!me && (me.isOwner || me.isDev);
  const { data, isLoading, error, refetch } = useGetClientApp(id, {
    query: { enabled: allowed && !!id, queryKey: getGetClientAppQueryKey(id), refetchInterval: 30000 },
  });
  const status = (error as { status?: number } | null)?.status;

  return (
    <div className="min-h-[100dvh] bg-background">
      <PortalHeader />
      <main className="mx-auto max-w-4xl px-6 py-14">
        <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-portal">
          <ArrowLeft className="h-4 w-4" /> Portal
        </Link>
        {meLoading && <p className="mt-8 text-sm text-muted-foreground" data-testid="text-loading">Loading…</p>}
        {meError && <p className="mt-8 text-sm text-destructive" role="alert">{apiErrorMessage(meError, "Could not load your account.")}</p>}
        {me && !allowed && <p className="mt-8 text-sm text-destructive" role="alert">Verify your assigned email address, then sign in again to view this project. No payment is required.</p>}
        {allowed && (
          <>
            {isLoading && <div className="mt-8 h-40 animate-pulse rounded-3xl bg-muted" aria-busy="true" data-testid="skeleton-app" />}
            {error && (
              <div className="mt-8 text-sm" role="alert" data-testid="text-app-error">
                <p className="text-destructive">
                  {status === 404 || status === 403 || status === 401 ? "This app doesn't exist or isn't assigned to you." : apiErrorMessage(error, "Could not load this app.")}
                </p>
                {status !== 404 && status !== 403 && status !== 401 && <button type="button" onClick={() => refetch()} className="mt-2 underline underline-offset-4" data-testid="button-retry-app">Retry</button>}
              </div>
            )}
            {data && (
              <>
                <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">App</p>
                <h1 className="font-display mt-2 text-5xl text-foreground md:text-6xl" data-testid="text-app-name">{data.app.name}</h1>
                <Card id="links" title="Test and open your app"><AppLinks app={data.app} />
                  {!data.app.siteUrl && !data.app.previewUrl && !data.app.testflightUrl && (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="text-setup-pending">Setup is pending. We'll add your links here as soon as they're ready.</p>
                  )}
                  {staff && <a href={data.app.expoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-muted-foreground underline underline-offset-4" data-testid="link-expo-dashboard">Expo project dashboard (studio only)</a>}
                </Card>
                <Card id="builds" title="Recent builds"><BuildList builds={data.builds} error={data.buildError} /></Card>
                {staff && (
                  <>
                    <Card id="settings" title="App settings"><AppSettings app={data.app} /></Card>
                    <Card id="assign" title="Assigned clients"><Assignments id={data.app.id} users={data.assignedUsers} /></Card>
                    <Card id="automation" title="TestFlight automation"><Automation app={data.app} /></Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

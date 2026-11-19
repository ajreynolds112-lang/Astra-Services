import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2 } from "lucide-react";
import {
  useSearchAppUsers, useAssignAppUser, useUnassignAppUser, useUpdateClientApp,
  useEmailAppInstructions,
  useConfigureAppAutomation, useRequestAppBuild,
  getGetClientAppQueryKey, getGetClientAppsQueryKey, getSearchAppUsersQueryKey,
  type AppDetails, type AppUser, type ClientApp,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";

const input = "w-full rounded-xl border border-input bg-white px-4 py-2.5 text-[15px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const btn = "rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60";
const solid = "rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-60";

function useRefresh(id: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetClientAppQueryKey(id) }),
    qc.invalidateQueries({ queryKey: getGetClientAppsQueryKey() }),
  ]);
}

export function Assignments({ id, users }: { id: string; users: AppUser[] }) {
  const refresh = useRefresh(id);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const enabled = term.length >= 2;
  const search = useSearchAppUsers({ q: term }, { query: { enabled, queryKey: getSearchAppUsersQueryKey({ q: term }) } });
  const assign = useAssignAppUser();
  const unassign = useUnassignAppUser();
  const email = useEmailAppInstructions();
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const assignedIds = new Set(users.map((u) => u.id));

  function showDelivery(u: AppUser) {
    setNotice({ text: u.emailMessage ?? "No email delivery confirmation was returned.", failed: u.emailDelivery !== "sent" });
  }
  function onAssign(u: AppUser) {
    setNotice(null);
    assign.mutate({ id, data: { userId: u.id } }, { onSuccess: (result) => { showDelivery(result); setQ(""); setTerm(""); refresh(); } });
  }
  function onAssignEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    assign.mutate({ id, data: { email: inviteEmail.trim() } }, {
      onSuccess: (result) => { showDelivery(result); setInviteEmail(""); refresh(); },
    });
  }
  function onEmail(u: AppUser) {
    setNotice(null);
    email.mutate({ id, userId: u.id }, { onSuccess: showDelivery });
  }
  function onRemove(u: AppUser) {
    if (!window.confirm(`Remove ${u.email} from this app?`)) return;
    unassign.mutate({ id, userId: u.id }, { onSuccess: () => { refresh(); } });
  }
  const err = assign.error ?? unassign.error ?? email.error;

  return (
    <div data-testid="section-assignments">
      <form onSubmit={onAssignEmail} className="mb-6">
        <label htmlFor="input-assignment-email" className="text-sm font-medium text-foreground">Assign by email</label>
        <p className="mt-1 text-xs text-muted-foreground">Any email can be assigned—no purchase or existing account required. They must sign up or sign in and verify that same email to see this project.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="input-assignment-email" type="email" required maxLength={254} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@example.com" className={`${input} min-w-0 flex-1`} data-testid="input-assignment-email" />
          <button type="submit" className={`${btn} min-h-11 shrink-0`} disabled={assign.isPending || email.isPending || !inviteEmail.trim()} data-testid="button-assign-email">{assign.isPending ? "Assigning…" : "Assign email"}</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">New assignments also send phone setup instructions when email delivery is configured. An email failure does not remove their access.</p>
      </form>
      <label htmlFor="input-user-search" className="text-sm font-medium text-foreground">Or find a registered account</label>
      <input id="input-user-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email (2+ characters)" className={`${input} mt-2`} data-testid="input-user-search" />
      {enabled && term === q.trim() && (
        <div className="mt-2" aria-live="polite">
          {search.isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
          {search.isError && <p className="text-sm text-destructive" role="alert">{apiErrorMessage(search.error, "Search failed.")}</p>}
          {search.data && search.data.length === 0 && <p className="text-sm text-muted-foreground" data-testid="text-no-results">No registered account matches. You can still assign their email above.</p>}
          <ul className="divide-y divide-border rounded-xl border border-border">
            {search.data?.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm" data-testid={`row-result-${u.id}`}>
                <span className="min-w-0 truncate"><span className="text-foreground">{u.name}</span> <span className="text-muted-foreground">{u.email}</span></span>
                <button type="button" className={btn} disabled={assign.isPending || assignedIds.has(u.id)} onClick={() => onAssign(u)} data-testid={`button-assign-${u.id}`}>
                  {assignedIds.has(u.id) ? "Assigned" : "Assign"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{apiErrorMessage(err, "Could not update assignments.")}</p>}
      {notice && <p className={`mt-3 text-sm ${notice.failed ? "text-destructive" : "text-foreground"}`} role={notice.failed ? "alert" : "status"} data-testid="text-onboarding-result">{notice.text}</p>}
      <h3 className="mt-6 text-sm font-medium text-foreground">Assigned users</h3>
      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-no-assigned">Nobody is assigned to this app yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid={`row-assigned-${u.id}`}>
              <span className="min-w-0 truncate"><span className="text-foreground">{u.name}</span> <span className="text-muted-foreground">{u.email}</span></span>
              <div className="flex shrink-0 items-center gap-3">
                <button type="button" onClick={() => onEmail(u)} disabled={email.isPending || assign.isPending} className={`${btn} inline-flex min-h-11 items-center gap-1.5`} aria-label={`Send phone instructions to ${u.email}`} data-testid={`button-email-${u.id}`}>
                  <Mail className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Send instructions</span>
                </button>
                <button type="button" onClick={() => onRemove(u)} disabled={unassign.isPending || email.isPending} aria-label={`Remove ${u.email}`} className="min-h-11 min-w-8 text-muted-foreground hover:text-destructive disabled:opacity-60" data-testid={`button-unassign-${u.id}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AppSettings({ app }: { app: ClientApp }) {
  const refresh = useRefresh(app.id);
  const update = useUpdateClientApp();
  const init = () => ({
    siteUrl: app.siteUrl ?? "", previewUrl: app.previewUrl ?? "", testflightUrl: app.testflightUrl ?? "",
    repositoryUrl: app.repositoryUrl ?? "", appDirectory: app.appDirectory ?? "", ascAppId: app.ascAppId ?? "",
  });
  const [v, setV] = useState(init);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setV(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [app.id, app.updatedAt]);
  const nul = (s: string) => (s.trim() === "" ? null : s.trim());
  const badAsc = v.ascAppId.trim() !== "" && !/^\d+$/.test(v.ascAppId.trim());

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (badAsc) return;
    setSaved(false);
    update.mutate(
      { id: app.id, data: { siteUrl: nul(v.siteUrl), previewUrl: nul(v.previewUrl), testflightUrl: nul(v.testflightUrl), repositoryUrl: nul(v.repositoryUrl), appDirectory: v.appDirectory.trim(), ascAppId: nul(v.ascAppId) } },
      { onSuccess: () => { setSaved(true); refresh(); } },
    );
  }
  const fields: { k: keyof typeof v; label: string; help: string; type?: string }[] = [
    { k: "siteUrl", label: "Website URL", help: "Shown to clients as the website link.", type: "url" },
    { k: "previewUrl", label: "Expo Go link", help: "Paste the public exp:// or exps:// link from the mobile app’s running preview. Not an Expo dashboard, website, local Wi-Fi URL, or development-build link.", type: "text" },
    { k: "testflightUrl", label: "TestFlight invite URL", help: "Only paste an actual public TestFlight link.", type: "url" },
    { k: "repositoryUrl", label: "Native repository URL", help: "Source repo for the automated native workflow. Never shown to clients.", type: "url" },
    { k: "appDirectory", label: "App directory in repo", help: "Folder containing the Expo app, e.g. apps/mobile." },
    { k: "ascAppId", label: "App Store Connect app ID", help: "Numeric Apple ID. Leave blank if not created yet." },
  ];
  return (
    <form onSubmit={onSubmit} noValidate data-testid="form-app-settings" className="space-y-4">
      {fields.map((f) => (
        <div key={f.k}>
          <label htmlFor={`field-${f.k}`} className="text-sm font-medium text-foreground">{f.label}</label>
          <input id={`field-${f.k}`} type={f.type ?? "text"} value={v[f.k]} onChange={(e) => { setSaved(false); setV((s) => ({ ...s, [f.k]: e.target.value })); }} aria-describedby={`help-${f.k}`} aria-invalid={f.k === "ascAppId" && badAsc} inputMode={f.k === "ascAppId" ? "numeric" : undefined} className={`${input} mt-1.5`} data-testid={`input-${f.k}`} />
          <p id={`help-${f.k}`} className="mt-1 text-xs text-muted-foreground">{f.help}</p>
        </div>
      ))}
      {badAsc && <p className="text-sm text-destructive" role="alert">App Store Connect ID must be numeric.</p>}
      {update.isError && <p className="text-sm text-destructive" role="alert">{apiErrorMessage(update.error, "Could not save settings.")}</p>}
      {saved && <p className="text-sm text-foreground" role="status" data-testid="text-settings-saved">Settings saved.</p>}
      <button type="submit" disabled={update.isPending || badAsc} className={solid} data-testid="button-save-settings">{update.isPending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

export function Automation({ app }: { app: AppDetails["app"] }) {
  const refresh = useRefresh(app.id);
  const configure = useConfigureAppAutomation();
  const build = useRequestAppBuild();
  const [note, setNote] = useState<{ message: string; url: string | null } | null>(null);

  function onConfigure() {
    if (!window.confirm("This writes a GitHub Actions workflow and eas.json into the native repo for this app. Continue?")) return;
    setNote(null);
    configure.mutate({ id: app.id }, { onSuccess: (r) => { setNote({ message: r.message, url: r.url || null }); refresh(); } });
  }
  function onBuild() {
    if (!window.confirm("Build and submit to TestFlight? EAS build usage and charges may apply to the studio Expo account. This only proceeds if Expo iOS credentials and the App Store Connect app are set up.")) return;
    setNote(null);
    build.mutate({ id: app.id }, { onSuccess: (r) => { setNote({ message: r.message, url: r.url || null }); refresh(); } });
  }
  const err = configure.error ?? build.error;
  return (
    <div data-testid="section-automation">
      <p className="text-sm text-muted-foreground">
        Requires Expo iOS credentials and an App Store Connect app. A finished build is not Apple approval; external beta testers need Apple beta review approval.
      </p>
      <p className="mt-3 text-sm text-foreground" data-testid="text-automation-state">
        Automation: {app.automationConfigured ? "configured" : "not configured"}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onConfigure} disabled={configure.isPending || !app.repositoryUrl} className={btn} data-testid="button-configure-automation">
          {configure.isPending ? "Configuring…" : "Configure TestFlight automation"}
        </button>
        {app.automationConfigured && (
          <button type="button" onClick={onBuild} disabled={build.isPending} className={solid} data-testid="button-request-build">
            {build.isPending ? "Requesting…" : "Build and submit to TestFlight"}
          </button>
        )}
      </div>
      {!app.repositoryUrl && <p className="mt-2 text-xs text-muted-foreground">Save a native repository URL in settings first.</p>}
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{apiErrorMessage(err, "Action failed.")}</p>}
      {note && (
        <p className="mt-3 text-sm text-foreground" role="status" data-testid="text-automation-result">
          {note.message}{" "}
          {note.url && <a href={note.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">View</a>}
        </p>
      )}
    </div>
  );
}

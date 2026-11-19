import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Link } from "wouter";
import { ArrowRight, Check, LogOut } from "lucide-react";
import {
  useGetPortalMe,
  useCreateTweakRequest,
  useSendTestTweakRequest,
  useConfirmTweakRequest,
  getGetPortalMeQueryKey,
  type PortalMe,
  type TweakRequestInput,
  type TweakRequestResult,
} from "@workspace/api-client-react";
import { Mark } from "@/components/chrome";
import { DevSection } from "@/components/dev-section";
import { RequestInbox } from "@/components/request-inbox";
import { BillingSection } from "@/components/billing-section";
import { AppsSection } from "@/components/apps/apps-section";
import { apiErrorMessage, money } from "@/lib/format";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type TextKey = Exclude<keyof TweakRequestInput, "priority">;

type Prompt = {
  key: TextKey;
  label: string;
  help: string;
  min: number;
  max: number;
  multiline: boolean;
  required: boolean;
  placeholder: string;
};

const PROMPTS: Prompt[] = [
  { key: "appName", label: "Which app is this for?", help: "The app's name as you know it.", min: 2, max: 120, multiline: false, required: true, placeholder: "e.g. CYBAZONE" },
  { key: "title", label: "Give the change a short title", help: "One line we can use to track it.", min: 5, max: 140, multiline: false, required: true, placeholder: "e.g. Let players save favorite loadouts" },
  { key: "currentBehavior", label: "What does the app do right now?", help: "Describe how this part of the app currently works, or what's missing or broken.", min: 40, max: 5000, multiline: true, required: true, placeholder: "Right now, when a player opens the Loadout screen…" },
  { key: "desiredBehavior", label: "Exactly how should it work after the change?", help: "Be specific: what appears, what each control does, what text it shows, what happens with edge cases.", min: 80, max: 8000, multiline: true, required: true, placeholder: "After the change, there should be a star button next to each loadout. Tapping it…" },
  { key: "location", label: "Where in the app does this happen?", help: "Name the screens, pages, menus, buttons or features involved.", min: 10, max: 3000, multiline: true, required: true, placeholder: "Main menu → Loadouts screen, and the pre-match lobby" },
  { key: "userFlow", label: "Walk us through it step by step", help: "From the user's point of view, list each step in order — what they tap and what they see.", min: 40, max: 8000, multiline: true, required: true, placeholder: "1. Player opens Loadouts\n2. Taps the star on a loadout\n3. …" },
  { key: "acceptanceCriteria", label: "How will we know it's done?", help: "List what must be true for you to call this finished.", min: 30, max: 5000, multiline: true, required: true, placeholder: "- Favorites appear at the top of the list\n- Favorites persist after closing the app\n- …" },
  { key: "notes", label: "Anything else? (optional)", help: "Links, references, design ideas, deadlines.", min: 0, max: 5000, multiline: true, required: false, placeholder: "" },
];

const PRIORITIES: { value: TweakRequestInput["priority"]; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const EMPTY: TweakRequestInput = {
  appName: "", title: "", currentBehavior: "", desiredBehavior: "", location: "",
  userFlow: "", acceptanceCriteria: "", priority: "normal", notes: "",
};

export function PortalHeader() {
  const { signOut } = useClerk();
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-foreground" data-testid="link-portal-home">
          <Mark className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold tracking-[0.32em]">ASTRA</span>
          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Portal</span>
        </Link>
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="button-sign-out"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </header>
  );
}

export default function Portal() {
  const { data: me, isLoading, error } = useGetPortalMe();

  return (
    <div className="min-h-[100dvh] bg-background">
      <PortalHeader />
      <main className="mx-auto max-w-4xl px-6 py-14">
        {isLoading && <p className="text-sm text-muted-foreground" data-testid="text-loading">Loading your account…</p>}
        {error && <p className="text-sm text-destructive" data-testid="text-error">{apiErrorMessage(error, "Could not load your account.")}</p>}
        {me && (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Signed in as {me.email}</p>
            <h1 className="font-display mt-3 text-5xl text-foreground md:text-6xl" data-testid="text-welcome">
              Hello, {me.name.split(" ")[0] || "there"}.
            </h1>
            <AppsSection me={me} />
            {me.subscribed || me.isDev || me.isOwner ? (
              <>
                <BillingSection />
                <p className="mt-4 max-w-xl text-muted-foreground">
                  {me.subscribed ? (
                    <>Your plan{me.plans.length > 1 ? "s" : ""}: <span className="text-foreground" data-testid="text-plans">{me.plans.join(", ")}</span>. </>
                  ) : (
                    <><span className="text-foreground" data-testid="text-access">{me.isOwner ? "Owner account" : "Dev access"}</span>. </>
                  )}
                  Need something changed in your app? Send a tweak request below — the more detail, the faster we can build it. Requests are turned around in under a day.
                </p>
                <Allowance me={me} />
                {me.isOwner && <DevSection ownerEmail={me.email} />}
                {(me.isOwner || me.isDev) && <RequestInbox />}
                <TweakForm me={me} />
              </>
            ) : (
              <NotSubscribed email={me.email} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export function NotSubscribed({ email }: { email: string }) {
  return (
    <div className="mt-10 rounded-3xl border border-border bg-card p-8" data-testid="card-not-subscribed">
      <h2 className="text-xl font-semibold text-foreground">App tweak requests are for active subscribers</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        We couldn't find an active plan for <span className="text-foreground">{email}</span>. If you subscribed with a different email, sign in with that one. Otherwise, choose a plan to get started.
      </p>
      <a href={`${basePath}/#plans`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background" data-testid="link-see-plans">
        See plans <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

function isStaff(me: PortalMe) {
  return me.isOwner || me.isDev;
}

function Allowance({ me }: { me: PortalMe }) {
  const fee = money(me.requestFee);
  let text: string;
  if (isStaff(me)) text = "Requests are free on your account.";
  else if (me.freeRequestsPerMonth > 0)
    text = me.freeRequestsRemaining > 0
      ? `${me.freeRequestsRemaining} of ${me.freeRequestsPerMonth} free requests left this month. After that, each request is a flat ${fee}.`
      : `You've used this month's ${me.freeRequestsPerMonth} free requests. Additional requests are a flat ${fee} each; your free requests reset on the 1st.`;
  else text = `Each request is a flat ${fee}, paid securely through Stripe when you send it.`;
  return (
    <div className="mt-6 inline-flex max-w-xl items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm text-foreground" data-testid="text-allowance">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      {text}
    </div>
  );
}

function TweakForm({ me }: { me: PortalMe }) {
  const canTest = me.isOwner;
  const needsFee = !isStaff(me) && me.freeRequestsRemaining <= 0;
  const qc = useQueryClient();
  const [values, setValues] = useState<TweakRequestInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<(TweakRequestResult & { test: boolean }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const realMutation = useCreateTweakRequest();
  const testMutation = useSendTestTweakRequest();
  const confirmMutation = useConfirmTweakRequest();
  const [asTest, setAsTest] = useState(false);
  const mutation = asTest ? testMutation : realMutation;

  // Returning from Stripe after paying (or cancelling) a request fee.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("request_session");
    const cancelled = params.get("request_cancelled");
    if (!sessionId && !cancelled) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (cancelled) {
      setNotice("Payment was cancelled, so your request wasn't sent. You can send it again whenever you're ready.");
      return;
    }
    confirmMutation.mutate(
      { data: { sessionId: sessionId! } },
      {
        onSuccess: (r) => {
          if (r.status === "delivered") setResult({ ...r, test: false });
          else setNotice("We haven't received the payment for that request yet. If you completed it, refresh in a minute.");
        },
      },
    );
  }, [confirmMutation]);

  const problems = PROMPTS.filter((p) => {
    const len = (values[p.key] ?? "").trim().length;
    return p.required && len < p.min;
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problems.length > 0) return;
    const payload: TweakRequestInput = { ...values };
    if (!payload.notes?.trim()) delete payload.notes;
    mutation.mutate(
      { data: payload },
      {
        onSuccess: (r) => {
          if (r.status === "payment_required" && r.checkoutUrl) {
            window.location.href = r.checkoutUrl;
            return;
          }
          setResult({ ...r, test: asTest });
          qc.invalidateQueries({ queryKey: getGetPortalMeQueryKey() });
        },
      },
    );
  }

  if (confirmMutation.isPending) {
    return <p className="mt-10 text-sm text-muted-foreground" data-testid="text-confirming">Confirming your payment and sending your request…</p>;
  }

  if (result) {
    return (
      <div className="mt-10 rounded-3xl border border-border bg-card p-8" data-testid="card-request-sent">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></div>
        <h2 className="mt-5 text-2xl font-semibold text-foreground">{result.test ? "Test request sent" : "Request received"}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {result.test
            ? `Saved to the repo's Requests folder${result.emailed ? " and emailed to you" : " (the email didn't go out — check the server logs)"}. File:`
            : "We've logged your request and will have it done in under a day. Reference:"} <span className="font-mono text-foreground" data-testid="text-file-name">{result.fileName}</span>
        </p>
        <button
          type="button"
          onClick={() => { setResult(null); setValues(EMPTY); setTouched(false); realMutation.reset(); testMutation.reset(); }}
          className="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          data-testid="button-new-request"
        >
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-10 rounded-3xl border border-border bg-card p-6 md:p-10" data-testid="form-tweak-request">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">App Tweaks Request</h2>
      <p className="mt-1 text-sm text-muted-foreground">All questions marked required must be answered in detail.</p>
      {notice && <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-foreground" role="status" data-testid="text-request-notice">{notice}</p>}
      {confirmMutation.isError && (
        <p className="mt-4 text-sm text-destructive" role="alert">{apiErrorMessage(confirmMutation.error, "We couldn't confirm that payment. Please contact us.")}</p>
      )}

      <div className="mt-8 space-y-7">
        {PROMPTS.map((p, i) => {
          const value = values[p.key] ?? "";
          const len = value.trim().length;
          const invalid = touched && p.required && len < p.min;
          const id = `field-${p.key}`;
          const common = {
            id,
            value,
            maxLength: p.max,
            placeholder: p.placeholder,
            "aria-invalid": invalid,
            "aria-describedby": `${id}-help`,
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [p.key]: e.target.value })),
            className: `w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20 ${invalid ? "border-destructive" : "border-input"}`,
            "data-testid": `input-${p.key}`,
          };
          return (
            <div key={p.key}>
              <label htmlFor={id} className="flex items-baseline gap-3 text-[15px] font-medium text-foreground">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {p.label}
                {p.required && <span className="text-xs font-normal text-muted-foreground">Required</span>}
              </label>
              <p id={`${id}-help`} className="mb-2 mt-1 pl-8 text-sm text-muted-foreground">{p.help}</p>
              <div className="pl-8">
                {p.multiline ? <textarea rows={5} {...common} /> : <input type="text" {...common} />}
                {p.required && p.min > 10 && (
                  <p className={`mt-1.5 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
                    {len < p.min ? `At least ${p.min} characters — ${p.min - len} to go` : `${len} characters`}
                  </p>
                )}
                {invalid && p.min <= 10 && <p className="mt-1.5 text-xs text-destructive">This answer is required.</p>}
              </div>
            </div>
          );
        })}

        <fieldset>
          <legend className="flex items-baseline gap-3 text-[15px] font-medium text-foreground">
            <span className="font-mono text-xs text-muted-foreground">{String(PROMPTS.length + 1).padStart(2, "0")}</span>
            How urgent is this?
            <span className="text-xs font-normal text-muted-foreground">Required</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2 pl-8">
            {PRIORITIES.map((p) => (
              <label
                key={p.value}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${values.priority === p.value ? "border-foreground bg-foreground text-background" : "border-input text-foreground hover:bg-muted"}`}
              >
                <input
                  type="radio"
                  name="priority"
                  value={p.value}
                  checked={values.priority === p.value}
                  onChange={() => setValues((v) => ({ ...v, priority: p.value }))}
                  className="sr-only"
                  data-testid={`radio-priority-${p.value}`}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {touched && problems.length > 0 && (
        <p className="mt-8 text-sm text-destructive" role="alert" data-testid="text-form-problems">
          {problems.length} answer{problems.length > 1 ? "s need" : " needs"} more detail before you can send.
        </p>
      )}
      {mutation.isError && (
        <p className="mt-8 text-sm text-destructive" role="alert" data-testid="text-submit-error">
          {apiErrorMessage(mutation.error, "Something went wrong. Please try again.")}
        </p>
      )}

      {canTest && (
        <label className="mt-8 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={asTest}
            onChange={(e) => setAsTest(e.target.checked)}
            className="h-4 w-4"
            data-testid="checkbox-send-as-test"
          />
          Send as a test request (marked TEST in the repo and email)
        </label>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-transform hover:scale-[1.02] disabled:opacity-60"
        data-testid="button-submit-request"
      >
        {mutation.isPending
          ? needsFee && !asTest ? "Opening payment…" : "Sending…"
          : asTest ? "Send test request" : needsFee ? `Pay ${money(me.requestFee)} and send` : "Send request"} <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

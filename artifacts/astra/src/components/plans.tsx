import { useState } from "react";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { getGetStudioQueryKey, useCreateCheckout, useGetStudio, useListPlans, type PaymentPlan } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/reveal";
import { apiErrorMessage, intervalPlural, money } from "@/lib/format";
import { GithubRepositoryFields, type GithubRepositoryStatus } from "@/components/github-repository-fields";

const serviceLabel: Record<string, string> = { design: "Design", hosting: "Hosting", bundle: "Design + Hosting" };

function PlanCard({ plan: initialPlan, options, onStart, paymentsEnabled }: { plan: PaymentPlan; options?: PaymentPlan[]; onStart: (plan: PaymentPlan) => void; paymentsEnabled: boolean }) {
  const [selectedPriceId, setSelectedPriceId] = useState(initialPlan.priceId);
  const plan = options?.find((option) => option.priceId === selectedPriceId) ?? initialPlan;
  const f = plan.featured;
  return (
    <div
      className={`group relative flex h-full flex-col rounded-[28px] p-8 transition-transform duration-500 hover:-translate-y-1 ${f ? "ultra shadow-[0_30px_80px_-30px_hsl(236_92%_54%/0.6)]" : "border border-border bg-card"}`}
      data-testid={`card-plan-${plan.priceId}`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] uppercase tracking-[0.2em] ${f ? "text-white/70" : "text-muted-foreground"}`}>{serviceLabel[plan.service]}</span>
        {f && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground">Most chosen</span>}
      </div>
      <h3 className="font-display mt-6 text-4xl">{plan.service === "bundle" ? "Design + Hosting" : plan.name}</h3>
      <p className={`mt-2 text-sm ${f ? "text-white/75" : "text-muted-foreground"}`}>{plan.description}</p>
      {options && options.length > 1 && (
        <div className="mt-6">
          <label htmlFor="bundle-schedule" className="mb-2 block text-sm text-white/80">Choose your payment schedule</label>
          <select
            id="bundle-schedule"
            value={plan.priceId}
            onChange={(event) => setSelectedPriceId(event.target.value)}
            className="w-full rounded-xl border border-white/30 bg-background px-3 py-3 text-sm text-foreground"
            data-testid="select-bundle-schedule"
          >
            {options.map((option) => (
              <option key={option.priceId} value={option.priceId}>
                {money(option.installmentAmount, option.currency)}/month × {option.installments} months
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-8">
        <div className="flex items-baseline gap-1.5">
          <span className="text-5xl font-semibold tracking-tight" data-testid={`text-price-${plan.priceId}`}>{money(plan.installmentAmount, plan.currency)}</span>
          <span className={f ? "text-white/70" : "text-muted-foreground"}>/ {plan.interval}</span>
        </div>
        <p className={`mt-2 text-sm ${f ? "text-white/80" : "text-muted-foreground"}`}>
          {plan.installments != null
            ? <>for {plan.installments} {intervalPlural(plan.interval, plan.installments)}{plan.totalAmount != null && <> · {money(plan.totalAmount, plan.currency)} total</>}</>
            : <>Ongoing · cancel anytime</>}
        </p>
        {plan.afterAmount != null && (
          <p className={`mt-1 text-sm ${f ? "text-white/80" : "text-muted-foreground"}`} data-testid={`text-after-${plan.priceId}`}>
            Then {money(plan.afterAmount, plan.currency)} / {plan.interval} for hosting
          </p>
        )}
        {plan.payInFull && (
          <p className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${f ? "bg-white/15 text-white" : "bg-primary/10 text-primary"}`} data-testid={`text-pay-in-full-${plan.priceId}`}>
            Or {money(plan.payInFull.amount, plan.currency)} paid in full · save 20%
          </p>
        )}
      </div>
      <ul className="mt-8 flex-1 space-y-3 text-sm">
        {plan.features.map((ft, i) => (
          <li key={i} className="flex gap-3"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${f ? "text-accent" : "text-primary"}`} />{ft}</li>
        ))}
      </ul>
      <button
        disabled={!paymentsEnabled}
        onClick={() => onStart(plan)}
        className={`mt-10 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${f ? "bg-background text-foreground hover:bg-white" : "bg-foreground text-background hover:bg-primary"}`}
        data-testid={`button-start-${plan.priceId}`}
      >
        {paymentsEnabled ? <>Start this plan <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></> : "Online payments coming soon"}
      </button>
    </div>
  );
}

function StartDialog({ plan, onClose }: { plan: PaymentPlan | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payInFull, setPayInFull] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GithubRepositoryStatus>("unknown");
  const [githubUrls, setGithubUrls] = useState([""]);
  const checkout = useCreateCheckout();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    setError(null);
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) { setError("Add your name and a valid email."); return; }
    const repositoryUrls = githubUrls.map((url) => url.trim()).filter(Boolean);
    if (githubStatus === "yes" && repositoryUrls.length === 0) {
      setError("Add at least one GitHub repository link, or leave the answer blank if you're not sure.");
      return;
    }
    checkout.mutate(
      { data: {
        priceId: plan.priceId, name: name.trim(), email: email.trim(), payInFull: payInFull && !!plan.payInFull,
        githubRepositoryStatus: repositoryUrls.length ? "yes" : githubStatus,
        githubRepositoryUrls: repositoryUrls,
      } },
      { onSuccess: (r) => { window.location.href = r.url; }, onError: (err) => setError(apiErrorMessage(err, "We couldn't open checkout. Please try again.")) },
    );
  };
  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[28px] border-border bg-card p-8 sm:max-w-md">
        <DialogHeader>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{plan && serviceLabel[plan.service]}</p>
          <DialogTitle className="font-display text-3xl font-normal">{plan?.name}</DialogTitle>
          <DialogDescription>
            {plan && (plan.installments == null
              ? `${money(plan.installmentAmount, plan.currency)} / ${plan.interval}, ongoing. Cancel anytime.`
              : payInFull && plan.payInFull
                ? `${money(plan.payInFull.amount, plan.currency)} today, once. That's ${money(plan.payInFull.savings, plan.currency)} off.`
                : `${money(plan.installmentAmount, plan.currency)} / ${plan.interval} for ${plan.installments} ${intervalPlural(plan.interval, plan.installments)}. Only the first payment today.`)}
            {plan?.afterAmount != null && ` Hosting continues at ${money(plan.afterAmount, plan.currency)} / ${plan.interval} after ${plan.installments} ${intervalPlural(plan.interval, plan.installments ?? 0)}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-4">
          {plan?.payInFull && plan.installments != null && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment option">
              {[
                { full: false, title: "Monthly", sub: `${money(plan.installmentAmount, plan.currency)} × ${plan.installments}` },
                { full: true, title: "Pay in full", sub: `${money(plan.payInFull.amount, plan.currency)} · save 20%` },
              ].map((o) => (
                <button
                  key={String(o.full)}
                  type="button"
                  role="radio"
                  aria-checked={payInFull === o.full}
                  onClick={() => setPayInFull(o.full)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${payInFull === o.full ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-secondary"}`}
                  data-testid={`button-option-${o.full ? "full" : "monthly"}`}
                >
                  <span className="block text-sm font-medium text-foreground">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.sub}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="co-name">Your name</Label><Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" data-testid="input-checkout-name" /></div>
          <div className="space-y-1.5"><Label htmlFor="co-email">Email</Label><Input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" data-testid="input-checkout-email" /></div>
          <GithubRepositoryFields status={githubStatus} urls={githubUrls}
            onStatusChange={(status) => { setGithubStatus(status); setError(null); }}
            onUrlsChange={(urls) => { setGithubUrls(urls); setError(null); }} />
          {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-checkout-error">{error}</p>}
          <button type="submit" disabled={checkout.isPending} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60" data-testid="button-checkout-submit">
            {checkout.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure checkout</> : <>Continue to payment <ArrowRight className="h-4 w-4" /></>}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Secured by Stripe. We never see your card.</p>
          <p className="text-center text-xs text-muted-foreground">By continuing you agree to our <a href={`${import.meta.env.BASE_URL}terms`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">Terms of Service</a>.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Plans() {
  const { data: plans, isLoading, isError, refetch } = useListPlans();
  const { data: studio } = useGetStudio({
    query: {
      queryKey: getGetStudioQueryKey(),
      refetchInterval: (query) => query.state.data?.paymentsEnabled ? false : 5000,
    },
  });
  const paymentsEnabled = studio?.paymentsEnabled === true;
  const [active, setActive] = useState<PaymentPlan | null>(null);
  const bundles = plans?.filter((plan) => plan.service === "bundle")
    .sort((a, b) => (a.installments ?? 0) - (b.installments ?? 0)) ?? [];
  const cards = plans?.filter((plan) => plan.service !== "bundle" || plan.priceId === bundles[0]?.priceId) ?? [];

  return (
    <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-28 md:py-40">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Plans</p>
        <h2 className="font-display mt-4 text-5xl md:text-7xl">Pick a pace.<br /><span className="italic text-muted-foreground">Not a lump sum.</span></h2>
      </Reveal>
      <div className="mt-16">
        {!paymentsEnabled && (
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Online payments are not available yet. <a href="#contact" className="text-foreground underline underline-offset-4">Contact us about your project</a>.
          </p>
        )}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-[28px]" />)}</div>
        ) : isError ? (
          <div className="mx-auto max-w-md rounded-[28px] border border-border bg-card p-10 text-center">
            <p className="font-display text-3xl">Plans didn't load.</p>
            <p className="mt-2 text-sm text-muted-foreground">A brief hiccup on our side.</p>
            <button onClick={() => refetch()} className="mt-6 rounded-full bg-foreground px-5 py-2 text-sm text-background" data-testid="button-retry-plans">Try again</button>
          </div>
        ) : !plans || plans.length === 0 ? (
          <Reveal>
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[32px] ultra p-10 text-center md:p-16" data-testid="status-plans-empty">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/15 orbit" />
              <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full border border-white/10 orbit-rev" />
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/70">In progress</p>
              <h3 className="font-display mt-4 text-4xl md:text-5xl">Payment plans are being finalized.</h3>
              <p className="mx-auto mt-4 max-w-md text-white/80">Every project still gets a monthly plan. Tell us what you're building and we'll shape one around your runway.</p>
              <a href="#contact" className="mt-8 inline-flex items-center gap-2 rounded-full bg-background px-6 py-3 text-sm font-medium text-foreground transition-transform hover:scale-[1.03]" data-testid="link-empty-contact">Tell us about your project <ArrowRight className="h-4 w-4" /></a>
            </div>
          </Reveal>
        ) : (
          <div className={`grid gap-6 ${plans.length === 1 ? "mx-auto max-w-md" : plans.length === 2 ? "mx-auto max-w-4xl md:grid-cols-2" : "md:grid-cols-3"}`}>
            {cards.map((p, i) => <Reveal key={p.priceId} delay={i * 0.08} className="h-full"><PlanCard plan={p} options={p.service === "bundle" ? bundles : undefined} paymentsEnabled={paymentsEnabled} onStart={setActive} /></Reveal>)}
          </div>
        )}
      </div>
      {paymentsEnabled && <StartDialog key={active?.priceId ?? "none"} plan={active} onClose={() => setActive(null)} />}
    </section>
  );
}

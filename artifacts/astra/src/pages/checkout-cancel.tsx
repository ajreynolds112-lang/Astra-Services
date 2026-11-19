import { StatusShell } from "@/components/status-shell";

export default function CheckoutCancel() {
  return (
    <StatusShell eyebrow="Checkout cancelled" title="No charge made." accent="Take all the time you need." tone="muted">
      <p className="mx-auto max-w-sm text-muted-foreground">Have a question about a plan, or want a schedule that fits better? We're happy to talk it through.</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a href="/#plans" className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground" data-testid="link-cancel-plans">Back to plans</a>
        <a href="/#contact" className="rounded-full px-6 py-3 text-sm font-medium hover:bg-secondary" data-testid="link-cancel-contact">Ask us anything</a>
      </div>
    </StatusShell>
  );
}

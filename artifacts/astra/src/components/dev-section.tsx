import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DevAccess } from "@/components/dev-access";
import { TestRequests } from "@/components/test-requests";
import { PromoCodes } from "@/components/promo-codes";
import { PurchaseHistory } from "@/components/purchase-history";

const TRIGGER =
  "h-auto whitespace-normal rounded-xl px-3 py-2 text-center text-sm data-[state=active]:bg-white";

/** Owner-only panel, split into tabs. */
export function DevSection({ ownerEmail }: { ownerEmail: string }) {
  return (
    <section className="mt-10 min-w-0 rounded-3xl border border-border bg-card p-6 md:p-10" data-testid="section-dev">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Dev</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Owner only</span>
      </div>
      <Tabs defaultValue="dev-access" className="mt-6">
        <TabsList aria-label="Dev sections" className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl p-1 md:grid-cols-4">
          <TabsTrigger value="dev-access" className={TRIGGER} data-testid="tab-dev-access">Dev access</TabsTrigger>
          <TabsTrigger value="promo-codes" className={TRIGGER} data-testid="tab-promo-codes">Promo codes</TabsTrigger>
          <TabsTrigger value="test-requests" className={TRIGGER} data-testid="tab-test-requests">Test requests</TabsTrigger>
          <TabsTrigger value="purchase-history" className={TRIGGER} data-testid="tab-purchase-history">Purchase history</TabsTrigger>
        </TabsList>
        <TabsContent value="dev-access" className="mt-8"><DevAccess ownerEmail={ownerEmail} /></TabsContent>
        <TabsContent value="promo-codes" className="mt-8"><PromoCodes /></TabsContent>
        <TabsContent value="test-requests" className="mt-8"><TestRequests /></TabsContent>
        <TabsContent value="purchase-history" className="mt-8"><PurchaseHistory /></TabsContent>
      </Tabs>
    </section>
  );
}

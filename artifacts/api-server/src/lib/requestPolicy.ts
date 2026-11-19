import type { PaymentPlan } from "./plans";

/** Clients with multiple plans retain the benefits of their design tier. */
export function getRequestPolicy(plans: ReadonlyArray<Pick<PaymentPlan, "service" | "freeRequestsPerMonth">>) {
  const hostingOnly = plans.length > 0 && plans.every((plan) => plan.service === "hosting");
  return {
    requestFee: hostingOnly ? 2500 : 2000,
    freeRequestsPerMonth: Math.max(0, ...plans.map((plan) => plan.freeRequestsPerMonth)),
  };
}
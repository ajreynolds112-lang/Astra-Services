/** A fully discounted order has no payment, but must still complete Stripe checkout. */
export function checkoutSettled(session: { status: string | null; payment_status: string }): boolean {
  return session.status === "complete"
    && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
}
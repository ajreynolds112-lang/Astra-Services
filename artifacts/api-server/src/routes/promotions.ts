import { Router, type IRouter } from "express";
import { CreatePromotionBody, CreatePromotionResponse, ListPromotionsResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/account";
import { requireOwner } from "./dev";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { PAYMENTS_ENABLED, stripeReady } from "../lib/siteStatus";
import { createStudioPromotion, listPromotionPurchases, listStudioPromotions, PromotionError } from "../lib/promotions";

const router: IRouter = Router();
router.use("/dev/promotions", requireAuth, requireOwner, (_req, res, next) => {
  if (!PAYMENTS_ENABLED || !stripeReady) {
    res.status(503).json({ error: "Payments are still initializing. Please try again shortly." });
    return;
  }
  next();
});

router.get("/dev/promotions", async (req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const [promotions, purchases] = await Promise.all([listStudioPromotions(stripe), listPromotionPurchases(stripe)]);
    res.json(ListPromotionsResponse.parse({ promotions, purchases }));
  } catch (error) {
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Promo catalog load failed");
    res.status(502).json({ error: "Could not load promo codes from Stripe. Please try again." });
  }
});

router.post("/dev/promotions", async (req, res) => {
  const parsed = CreatePromotionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a code with letters, numbers, or dashes (up to 50 characters), a valid discount, and an optional positive redemption limit." });
    return;
  }
  try {
    const promo = await createStudioPromotion(await getUncachableStripeClient(), parsed.data);
    req.log.info({ promotionId: promo.id }, "Studio promo code created");
    res.status(201).json(CreatePromotionResponse.parse(promo));
  } catch (error) {
    if (error instanceof PromotionError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const invalid = error instanceof Error && "type" in error && error.type === "StripeInvalidRequestError";
    req.log.error({ message: error instanceof Error ? error.message : "Unknown error" }, "Promo creation failed");
    res.status(invalid ? 400 : 502).json({ error: invalid && error instanceof Error
      ? error.message : "Could not create the promo code in Stripe. Refresh the list before retrying." });
  }
});
export default router;
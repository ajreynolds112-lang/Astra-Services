import { Router, type IRouter } from "express";
import { GetStudioResponse, ListPlansResponse } from "@workspace/api-zod";
import { listPlans } from "../lib/plans";
import { PAYMENTS_ENABLED, stripeReady } from "../lib/siteStatus";

const router: IRouter = Router();

export const STUDIO = {
  name: "ASTRA",
  email: "ajreynolds112@gmail.com",
  location: "United States",
};

router.get("/studio", async (_req, res) => {
  const plans = await listPlans();
  res.json(GetStudioResponse.parse({ ...STUDIO, paymentsEnabled: PAYMENTS_ENABLED && stripeReady && plans.length > 0 }));
});

router.get("/plans", async (_req, res) => {
  res.json(ListPlansResponse.parse(await listPlans()));
});

export default router;

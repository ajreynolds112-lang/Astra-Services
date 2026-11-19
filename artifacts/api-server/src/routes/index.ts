import { Router, type IRouter } from "express";
import requestRepliesRouter from "./requestReplies";
import healthRouter from "./health";
import studioRouter from "./studio";
import checkoutRouter from "./checkout";
import inquiriesRouter from "./inquiries";
import portalRouter from "./portal";
import devRouter from "./dev";
import appsRouter from "./apps";
import promotionsRouter from "./promotions";
import purchasesRouter from "./purchases";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studioRouter);
router.use(checkoutRouter);
router.use(inquiriesRouter);
router.use(portalRouter);
router.use(devRouter);
router.use(requestRepliesRouter);
router.use(appsRouter);
router.use(promotionsRouter);
router.use(purchasesRouter);
router.use(billingRouter);

export default router;

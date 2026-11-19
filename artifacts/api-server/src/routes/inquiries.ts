import { Router, type IRouter } from "express";
import { CreateInquiryBody, CreateInquiryResponse } from "@workspace/api-zod";
import { db, inquiriesTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/inquiries", async (req, res) => {
  const parsed = CreateInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please fill in your name, a valid email, and a message." });
    return;
  }
  const [row] = await db
    .insert(inquiriesTable)
    .values({
      ...parsed.data,
      company: parsed.data.company || null,
      budget: parsed.data.budget || null,
    })
    .returning();
  res.status(201).json(CreateInquiryResponse.parse(row));
});

export default router;

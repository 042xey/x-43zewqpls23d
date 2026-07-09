import { Router, type IRouter } from "express";
import { adminAuth } from "../middleware/adminAuth";

const router: IRouter = Router();

router.get("/healthz", adminAuth, (_req, res) => {
  res.json({ status: "ok" });
});

export default router;

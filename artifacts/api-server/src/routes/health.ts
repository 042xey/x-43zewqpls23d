import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Public, unauthenticated healthcheck endpoint used by Railway (and other
// platforms) to verify the service booted successfully.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;

import { Router } from "express";

const router = Router();

router.get("/logout", (_req, res) => {
  res
    .clearCookie("admin_key")
    .clearCookie("connect.sid")
    .redirect("/");
});

export default router;

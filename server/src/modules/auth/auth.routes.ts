import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as controller from "./auth.controller";
import { changePasswordSchema, loginSchema } from "./auth.schema";

const router = Router();

router.post("/login", validateBody(loginSchema), controller.login);
router.post("/refresh", controller.refresh);
router.post("/logout", verifyJwt, controller.logout);
router.get("/me", verifyJwt, controller.me);
router.post("/change-password", verifyJwt, validateBody(changePasswordSchema), controller.changePassword);

export default router;

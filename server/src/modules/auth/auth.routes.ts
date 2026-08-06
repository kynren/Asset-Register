import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as controller from "./auth.controller";
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  magicLoginSchema,
  mfaVerifySchema,
  removePinSchema,
  resetPasswordSchema,
  setPinSchema,
} from "./auth.schema";

const router = Router();

router.post("/login", validateBody(loginSchema), controller.login);
router.get("/pin-available", controller.pinAvailable);
router.post("/refresh", controller.refresh);
router.post("/logout", verifyJwt, controller.logout);
router.get("/me", verifyJwt, controller.me);
router.post("/change-password", verifyJwt, validateBody(changePasswordSchema), controller.changePassword);
router.post("/pin/set", verifyJwt, validateBody(setPinSchema), controller.setPin);
router.post("/pin/remove", verifyJwt, validateBody(removePinSchema), controller.removePin);

router.post("/forgot-password", validateBody(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validateBody(resetPasswordSchema), controller.resetPassword);
router.post("/magic-login", validateBody(magicLoginSchema), controller.magicLogin);

router.get("/invite/:token", controller.getInvite);
router.post("/accept-invite", validateBody(acceptInviteSchema), controller.acceptInvite);

router.post("/mfa/enroll/start", verifyJwt, controller.mfaEnrollStart);
router.post("/mfa/enroll/verify", verifyJwt, validateBody(mfaVerifySchema), controller.mfaEnrollVerify);
router.post("/mfa/disable", verifyJwt, controller.mfaDisable);

router.get("/sessions", verifyJwt, controller.listSessions);
router.delete("/sessions/:id", verifyJwt, controller.revokeSession);
router.post("/sessions/revoke-others", verifyJwt, controller.revokeOtherSessions);

export default router;

import { Router } from "express";
import { verifyAgentKey } from "../../middleware/agentAuth";
import { validateBody } from "../../middleware/validate";
import * as controller from "./devices.controller";
import { agentIngestSchema } from "./devices.schema";

const router = Router();

router.post("/devices", verifyAgentKey, validateBody(agentIngestSchema), controller.ingest);

export default router;

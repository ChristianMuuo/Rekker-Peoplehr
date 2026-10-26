import { Router, type IRouter } from "express";
import healthRouter from "./health";
import peopleOsRouter from "./peopleos";
import leaveRouter from "./leave";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(peopleOsRouter);
router.use(leaveRouter);
router.use(auditRouter);

export default router;

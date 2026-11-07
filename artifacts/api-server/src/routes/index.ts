import { Router, type IRouter } from "express";
import healthRouter from "./health";
import peopleOsRouter from "./peopleos";
import leaveRouter from "./leave";
import auditRouter from "./audit";
import recruitmentRouter from "./recruitment";
import attendanceRouter from "./attendance";
import payrollRouter from "./payroll";
import performanceRouter from "./performance";
import documentsRouter from "./documents";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(peopleOsRouter);
router.use(leaveRouter);
router.use(auditRouter);
router.use(recruitmentRouter);
router.use(attendanceRouter);
router.use(payrollRouter);
router.use(performanceRouter);
router.use(documentsRouter);
router.use(aiRouter);

export default router;

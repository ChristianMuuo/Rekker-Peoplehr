from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml_core.engine import dispatch_ml_task


class TestRekkerMlEngine(unittest.TestCase):
    def test_attrition_insufficient_data_does_not_fabricate(self):
        res = dispatch_ml_task("attrition", {"employees": [], "isDemo": False})
        self.assertEqual(res["status"], "insufficient_data")
        self.assertEqual(res["analyticsMode"], "INSUFFICIENT_DATA")
        self.assertEqual(res["predictions"], [])

    def test_attrition_xgboost_with_explainability_and_metrics(self):
        employees = [
            {"id": "e1", "name": "Achieng Odhiambo", "departmentName": "Manufacturing", "tenureMonths": 48, "baseSalary": 320000, "overtimeHours": 2, "lateRatePct": 1, "onProbation": False, "contractExpiringSoon": False},
            {"id": "e2", "name": "Brian Kiprotich", "departmentName": "Brand", "tenureMonths": 14, "baseSalary": 115000, "overtimeHours": 18, "lateRatePct": 12, "onProbation": False, "contractExpiringSoon": True},
        ]
        res = dispatch_ml_task("attrition", {"employees": employees, "isDemo": True})
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["analyticsMode"], "SIMULATED_DEMO_BASELINE")
        self.assertEqual(res["modelVersion"], "1.2.0")
        self.assertEqual(res["dataProvenance"], "synthetic_development_fixture")
        self.assertIn("cvRocAuc", res["evaluationMetrics"])
        self.assertGreater(res["evaluationMetrics"]["cvRocAuc"], 0.7)
        self.assertEqual(len(res["predictions"]), 2)
        self.assertEqual(len(res["predictions"][0]["topDrivers"]), 3)
        self.assertIn("confidenceInterval", res["predictions"][0])
        self.assertEqual(len(res["predictions"][0]["confidenceInterval"]), 2)
        # Contract expiring + low tenure + high overtime should produce higher risk than stable veteran
        risks = {p["employeeId"]: p["attritionProbability"] for p in res["predictions"]}
        self.assertGreater(risks["e2"], risks["e1"])

    def test_workforce_demand_forecast(self):
        series = [
            {"month": "Oct", "headcount": 8},
            {"month": "Nov", "headcount": 8},
            {"month": "Dec", "headcount": 9},
            {"month": "Jan", "headcount": 9},
            {"month": "Feb", "headcount": 10},
            {"month": "Mar", "headcount": 10},
        ]
        res = dispatch_ml_task("workforce_forecast", {"monthlyHeadcount": series, "budgetedPositionsTotal": 46, "horizonMonths": 4})
        self.assertEqual(res["status"], "completed")
        self.assertEqual(len(res["forecast"]), 4)
        self.assertIn("inSampleMae", res["evaluationMetrics"])

    def test_candidate_job_matching_fairness(self):
        res = dispatch_ml_task(
            "candidate_match",
            {
                "jobDescription": "Brewing chemistry, PLC automation, HACCP ISO 22000 fermentation quality control",
                "minExperienceYears": 4,
                "candidates": [
                    {"id": "c1", "fullName": "Peter Ndung'u", "skillsSummary": "PLC automation brewing chemistry ISO safety", "experienceYears": 6, "stage": "interview"},
                    {"id": "c2", "fullName": "Jane Doe", "skillsSummary": "Social media design copywriting", "experienceYears": 2, "stage": "applied"},
                ],
            },
        )
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["rankings"][0]["candidateId"], "c1")
        self.assertGreater(res["rankings"][0]["overallMatchPct"], res["rankings"][1]["overallMatchPct"])
        self.assertIn("protected attributes excluded", res["rankings"][0]["fairnessGuarantee"])

    def test_payroll_and_attendance_anomaly_detection(self):
        payroll_items = [
            {"employeeName": "Emp A", "grossPay": 120000, "overtimePay": 0, "totalDeductions": 28000, "netPay": 92000},
            {"employeeName": "Emp B", "grossPay": 125000, "overtimePay": 0, "totalDeductions": 29000, "netPay": 96000},
            {"employeeName": "Emp C", "grossPay": 118000, "overtimePay": 0, "totalDeductions": 27000, "netPay": 91000},
            {"employeeName": "Emp Outlier", "grossPay": 500000, "overtimePay": 210000, "totalDeductions": 260000, "netPay": 240000},
        ]
        pay_res = dispatch_ml_task("payroll_anomalies", {"items": payroll_items})
        self.assertEqual(pay_res["status"], "completed")
        self.assertGreaterEqual(pay_res["flaggedCount"], 1)

        att_records = [
            {"id": "a1", "employeeId": "e1", "employeeName": "Achieng", "date": "2026-03-06", "clockIn": "08:25", "status": "on_time", "overtimeHours": 0},
            {"id": "a2", "employeeId": "e2", "employeeName": "Mwangi", "date": "2026-03-06", "clockIn": "08:28", "status": "on_time", "overtimeHours": 0},
            {"id": "a3", "employeeId": "e3", "employeeName": "Juma", "date": "2026-03-06", "clockIn": "09:15", "status": "late", "overtimeHours": 0, "anomalyFlag": "Late arrival"},
            {"id": "a4", "employeeId": "e1", "employeeName": "Achieng", "date": "2026-03-06", "clockIn": "08:26", "status": "on_time", "overtimeHours": 0},
        ]
        att_res = dispatch_ml_task("attendance_anomalies", {"records": att_records})
        self.assertEqual(att_res["status"], "completed")
        types = [a["type"] for a in att_res["anomalies"]]
        self.assertIn("DUPLICATE_PUNCH", types)
        self.assertIn("SHIFT_DEVIATION", types)

    def test_skills_gap_sentiment_and_performance(self):
        skills = dispatch_ml_task("skills_gap", {
            "employees": [{"id": "e1", "name": "Mwangi", "departmentName": "Manufacturing & Brewing", "skills": ["PLC Automation", "Brewing Chemistry"]}]
        })
        self.assertEqual(skills["status"], "completed")
        self.assertGreater(len(skills["employeeGaps"][0]["missingSkills"]), 0)

        sent = dispatch_ml_task("sentiment", {
            "feedbackEntries": [
                {"id": "s1", "text": "Great collaborative team and strong growth learning environment"},
                {"id": "s2", "text": "Overworked exhausted burnout stress from heavy overtime"},
            ]
        })
        self.assertEqual(sent["status"], "completed")
        self.assertEqual(len(sent["entries"]), 2)

        perf = dispatch_ml_task("performance_trends", {
            "goals": [
                {"id": "g1", "title": "Goal 1", "progress": 85},
                {"id": "g2", "title": "Goal 2", "progress": 30},
            ]
        })
        self.assertEqual(perf["status"], "completed")
        self.assertEqual(perf["summary"]["goalsAtRisk"], 1)


if __name__ == "__main__":
    unittest.main()


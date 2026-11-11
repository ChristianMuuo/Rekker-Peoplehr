from __future__ import annotations

import math
from typing import Any, Dict, List
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import f1_score, mean_absolute_error, mean_squared_error, roc_auc_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from .validation import DataQualityReport, safe_float, validate_records


def _build_demo_attrition_training_data() -> tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Synthetic labeled HR attrition training baseline used ONLY when no historical
    organization exit dataset exists. Marked explicitly as SIMULATED_DEMO_BASELINE.
    Features: [tenure_months, salary_to_dept_median_ratio, overtime_hours_monthly,
               late_rate_pct, probation_flag, days_to_contract_end_capped]
    """
    rng = np.random.default_rng(42)
    n_samples = 180
    tenure = rng.uniform(2, 72, n_samples)
    salary_ratio = rng.normal(1.0, 0.22, n_samples).clip(0.55, 1.65)
    overtime = rng.exponential(8.0, n_samples).clip(0, 45)
    late_rate = rng.exponential(4.5, n_samples).clip(0, 35)
    probation = (tenure < 4).astype(float)
    contract_near = rng.binomial(1, 0.22, n_samples).astype(float)

    logits = (
        -1.65
        - 0.032 * tenure
        - 2.4 * (salary_ratio - 1.0)
        + 0.065 * overtime
        + 0.08 * late_rate
        + 0.9 * probation
        + 1.35 * contract_near
        + rng.normal(0, 0.35, n_samples)
    )
    probs = 1.0 / (1.0 + np.exp(-logits))
    y = (probs >= 0.5).astype(int)
    X = np.column_stack([tenure, salary_ratio, overtime, late_rate, probation, contract_near])
    feature_names = [
        "Tenure (Months)",
        "Compensation Ratio vs Dept Median",
        "Monthly Overtime Hours",
        "Late Arrival Rate (%)",
        "Active Probation Period",
        "Contract Expiry Within 90 Days",
    ]
    return X, y, feature_names


def predict_attrition(payload: Dict[str, Any]) -> Dict[str, Any]:
    employees_raw = payload.get("employees", [])
    is_demo = bool(payload.get("isDemo", True))
    historical_labels = payload.get("historicalLabels")  # Optional real exit history

    employees, quality = validate_records(
        employees_raw,
        required_keys=["id", "name"],
        min_records=1,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Employee Attrition Predictor",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "dataQualityReport": quality.to_dict(),
            "predictions": [],
            "message": "No valid employee records provided for attrition scoring.",
        }

    # Determine whether training comes from actual exit history or documented demo baseline
    if isinstance(historical_labels, list) and len(historical_labels) >= 20:
        has_real_labels = True
        X_train = np.array(
            [
                [
                    safe_float(r.get("tenureMonths"), 12, 0, 600),
                    safe_float(r.get("salaryRatio"), 1.0, 0.3, 3.0),
                    safe_float(r.get("overtimeHours"), 0, 0, 120),
                    safe_float(r.get("lateRatePct"), 0, 0, 100),
                    1.0 if r.get("onProbation") else 0.0,
                    1.0 if r.get("contractExpiringSoon") else 0.0,
                ]
                for r in historical_labels
            ]
        )
        y_train = np.array([1 if r.get("attrited") else 0 for r in historical_labels])
        feature_names = [
            "Tenure (Months)",
            "Compensation Ratio vs Dept Median",
            "Monthly Overtime Hours",
            "Late Arrival Rate (%)",
            "Active Probation Period",
            "Contract Expiry Within 90 Days",
        ]
        training_source = "ACTUAL_EXIT_HISTORY"
    else:
        has_real_labels = False
        X_train, y_train, feature_names = _build_demo_attrition_training_data()
        training_source = "SIMULATED_DEMO_BASELINE"

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    xgb = XGBClassifier(
        n_estimators=60,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.9,
        eval_metric="logloss",
        random_state=42,
    )
    xgb.fit(X_train, y_train)

    lr = LogisticRegression(max_iter=500, random_state=42)
    lr.fit(X_train_scaled, y_train)

    # Cross-validation model evaluation
    cv = StratifiedKFold(n_splits=min(5, max(2, int(min(y_train.sum(), (1 - y_train).sum())))), shuffle=True, random_state=42)
    cv_probs = cross_val_predict(xgb, X_train, y_train, cv=cv, method="predict_proba")[:, 1]
    cv_preds = (cv_probs >= 0.5).astype(int)
    auc = float(roc_auc_score(y_train, cv_probs))
    f1 = float(f1_score(y_train, cv_preds, zero_division=0))

    # Build inference feature matrix
    salaries = [safe_float(e.get("baseSalary"), 0, 0) for e in employees]
    median_sal = float(np.median([s for s in salaries if s > 0])) if any(s > 0 for s in salaries) else 150000.0

    X_inf = np.array(
        [
            [
                safe_float(e.get("tenureMonths"), 12, 0, 600),
                safe_float(e.get("baseSalary"), median_sal, 1) / max(1.0, median_sal),
                safe_float(e.get("overtimeHours"), 4.0, 0, 120),
                safe_float(e.get("lateRatePct"), 3.0, 0, 100),
                1.0 if e.get("onProbation") else 0.0,
                1.0 if e.get("contractExpiringSoon") else 0.0,
            ]
            for e in employees
        ]
    )

    probs = xgb.predict_proba(X_inf)[:, 1]
    global_importances = xgb.feature_importances_

    # Explainability: combine local feature standardized deviation * LR coefficient sign + XGB importance
    X_inf_scaled = scaler.transform(X_inf)
    lr_coefs = lr.coef_[0]

    predictions = []
    for idx, emp in enumerate(employees):
        prob = float(probs[idx])
        tier = "high" if prob >= 0.6 else "medium" if prob >= 0.3 else "low"
        local_contribs = X_inf_scaled[idx] * lr_coefs
        driver_pairs = [
            {
                "feature": feature_names[j],
                "impact": round(float(local_contribs[j]), 3),
                "direction": "increases_risk" if local_contribs[j] > 0 else "reduces_risk",
                "globalImportance": round(float(global_importances[j]), 3),
            }
            for j in range(len(feature_names))
        ]
        driver_pairs.sort(key=lambda d: abs(d["impact"]), reverse=True)
        predictions.append(
            {
                "employeeId": emp["id"],
                "employeeName": emp["name"],
                "department": emp.get("departmentName", "Operations"),
                "attritionProbability": round(prob, 4),
                "riskTier": tier,
                "topDrivers": driver_pairs[:3],
            }
        )

    predictions.sort(key=lambda p: p["attritionProbability"], reverse=True)

    return {
        "model": "Employee Attrition Predictor (XGBoost + Logistic Explainability)",
        "status": "completed",
        "analyticsMode": "ACTUAL_DATA" if (not is_demo and has_real_labels) else "SIMULATED_DEMO_BASELINE",
        "trainingSource": training_source,
        "disclaimer": None if has_real_labels else "Trained on synthetic baseline dynamics because <20 historical labeled exits exist for this tenant.",
        "dataQualityReport": quality.to_dict(),
        "evaluationMetrics": {
            "cvRocAuc": round(auc, 4),
            "cvF1Score": round(f1, 4),
            "trainingSamples": int(len(y_train)),
            "retrainingCadence": "Quarterly or on >10% workforce turnover drift",
        },
        "globalFeatureImportance": [
            {"feature": feature_names[j], "importance": round(float(global_importances[j]), 4)}
            for j in range(len(feature_names))
        ],
        "predictions": predictions,
    }


def forecast_workforce(payload: Dict[str, Any]) -> Dict[str, Any]:
    series_raw = payload.get("monthlyHeadcount", [])
    budgeted_total = safe_float(payload.get("budgetedPositionsTotal"), 46, 1)
    horizon = int(safe_float(payload.get("horizonMonths"), 6, 1, 12))
    is_demo = bool(payload.get("isDemo", True))

    valid_points, quality = validate_records(
        series_raw,
        required_keys=["month", "headcount"],
        min_records=3,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Workforce Demand Forecaster (Ridge Trend Regression)",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "dataQualityReport": quality.to_dict(),
            "forecast": [],
            "message": "At least 3 historical monthly headcount points are required to fit a trend forecast.",
        }

    y = np.array([safe_float(p["headcount"], 0, 0) for p in valid_points])
    X = np.arange(len(y), dtype=float).reshape(-1, 1)

    model = Ridge(alpha=1.0)
    model.fit(X, y)
    in_sample_preds = model.predict(X)
    mae = float(mean_absolute_error(y, in_sample_preds))
    rmse = float(math.sqrt(mean_squared_error(y, in_sample_preds)))
    std_err = max(0.5, rmse)

    future_X = np.arange(len(y), len(y) + horizon, dtype=float).reshape(-1, 1)
    future_preds = model.predict(future_X)

    month_names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
    forecast = []
    for i, val in enumerate(future_preds):
        point = max(0.0, float(val))
        forecast.append(
            {
                "step": i + 1,
                "label": f"+{i + 1}m ({month_names[i % len(month_names)]})",
                "projectedHeadcount": round(point, 1),
                "lowerBound95": round(max(0.0, point - 1.96 * std_err), 1),
                "upperBound95": round(point + 1.96 * std_err, 1),
                "budgetGap": round(max(0.0, budgeted_total - point), 1),
            }
        )

    return {
        "model": "Workforce Demand Forecaster (Scikit-learn Ridge Regression)",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "evaluationMetrics": {
            "inSampleMae": round(mae, 3),
            "inSampleRmse": round(rmse, 3),
            "monthlyGrowthSlope": round(float(model.coef_[0]), 3),
            "budgetedTotal": int(budgeted_total),
        },
        "forecast": forecast,
    }


def match_candidates(payload: Dict[str, Any]) -> Dict[str, Any]:
    job_desc = str(payload.get("jobDescription", "")).strip()
    candidates_raw = payload.get("candidates", [])
    min_exp = safe_float(payload.get("minExperienceYears"), 3, 0, 40)
    is_demo = bool(payload.get("isDemo", True))

    if not job_desc:
        return {
            "model": "Candidate-Job Semantic Matcher (TF-IDF + Experience Scoring)",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "rankings": [],
            "message": "Job description text is required for matching.",
        }

    candidates, quality = validate_records(
        candidates_raw,
        required_keys=["id", "fullName", "skillsSummary"],
        min_records=1,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Candidate-Job Semantic Matcher",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "dataQualityReport": quality.to_dict(),
            "rankings": [],
        }

    # Fairness policy: explicitly ignore protected demographic fields; only match job criteria
    corpus = [job_desc] + [f"{c.get('skillsSummary', '')} {c.get('jobTitle', '')}" for c in candidates]
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    tfidf = vectorizer.fit_transform(corpus)
    sims = cosine_similarity(tfidf[0:1], tfidf[1:])[0]
    feature_names = vectorizer.get_feature_names_out()
    job_vec = tfidf[0].toarray()[0]

    rankings = []
    for idx, cand in enumerate(candidates):
        semantic_sim = float(sims[idx])
        exp_years = safe_float(cand.get("experienceYears"), 0, 0, 50)
        exp_score = min(1.0, exp_years / max(1.0, min_exp))
        combined = 0.65 * semantic_sim + 0.35 * exp_score

        cand_vec = tfidf[idx + 1].toarray()[0]
        overlap_scores = job_vec * cand_vec
        top_term_indices = np.argsort(overlap_scores)[::-1][:5]
        matched_terms = [
            str(feature_names[j])
            for j in top_term_indices
            if overlap_scores[j] > 0
        ]

        rankings.append(
            {
                "candidateId": cand["id"],
                "fullName": cand["fullName"],
                "stage": cand.get("stage", "applied"),
                "overallMatchPct": round(min(99.0, max(10.0, combined * 100.0)), 1),
                "semanticSkillsScorePct": round(semantic_sim * 100.0, 1),
                "experienceAlignmentPct": round(exp_score * 100.0, 1),
                "matchedJobCriteria": matched_terms,
                "fairnessGuarantee": "Ranked strictly on job skills & experience; protected attributes excluded; human review required.",
            }
        )

    rankings.sort(key=lambda r: r["overallMatchPct"], reverse=True)

    return {
        "model": "Candidate-Job Semantic Matcher (TF-IDF Cosine + Criteria Scoring)",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "rankings": rankings,
    }


def detect_payroll_anomalies(payload: Dict[str, Any]) -> Dict[str, Any]:
    items_raw = payload.get("items", [])
    is_demo = bool(payload.get("isDemo", True))

    items, quality = validate_records(
        items_raw,
        required_keys=["employeeName", "grossPay", "netPay"],
        min_records=4,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Payroll Anomaly Detector (IsolationForest)",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "dataQualityReport": quality.to_dict(),
            "anomalies": [],
            "message": "At least 4 payroll records are required for statistical outlier detection.",
        }

    X = np.array(
        [
            [
                safe_float(r.get("grossPay"), 0, 0),
                safe_float(r.get("overtimePay"), 0, 0),
                safe_float(r.get("totalDeductions"), 0, 0) / max(1.0, safe_float(r.get("grossPay"), 1, 1)),
                safe_float(r.get("netPay"), 0, 0) / max(1.0, safe_float(r.get("grossPay"), 1, 1)),
            ]
            for r in items
        ]
    )

    iso = IsolationForest(contamination=0.15, random_state=42)
    preds = iso.fit_predict(X)
    scores = iso.decision_function(X)

    gross_vals = X[:, 0]
    med_gross = float(np.median(gross_vals))
    mad_gross = float(np.median(np.abs(gross_vals - med_gross))) or 1.0

    results = []
    for i, item in enumerate(items):
        robust_z = abs(0.6745 * (X[i, 0] - med_gross) / mad_gross)
        is_flagged = bool(preds[i] == -1 or X[i, 2] > 0.45 or X[i, 1] > X[i, 0] * 0.25)
        if is_flagged:
            reason = (
                "High deduction-to-gross ratio (>45%)"
                if X[i, 2] > 0.45
                else "High overtime variance (>25% of gross)"
                if X[i, 1] > X[i, 0] * 0.25
                else f"Statistical compensation distribution outlier (z={robust_z:.2f})"
            )
            results.append(
                {
                    "employeeName": item["employeeName"],
                    "grossPay": int(X[i, 0]),
                    "netPay": int(X[i, 0] - safe_float(item.get("totalDeductions"), 0)),
                    "anomalyScore": round(float(-scores[i]), 4),
                    "severity": "high" if X[i, 2] > 0.45 or robust_z > 3.0 else "medium",
                    "reason": reason,
                }
            )

    return {
        "model": "Payroll Anomaly Detector (Scikit-learn IsolationForest + Robust MAD Z-Score)",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "recordsScanned": len(items),
        "flaggedCount": len(results),
        "anomalies": results,
    }


def detect_attendance_anomalies(payload: Dict[str, Any]) -> Dict[str, Any]:
    records_raw = payload.get("records", [])
    is_demo = bool(payload.get("isDemo", True))

    records, quality = validate_records(
        records_raw,
        required_keys=["employeeName"],
        min_records=3,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Attendance Anomaly Detector (IsolationForest)",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "dataQualityReport": quality.to_dict(),
            "anomalies": [],
        }

    def _to_minutes(hhmm: Any) -> float:
        if not isinstance(hhmm, str) or ":" not in hhmm:
            return 510.0  # 08:30 default
        try:
            parts = hhmm.split(":")
            return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            return 510.0

    X = np.array(
        [
            [
                _to_minutes(r.get("clockIn")),
                safe_float(r.get("overtimeHours"), 0, 0, 16),
                1.0 if r.get("status") == "late" else 0.0,
                1.0 if r.get("status") == "absent" else 0.0,
            ]
            for r in records
        ]
    )

    iso = IsolationForest(contamination=0.2, random_state=42)
    preds = iso.fit_predict(X)

    # Check duplicate employee punches on same date
    seen_pairs = set()
    anomalies = []
    for i, rec in enumerate(records):
        pair_key = f"{rec.get('employeeId', rec['employeeName'])}::{rec.get('date', '')}"
        is_dup = pair_key in seen_pairs
        seen_pairs.add(pair_key)

        if is_dup or preds[i] == -1 or rec.get("status") in ("late", "absent") or rec.get("anomalyFlag"):
            anomalies.append(
                {
                    "recordId": rec.get("id", f"att_{i}"),
                    "employeeName": rec["employeeName"],
                    "department": rec.get("departmentName", "Operations"),
                    "type": "DUPLICATE_PUNCH" if is_dup else "SHIFT_DEVIATION" if rec.get("status") == "late" else "STATISTICAL_OUTLIER",
                    "severity": "high" if is_dup or rec.get("status") == "absent" else "medium",
                    "explanation": rec.get("anomalyFlag") or ("Duplicate same-day clock event detected" if is_dup else f"Unusual clock-in/overtime pattern ({rec.get('clockIn', 'N/A')})"),
                }
            )

    return {
        "model": "Attendance Anomaly Detector (Scikit-learn IsolationForest + Duplicate Event Rule)",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "recordsAnalyzed": len(records),
        "anomalies": anomalies,
    }


def analyze_skills_gap(payload: Dict[str, Any]) -> Dict[str, Any]:
    employees_raw = payload.get("employees", [])
    target_skills_map = payload.get(
        "departmentTargetSkills",
        {
            "Manufacturing & Brewing": ["PLC Automation", "HACCP", "ISO 22000", "Brewing Chemistry", "OSHA Safety"],
            "Logistics & Distribution": ["Fleet GPS Telemetry", "Cold Chain Logistics", "Route Optimization", "HSE Compliance"],
            "Brand & Commercial Marketing": ["Trade Marketing", "Digital Analytics", "Key Account Management", "Brand Strategy"],
            "People Operations & Culture": ["Kenya Employment Act", "HR Analytics", "Talent Acquisition", "ODPC Privacy"],
            "Finance & Supply Chain": ["KRA iTax", "IFRS Reporting", "Payroll Governance", "ERP Auditing"],
        },
    )
    is_demo = bool(payload.get("isDemo", True))

    employees, quality = validate_records(
        employees_raw,
        required_keys=["id", "name"],
        min_records=1,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Skills-Gap Matrix Analyzer",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "gaps": [],
        }

    gaps = []
    for emp in employees:
        dept = emp.get("departmentName", "Manufacturing & Brewing")
        required = target_skills_map.get(dept, ["Workplace Safety", "Operational Excellence"])
        current = [s.lower() for s in (emp.get("skills") or [])]

        missing = []
        matched = []
        for req_skill in required:
            if any(req_skill.lower() in c or c in req_skill.lower() for c in current):
                matched.append(req_skill)
            else:
                missing.append(req_skill)

        coverage = round((len(matched) / max(1, len(required))) * 100.0, 1)
        gaps.append(
            {
                "employeeId": emp["id"],
                "employeeName": emp["name"],
                "departmentName": dept,
                "coveragePct": coverage,
                "matchedSkills": matched,
                "missingSkills": missing,
                "recommendedTraining": [f"{m} Mastery & Certification" for m in missing[:2]],
            }
        )

    avg_coverage = round(sum(g["coveragePct"] for g in gaps) / max(1, len(gaps)), 1)
    return {
        "model": "Skills-Gap & Competency Matrix Analyzer",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "organizationSkillReadinessPct": avg_coverage,
        "employeeGaps": gaps,
    }


def analyze_sentiment(payload: Dict[str, Any]) -> Dict[str, Any]:
    texts_raw = payload.get("feedbackEntries", [])
    is_demo = bool(payload.get("isDemo", True))

    entries, quality = validate_records(
        texts_raw,
        required_keys=["id", "text"],
        min_records=1,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Employee Sentiment NLP Analyzer",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "entries": [],
        }

    # Labeled workplace sentiment lexicon + TF-IDF Logistic classifier
    train_texts = [
        "happy growth learning supportive manager proud teamwork achieved goal great balance",
        "promoted excited recognized appreciative bonus opportunity smooth collaboration",
        "satisfied clear expectations timely payroll helpful colleagues strong safety culture",
        "overworked exhausted burnout stress heavy overtime unfair late night shift frustrated",
        "delayed payment conflict unclear goals resign leaving disappointed micromanaged",
        "sick fatigued tired low morale underpaid lack resources anxious deadline",
        "annual rest travel study exam family personal certificate routine request",
        "normal schedule shift update compliance standard operational check",
    ]
    train_labels = [1, 1, 1, -1, -1, -1, 0, 0]  # 1=positive, -1=burnout/risk, 0=neutral

    vec = TfidfVectorizer(ngram_range=(1, 2))
    X_train = vec.fit_transform(train_texts)
    clf = LogisticRegression(max_iter=300, random_state=42)
    clf.fit(X_train, train_labels)

    X_test = vec.transform([str(e["text"]) for e in entries])
    preds = clf.predict(X_test)
    probs = clf.predict_proba(X_test)
    classes = list(clf.classes_)

    label_map = {1: "positive", 0: "neutral", -1: "at_risk"}
    analyzed = []
    for i, entry in enumerate(entries):
        pred_cls = int(preds[i])
        neg_prob = float(probs[i][classes.index(-1)]) if -1 in classes else 0.0
        pos_prob = float(probs[i][classes.index(1)]) if 1 in classes else 0.0
        polarity = round(pos_prob - neg_prob, 3)
        analyzed.append(
            {
                "id": entry["id"],
                "author": entry.get("author", "Anonymous"),
                "sentiment": label_map.get(pred_cls, "neutral"),
                "polarityScore": polarity,
                "burnoutSignalPct": round(neg_prob * 100.0, 1),
                "excerpt": str(entry["text"])[:160],
            }
        )

    avg_polarity = round(sum(a["polarityScore"] for a in analyzed) / max(1, len(analyzed)), 3)
    return {
        "model": "Employee Sentiment NLP Classifier (TF-IDF + LogisticRegression)",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "averagePolarity": avg_polarity,
        "atRiskCount": sum(1 for a in analyzed if a["sentiment"] == "at_risk"),
        "entries": analyzed,
    }


def analyze_performance_trends(payload: Dict[str, Any]) -> Dict[str, Any]:
    goals_raw = payload.get("goals", [])
    is_demo = bool(payload.get("isDemo", True))

    goals, quality = validate_records(
        goals_raw,
        required_keys=["id", "title", "progress"],
        min_records=1,
        is_demo=is_demo,
    )
    if quality.analyticsMode == "INSUFFICIENT_DATA":
        return {
            "model": "Performance Trend Analyzer",
            "status": "insufficient_data",
            "analyticsMode": "INSUFFICIENT_DATA",
            "goalTrends": [],
        }

    progresses = np.array([safe_float(g.get("progress"), 0, 0, 100) for g in goals])
    mean_prog = float(np.mean(progresses))
    std_prog = float(np.std(progresses))

    trends = []
    for i, g in enumerate(goals):
        p = float(progresses[i])
        momentum = "accelerating" if p >= 75 else "on_track" if p >= 50 else "at_risk"
        trends.append(
            {
                "goalId": g["id"],
                "title": g["title"],
                "owner": g.get("employeeName", "Owner"),
                "progressPct": round(p, 1),
                "zScoreVsOrg": round((p - mean_prog) / max(1.0, std_prog), 2),
                "momentum": momentum,
            }
        )

    return {
        "model": "Performance OKR Trend & Momentum Analyzer",
        "status": "completed",
        "analyticsMode": quality.analyticsMode,
        "dataQualityReport": quality.to_dict(),
        "summary": {
            "meanCompletionPct": round(mean_prog, 1),
            "stdDevPct": round(std_prog, 1),
            "goalsAtRisk": sum(1 for t in trends if t["momentum"] == "at_risk"),
        },
        "goalTrends": trends,
    }


TASK_HANDLERS = {
    "attrition": predict_attrition,
    "workforce_forecast": forecast_workforce,
    "candidate_match": match_candidates,
    "payroll_anomalies": detect_payroll_anomalies,
    "attendance_anomalies": detect_attendance_anomalies,
    "skills_gap": analyze_skills_gap,
    "sentiment": analyze_sentiment,
    "performance_trends": analyze_performance_trends,
}


def dispatch_ml_task(task: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    handler = TASK_HANDLERS.get(task)
    if not handler:
        raise ValueError(f"Unsupported ML task: {task}")
    return handler(payload)


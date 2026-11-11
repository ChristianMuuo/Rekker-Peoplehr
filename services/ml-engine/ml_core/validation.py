from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class DataQualityReport:
    totalRecords: int
    validRecords: int
    rejectedRecords: int
    missingFieldsCount: int
    analyticsMode: str  # "ACTUAL_DATA" | "SIMULATED_DEMO_BASELINE" | "INSUFFICIENT_DATA"
    warnings: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def validate_records(
    records: Any,
    required_keys: List[str],
    min_records: int = 3,
    is_demo: bool = True,
) -> Tuple[List[Dict[str, Any]], DataQualityReport]:
    warnings: List[str] = []
    if not isinstance(records, list):
        return [], DataQualityReport(
            totalRecords=0,
            validRecords=0,
            rejectedRecords=0,
            missingFieldsCount=0,
            analyticsMode="INSUFFICIENT_DATA",
            warnings=["Input dataset must be a JSON array."],
        )

    valid: List[Dict[str, Any]] = []
    rejected = 0
    missing_fields = 0

    for row in records:
        if not isinstance(row, dict):
            rejected += 1
            continue
        missing = [k for k in required_keys if row.get(k) is None or row.get(k) == ""]
        if missing:
            missing_fields += len(missing)
            rejected += 1
            continue
        valid.append(row)

    if len(valid) < min_records:
        warnings.append(
            f"Only {len(valid)} valid record(s) supplied; minimum {min_records} required for reliable ML inference."
        )
        mode = "INSUFFICIENT_DATA"
    else:
        mode = "SIMULATED_DEMO_BASELINE" if is_demo else "ACTUAL_DATA"

    return valid, DataQualityReport(
        totalRecords=len(records),
        validRecords=len(valid),
        rejectedRecords=rejected,
        missingFieldsCount=missing_fields,
        analyticsMode=mode,
        warnings=warnings,
    )


def safe_float(value: Any, default: float = 0.0, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    try:
        v = float(value)
        if v != v:  # NaN check
            return default
        if minimum is not None:
            v = max(minimum, v)
        if maximum is not None:
            v = min(maximum, v)
        return v
    except (TypeError, ValueError):
        return default


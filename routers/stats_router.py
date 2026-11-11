from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
import models, auth
from collections import defaultdict

router = APIRouter(tags=["Statistics"])


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return live system stats: patient counts, scan counts, stage distribution."""

    # Total registered patients (users with role='patient')
    total_patients = db.query(models.User).filter(models.User.role == "patient").count()

    # Total doctors
    total_doctors = db.query(models.User).filter(models.User.role == "doctor").count()

    # Total MRI scans
    total_scans = db.query(models.MRIReport).count()

    # Scans per stage (diagnosis distribution)
    stage_rows = (
        db.query(models.MRIReport.diagnosis, func.count(models.MRIReport.id))
        .group_by(models.MRIReport.diagnosis)
        .all()
    )
    stage_distribution = {row[0]: row[1] for row in stage_rows}

    # Unique patients who have at least one scan
    scanned_patients = (
        db.query(func.count(func.distinct(models.MRIReport.patient_id)))
        .filter(models.MRIReport.patient_id.isnot(None))
        .scalar()
    )

    # Scans in the last 7 days (per day breakdown)
    from datetime import datetime, timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_scans = (
        db.query(
            func.date(models.MRIReport.created_at).label("day"),
            func.count(models.MRIReport.id).label("count"),
        )
        .filter(models.MRIReport.created_at >= seven_days_ago)
        .group_by(func.date(models.MRIReport.created_at))
        .all()
    )
    recent_by_day = {str(row.day): row.count for row in recent_scans}

    # Average confidence per stage
    conf_rows = (
        db.query(models.MRIReport.diagnosis, func.avg(models.MRIReport.confidence))
        .group_by(models.MRIReport.diagnosis)
        .all()
    )
    avg_confidence = {row[0]: round(row[1], 1) for row in conf_rows}

    return {
        "total_patients": total_patients,
        "total_doctors": total_doctors,
        "total_scans": total_scans,
        "scanned_patients": scanned_patients,
        "stage_distribution": stage_distribution,
        "recent_by_day": recent_by_day,
        "avg_confidence": avg_confidence,
    }

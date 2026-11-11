from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas, auth, ml_model
import os, aiofiles
from typing import Optional

router = APIRouter(tags=["Predictions & MRI"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/predict", response_model=schemas.PredictionResponse)
async def predict(
    file: UploadFile = File(...),
    patient_id: Optional[int] = Form(None),
    model_name: str = Form("vgg16"),          # 'vgg16' | 'resnet50' | 'ensemble'
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Upload an MRI image and get an Alzheimer's stage prediction."""
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Only JPEG and PNG are accepted.",
        )

    image_bytes = await file.read()

    # Validate file size
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")

    # ── Validate it looks like a brain MRI ──────────────────────
    try:
        ml_model.validate_mri_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Run ML prediction
    try:
        result = ml_model.predict(image_bytes, model_name=model_name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Save file to disk
    safe_filename = f"user_{current_user.id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(image_bytes)

    # Determine patient_id for the report
    report_patient_id = None
    if current_user.role == "patient":
        # Patient uploading their own scan
        patient = db.query(models.Patient).filter(
            models.Patient.user_id == current_user.id
        ).first()
        if patient:
            report_patient_id = patient.id
    elif current_user.role == "doctor" and patient_id is not None:
        # Doctor tagging an existing patient
        tagged = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if tagged:
            report_patient_id = tagged.id

    # Save report to DB
    report = models.MRIReport(
        patient_id=report_patient_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        diagnosis=result["diagnosis"],
        confidence=result["confidence"],
        file_path=file_path,
    )
    db.add(report)
    db.commit()

    return schemas.PredictionResponse(
        status="success",
        filename=file.filename,
        diagnosis=result["diagnosis"],
        confidence=result["confidence"],
        stage_description=result["stage_description"],
        severity_level=result["severity_level"],
        model_used=result.get("model_used", model_name.upper()),
        vgg16_result=result.get("vgg16_result"),
        resnet50_result=result.get("resnet50_result"),
    )


@router.get("/models")
def get_available_models(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return which models are currently loaded."""
    loaded = ml_model.available_models()
    return {
        "available": loaded,
        "options": [
            {"value": "vgg16",    "label": "VGG16",             "loaded": "vgg16" in loaded},
            {"value": "resnet50", "label": "ResNet50",          "loaded": "resnet50" in loaded},
            {"value": "ensemble", "label": "Ensemble (Both)",   "loaded": len(loaded) >= 2},
        ]
    }


@router.get("/metrics", response_model=schemas.MetricsResponse)
def get_metrics(
    current_user: models.User = Depends(auth.require_doctor),
):
    """Doctor only — return model evaluation metrics."""
    m = ml_model.MOCK_METRICS
    return schemas.MetricsResponse(
        accuracy=m["accuracy"],
        confusion_matrix=m["confusion_matrix"],
        classification_report=m["classification_report"],
        class_labels=m["class_labels"],
    )


@router.get("/reports")
def get_all_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_doctor),
):
    """Doctor only — get MRI reports uploaded by this doctor only."""
    reports = (
        db.query(models.MRIReport)
        .filter(models.MRIReport.uploaded_by == current_user.id)
        .order_by(models.MRIReport.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "diagnosis": r.diagnosis,
            "confidence": r.confidence,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "uploaded_by": r.uploaded_by_user.full_name if r.uploaded_by_user else "Unknown",
            "patient_name": r.patient.user.full_name if r.patient and r.patient.user else "N/A",
        }
        for r in reports
    ]


@router.get("/my-reports")
def get_my_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Patient — get all MRI reports uploaded by current user."""
    reports = (
        db.query(models.MRIReport)
        .filter(models.MRIReport.uploaded_by == current_user.id)
        .order_by(models.MRIReport.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "diagnosis": r.diagnosis,
            "confidence": r.confidence,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]

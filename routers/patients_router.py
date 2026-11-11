from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.get("", response_model=List[schemas.PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_doctor),
):
    """Doctor only — list all registered patients."""
    patients = (
        db.query(models.Patient)
        .join(models.User)
        .order_by(models.Patient.registered_at.desc())
        .all()
    )
    result = []
    for p in patients:
        result.append(
            schemas.PatientOut(
                id=p.id,
                user_id=p.user_id,
                age=p.age,
                gender=p.gender,
                notes=p.notes,
                registered_at=p.registered_at,
                full_name=p.user.full_name,
                email=p.user.email,
            )
        )
    return result


@router.get("/{patient_id}", response_model=schemas.PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get a specific patient by ID. Patients can only view their own profile."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Patients can only access their own data
    if current_user.role == "patient" and patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return schemas.PatientOut(
        id=patient.id,
        user_id=patient.user_id,
        age=patient.age,
        gender=patient.gender,
        notes=patient.notes,
        registered_at=patient.registered_at,
        full_name=patient.user.full_name,
        email=patient.user.email,
    )


@router.put("/{patient_id}")
def update_patient(
    patient_id: int,
    payload: schemas.PatientCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Update patient details. Doctor or the patient themselves."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if current_user.role == "patient" and patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if payload.age is not None:
        patient.age = payload.age
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.notes is not None:
        patient.notes = payload.notes

    db.commit()
    db.refresh(patient)
    return {"message": "Patient updated successfully"}


@router.get("/{patient_id}/reports", response_model=List[schemas.MRIReportOut])
def get_patient_reports(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get all MRI reports for a patient."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if current_user.role == "patient" and patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return patient.mri_reports

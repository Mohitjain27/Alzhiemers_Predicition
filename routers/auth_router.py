from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models, schemas, auth

router = APIRouter(tags=["Authentication"])


@router.post("/signup", response_model=schemas.TokenResponse, status_code=201)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    # Validate role
    if payload.role not in ("doctor", "patient"):
        raise HTTPException(status_code=400, detail="Role must be 'doctor' or 'patient'")

    # Validate gender
    if payload.gender.lower() not in ("male", "female", "other"):
        raise HTTPException(status_code=400, detail="Gender must be 'male', 'female', or 'other'")

    # Check email uniqueness
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create user
    user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        role=payload.role,
        phone_number=payload.phone_number,
        age=payload.age,
        gender=payload.gender.lower(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create patient profile with age/gender if role is patient
    if payload.role == "patient":
        patient = models.Patient(
            user_id=user.id,
            age=payload.age,
            gender=payload.gender.lower(),
        )
        db.add(patient)
        db.commit()

    token = auth.create_access_token(data={"sub": str(user.id), "role": user.role})
    return schemas.TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = auth.create_access_token(data={"sub": str(user.id), "role": user.role})
    return schemas.TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
    )


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

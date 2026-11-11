from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ── Auth Schemas ──────────────────────────────────────────────
class SignupRequest(BaseModel):
    full_name:    str      = Field(..., min_length=2,  description="Full name is required")
    email:        EmailStr
    password:     str      = Field(..., min_length=6,  description="Password must be at least 6 characters")
    role:         str                                  # "doctor" or "patient"
    phone_number: str      = Field(..., min_length=7,  description="Phone number is required")
    age:          int      = Field(..., ge=1, le=120,  description="Age is required (1-120)")
    gender:       str      = Field(...,                description="Gender is required")


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    full_name:    str
    user_id:      int


class UserOut(BaseModel):
    id:           int
    full_name:    str
    email:        str
    role:         str
    phone_number: Optional[str]
    age:          Optional[int]
    gender:       Optional[str]
    created_at:   datetime

    class Config:
        from_attributes = True


# ── Patient Schemas ───────────────────────────────────────────
class PatientCreate(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    user_id: int
    age: Optional[int]
    gender: Optional[str]
    notes: Optional[str]
    registered_at: datetime
    full_name: str
    email: str

    class Config:
        from_attributes = True


# ── MRI Report Schemas ────────────────────────────────────────
class MRIReportOut(BaseModel):
    id: int
    filename: str
    diagnosis: str
    confidence: float
    created_at: datetime

    class Config:
        from_attributes = True


# ── Prediction Schemas ────────────────────────────────────────
class PredictionResponse(BaseModel):
    status: str
    filename: str
    diagnosis: str
    confidence: float
    stage_description: str
    severity_level: str           # low / medium / high / critical
    model_used: Optional[str] = None
    vgg16_result: Optional[dict] = None
    resnet50_result: Optional[dict] = None


# ── Metrics Schema ────────────────────────────────────────────
class MetricsResponse(BaseModel):
    accuracy: float
    confusion_matrix: List[List[int]]
    classification_report: dict
    class_labels: List[str]

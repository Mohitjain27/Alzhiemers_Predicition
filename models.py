from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    full_name     = Column(String(100), nullable=False)
    email         = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role          = Column(String(20), nullable=False)   # "doctor" or "patient"
    phone_number  = Column(String(20),  nullable=True)
    age           = Column(Integer,     nullable=True)
    gender        = Column(String(20),  nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    patient_profile = relationship("Patient", back_populates="user", uselist=False)
    mri_reports = relationship("MRIReport", back_populates="uploaded_by_user")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)
    notes = Column(Text, nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="patient_profile")
    mri_reports = relationship("MRIReport", back_populates="patient")


class MRIReport(Base):
    __tablename__ = "mri_reports"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    filename = Column(String(255))
    diagnosis = Column(String(50))
    confidence = Column(Float)
    file_path = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="mri_reports")
    uploaded_by_user = relationship("User", back_populates="mri_reports")

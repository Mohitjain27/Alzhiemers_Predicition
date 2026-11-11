from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database import engine, Base
import models  # noqa: F401 — ensures all models are registered before table creation
from ml_model import load_model
from routers import auth_router, patients_router, predict_router, stats_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & shutdown events."""
    # Create all database tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created / verified.")

    # Load ML model
    load_model()

    # Ensure upload directory exists
    os.makedirs("uploads", exist_ok=True)

    yield  # App runs here

    print("👋 Shutting down NeuroDetect API.")


app = FastAPI(
    title="NeuroDetect — Alzheimer's Prediction API",
    description="AI-powered MRI analysis for Alzheimer's disease staging.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve uploaded images statically ──────────────────────────
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(patients_router.router)
app.include_router(predict_router.router)
app.include_router(stats_router.router)


@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "app": "NeuroDetect API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

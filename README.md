# NeuroDetect AI — Alzheimer's MRI Prediction Web App

## ✅ Status: FULLY WORKING

Both backend and frontend are live and tested.

---

## 🏗️ Project Structure

```
alzheimers_app/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── auth.py              # JWT auth + password hashing
│   ├── database.py          # SQLite + SQLAlchemy setup
│   ├── models.py            # DB models (User, Patient, MRIReport)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── ml_model.py          # ML model loader + predictor (mock/real)
│   ├── requirements.txt     # Python dependencies
│   ├── alzheimer.db         # SQLite database (auto-created)
│   ├── uploads/             # Uploaded MRI images stored here
│   └── routers/
│       ├── auth_router.py   # POST /signup, POST /login, GET /me
│       ├── predict_router.py # POST /predict, GET /reports, GET /my-reports, GET /metrics
│       └── patients_router.py # GET /patients
│
├── frontend/
│   ├── index.html           # Entry point → loads app.js + app.css
│   ├── app.js               # Complete vanilla JS SPA (no build step)
│   └── app.css              # Complete CSS (dark theme)
│
└── model/
    └── README.md            # Instructions to add your .h5 or .pt model
```

---

## 🚀 How to Start

### Backend (FastAPI)
```bash
cd alzheimers_app/backend
source venv/bin/activate          # Activate virtual env
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Backend runs at: **http://localhost:8000**
API docs at:    **http://localhost:8000/docs**

### Frontend (Static HTML)
```bash
cd alzheimers_app/frontend
python3 -m http.server 3000
```
App runs at: **http://localhost:3000**

---

## 🔌 API Endpoints

| Method | Path          | Auth     | Description                          |
|--------|---------------|----------|--------------------------------------|
| POST   | `/signup`     | None     | Register as doctor or patient        |
| POST   | `/login`      | None     | Login, returns JWT token             |
| GET    | `/me`         | Bearer   | Get current user info                |
| POST   | `/predict`    | Bearer   | Upload MRI image → get prediction    |
| GET    | `/reports`    | Doctor   | All MRI reports (doctor only)        |
| GET    | `/my-reports` | Bearer   | Current user's reports               |
| GET    | `/metrics`    | Doctor   | Model accuracy & confusion matrix    |
| GET    | `/patients`   | Doctor   | List all patients                    |

---

## 🤖 ML Model Integration

The app runs in **MOCK mode** by default (returns realistic random predictions).

### To use YOUR real model:

1. Copy your trained model file:
   ```
   alzheimers_app/model/alzheimer_model.h5    # for TensorFlow/Keras
   alzheimers_app/model/alzheimer_model.pt    # for PyTorch
   ```

2. Open `backend/ml_model.py` and change:
   ```python
   USE_REAL_MODEL = True
   ```

3. For PyTorch, also uncomment the PyTorch blocks and comment out TF blocks.

4. Restart the backend. It will auto-load your model.

### Expected model input:
- Input: `(1, 176, 176, 3)` float32 tensor (pixel values 0–1)
- Output: 4-class softmax probabilities
- Classes: `[Non Demented, Very Mild Demented, Mild Demented, Moderate Demented]`

---

## 🔐 Authentication

- Passwords hashed with **sha256_crypt** (passlib)
- JWT tokens via **python-jose** (24h expiry)
- Role-based: `doctor` or `patient`
- Doctors can see all reports, patients see only their own

---

## 🛠️ First-Time Setup

```bash
cd alzheimers_app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

The SQLite database and uploads folder are created automatically on first run.

---

## 🧪 Quick Test (curl)

```bash
# Register a doctor
curl -X POST http://localhost:8000/signup \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Dr. Smith","email":"dr@test.com","password":"Test1234","role":"doctor"}'

# Login
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr@test.com","password":"Test1234"}'

# Predict (use your token)
curl -X POST http://localhost:8000/predict \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@brain_mri.png"
```

---

## 📱 UI Pages

| Page | Role | Description |
|------|------|-------------|
| Login / Signup | All | Dark themed auth with role cards |
| Doctor Dashboard | Doctor | Stats, stage distribution, recent reports |
| Patient Dashboard | Patient | Personal stats, profile, recent scans |
| Upload MRI | All | Drag-and-drop with step indicator |
| Results | All | Diagnosis card with confidence bar |
| Patients | Doctor | Table of all registered patients |
| All Reports | Doctor | All MRI reports across patients |
| Model Metrics | Doctor | Accuracy, confusion matrix, F1 scores |

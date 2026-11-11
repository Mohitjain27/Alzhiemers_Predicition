/* ═══════════════════════════════════════════════════════════
   NeuroDetect AI — Complete React Application
   All components in one file (no build step needed)
   Uses: React 18, Recharts, Babel Standalone
══════════════════════════════════════════════════════════════ */

const { useState, useEffect, useCallback, useRef, createContext, useContext } = React;
const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, RadialBarChart, RadialBar } = Recharts;

const API = "http://localhost:8000";

/* ══════════════════════════════════════════
   AUTH CONTEXT
══════════════════════════════════════════ */
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nd_user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("nd_token") || null);

  const login = (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("nd_user", JSON.stringify(userData));
    localStorage.setItem("nd_token", accessToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("nd_user");
    localStorage.removeItem("nd_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isDoctor: user?.role === "doctor" }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

/* ══════════════════════════════════════════
   API HELPER
══════════════════════════════════════════ */
async function apiFetch(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return data;
}

async function apiUpload(path, formData, token) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

/* ══════════════════════════════════════════
   TOAST SYSTEM
══════════════════════════════════════════ */
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, title, msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">{icons[t.type]}</span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const useToast = () => useContext(ToastContext);

/* ══════════════════════════════════════════
   LOADING OVERLAY
══════════════════════════════════════════ */
function LoadingOverlay({ text = "Processing...", sub = "" }) {
  return (
    <div className="loading-overlay">
      <div className="spinner-ring"></div>
      <div className="loading-text">{text}</div>
      {sub && <div className="loading-sub">{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════
   AUTH PAGE (Login + Signup)
══════════════════════════════════════════ */
function AuthPage() {
  const [tab, setTab] = useState("login");
  const [role, setRole] = useState("doctor");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const toast = useToast();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      let data;
      if (tab === "login") {
        data = await apiFetch("/login", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password }) });
      } else {
        if (!form.full_name.trim()) { setError("Full name is required"); setLoading(false); return; }
        data = await apiFetch("/signup", { method: "POST", body: JSON.stringify({ full_name: form.full_name, email: form.email, password: form.password, role }) });
      }
      login({ full_name: data.full_name, role: data.role, user_id: data.user_id }, data.access_token);
      toast("success", "Welcome back!", `Signed in as ${data.full_name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {loading && <LoadingOverlay text="Authenticating..." sub="Please wait" />}
      <div className="auth-blob auth-blob-1"></div>
      <div className="auth-blob auth-blob-2"></div>
      <div className="auth-blob auth-blob-3"></div>

      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-badge">🧠 NeuroDetect AI</div>
          <h2>Alzheimer's MRI Analysis</h2>
          <p>AI-powered diagnosis for clinical workflows</p>
        </div>

        <div className="tab-switch">
          <button className={`tab-btn ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setError(""); }}>Sign In</button>
          <button className={`tab-btn ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab("signup"); setError(""); }}>Create Account</button>
        </div>

        {tab === "signup" && (
          <div className="role-selector">
            {[
              { value: "doctor", emoji: "🩺", label: "Doctor", desc: "Clinical access" },
              { value: "patient", emoji: "🧑", label: "Patient", desc: "Personal reports" },
            ].map(r => (
              <div key={r.value} className={`role-card ${role === r.value ? "selected" : ""}`} onClick={() => setRole(r.value)}>
                <div className="role-emoji">{r.emoji}</div>
                <div className="role-label">{r.label}</div>
                <div className="role-desc">{r.desc}</div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error-msg">⚠️ {error}</div>}

        <form onSubmit={submit}>
          {tab === "signup" && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" type="text" placeholder="Dr. Ramesh Kumar" value={form.full_name} onChange={set("full_name")} required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="doctor@hospital.com" value={form.email} onChange={set("email")} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={set("password")} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "⏳ Processing..." : tab === "login" ? "🔐 Sign In" : "🚀 Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
          Demo: Sign up as a Doctor or Patient to begin
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════ */
function Sidebar({ page, setPage }) {
  const { user, logout, isDoctor } = useAuth();

  const doctorNav = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "upload", icon: "🖼️", label: "Upload MRI" },
    { id: "patients", icon: "👥", label: "Patients" },
    { id: "metrics", icon: "📈", label: "Model Metrics" },
    { id: "reports", icon: "📋", label: "All Reports" },
  ];
  const patientNav = [
    { id: "dashboard", icon: "🏠", label: "My Dashboard" },
    { id: "upload", icon: "🖼️", label: "Upload MRI" },
    { id: "my-reports", icon: "📋", label: "My Reports" },
  ];
  const navItems = isDoctor ? doctorNav : patientNav;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🧠</div>
        <div>
          <h1>NeuroDetect</h1>
          <span>AI Diagnosis Platform</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">{isDoctor ? "Doctor" : "Patient"} Portal</div>
        {navItems.map(item => (
          <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{user?.full_name?.[0]?.toUpperCase()}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">⏏️</button>
        </div>
      </div>
    </aside>
  );
}

/* ══════════════════════════════════════════
   DOCTOR DASHBOARD
══════════════════════════════════════════ */
function DoctorDashboard({ setPage }) {
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/patients", {}, token).catch(() => []),
      apiFetch("/reports", {}, token).catch(() => []),
    ]).then(([p, r]) => { setPatients(p); setReports(r); setLoading(false); });
  }, [token]);

  const stageCounts = reports.reduce((acc, r) => {
    acc[r.diagnosis] = (acc[r.diagnosis] || 0) + 1;
    return acc;
  }, {});
  const chartData = Object.entries(stageCounts).map(([name, count]) => ({ name: name.replace(" Demented", ""), count }));
  const stageColors = { "Non": "#22c55e", "Very Mild": "#eab308", "Mild": "#f97316", "Moderate": "#ef4444" };

  if (loading) return <LoadingOverlay text="Loading dashboard..." />;

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI</div>
        <h2>Doctor Dashboard</h2>
        <p>Overview of patients, MRI reports, and model activity</p>
      </div>
      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          {[
            { icon: "👥", bg: "rgba(99,102,241,0.15)", label: "Total Patients", value: patients.length, sub: "Registered" },
            { icon: "📋", bg: "rgba(236,72,153,0.15)", label: "MRI Reports", value: reports.length, sub: "Analyzed" },
            { icon: "🟢", bg: "rgba(34,197,94,0.15)", label: "Non-Demented", value: stageCounts["Non Demented"] || 0, sub: "Cases" },
            { icon: "🔴", bg: "rgba(239,68,68,0.15)", label: "Moderate Cases", value: stageCounts["Moderate Demented"] || 0, sub: "Critical" },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
              <div className="stat-body">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2">
          {/* Chart */}
          <div className="card">
            <div className="section-title">📊 Stage Distribution</div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#141627", border: "1px solid #252848", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={stageColors[entry.name] || "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state"><div className="empty-icon">📊</div><p>No report data yet. Upload MRI scans to see distribution.</p></div>
            )}
          </div>

          {/* Recent Reports */}
          <div className="card">
            <div className="flex-between mb-16">
              <div className="section-title" style={{marginBottom:0}}>🕐 Recent Reports</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage("reports")}>View All →</button>
            </div>
            {reports.slice(0, 5).length ? reports.slice(0, 5).map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{r.patient_name === "N/A" ? r.uploaded_by : r.patient_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.filename}</div>
                </div>
                <SeverityBadge diagnosis={r.diagnosis} />
              </div>
            )) : <div className="empty-state"><div className="empty-icon">📋</div><p>No reports yet</p></div>}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-24">
          <div className="section-title">⚡ Quick Actions</div>
          <div className="grid-3">
            {[
              { icon: "🖼️", title: "Upload MRI Scan", desc: "Analyze a new brain MRI image", action: () => setPage("upload"), color: "#6366f1" },
              { icon: "👥", title: "View Patients", desc: "Browse all registered patients", action: () => setPage("patients"), color: "#ec4899" },
              { icon: "📈", title: "Model Metrics", desc: "View accuracy & confusion matrix", action: () => setPage("metrics"), color: "#22c55e" },
            ].map((a, i) => (
              <div key={i} className="card" style={{ cursor: "pointer", transition: "all 0.2s" }} onClick={a.action}
                onMouseEnter={e => e.currentTarget.style.borderColor = a.color}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{a.icon}</div>
                <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PATIENT DASHBOARD
══════════════════════════════════════════ */
function PatientDashboard({ setPage }) {
  const { token, user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/my-reports", {}, token).then(r => { setReports(r); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingOverlay text="Loading your profile..." />;

  const lastReport = reports[0];

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI</div>
        <h2>Welcome, {user.full_name} 👋</h2>
        <p>Your MRI reports and Alzheimer's analysis results</p>
      </div>
      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[
            { icon: "📋", bg: "rgba(99,102,241,0.15)", label: "Total Scans", value: reports.length, sub: "Uploaded" },
            { icon: "🏥", bg: "rgba(34,197,94,0.15)", label: "Latest Stage", value: lastReport ? lastReport.diagnosis.split(" ")[0] : "—", sub: "Diagnosis" },
            { icon: "📊", bg: "rgba(234,179,8,0.15)", label: "Confidence", value: lastReport ? `${lastReport.confidence}%` : "—", sub: "Last scan" },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
              <div className="stat-body">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Profile + Action */}
        <div className="grid-2">
          <div className="card">
            <div className="section-title">👤 Profile</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Name", user.full_name],
                ["Role", "Patient"],
                ["Email", "On file"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{k}</span>
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card flex-center" style={{ flexDirection: "column", gap: 16, textAlign: "center" }}>
            <div style={{ fontSize: 56 }}>🧠</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text)" }}>Scan Your MRI</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 260 }}>Upload a brain MRI image to receive an instant Alzheimer's stage prediction.</div>
            <button className="btn btn-primary" style={{ maxWidth: 200 }} onClick={() => setPage("upload")}>🖼️ Upload MRI Scan</button>
          </div>
        </div>

        {/* Recent Reports */}
        {reports.length > 0 && (
          <div className="mt-24">
            <div className="flex-between mb-16">
              <div className="section-title" style={{ marginBottom: 0 }}>🕐 Recent Reports</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage("my-reports")}>View All →</button>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>File</th><th>Diagnosis</th><th>Confidence</th><th>Date</th></tr></thead>
                <tbody>
                  {reports.slice(0, 5).map(r => (
                    <tr key={r.id}>
                      <td className="td-name">🖼️ {r.filename}</td>
                      <td><SeverityBadge diagnosis={r.diagnosis} /></td>
                      <td style={{ color: "var(--text)" }}>{r.confidence}%</td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   UPLOAD MRI PAGE
══════════════════════════════════════════ */
function UploadMRI({ setPage, setLastResult }) {
  const { token } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1=select, 2=preview, 3=done
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(f.type)) {
      toast("error", "Invalid file", "Only JPEG and PNG files are accepted.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep(2);
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onInput = (e) => handleFile(e.target.files[0]);

  const analyze = async () => {
    setLoading(true);
    setStep(3);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await apiUpload("/predict", fd, token);
      setLastResult(result);
      toast("success", "Analysis Complete!", `Diagnosis: ${result.diagnosis}`);
      setPage("results");
    } catch (err) {
      toast("error", "Prediction failed", err.message);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setStep(1); };

  return (
    <div>
      {loading && <LoadingOverlay text="Running AI Analysis" sub="Deep learning inference in progress..." />}
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI / Upload</div>
        <h2>🖼️ Upload MRI Scan</h2>
        <p>Drag and drop or browse a brain MRI image for Alzheimer's prediction</p>
      </div>
      <div className="page-body">
        {/* Steps */}
        <div className="progress-steps mb-24">
          {["Select Image", "Preview & Confirm", "Get Results"].map((label, i) => (
            <div key={i} className="progress-step">
              <div className={`step-dot ${step > i + 1 ? "done" : step === i + 1 ? "active" : ""}`}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <div className="step-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="upload-layout">
          {/* Drop zone */}
          <div
            className={`drop-zone ${dragging ? "drag-over" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => inputRef.current.click()}
          >
            <input ref={inputRef} type="file" accept="image/jpeg,image/png" hidden onChange={onInput} />
            <div className="drop-icon">🧠</div>
            <h3>Drop MRI Image Here</h3>
            <p>or click to browse from your device</p>
            <div className="drop-hint">Supports JPEG, PNG · Max 10MB</div>
          </div>

          {/* Preview panel */}
          <div className="preview-panel">
            <h3>📷 Image Preview</h3>
            {preview ? (
              <>
                <img src={preview} alt="MRI Preview" className="preview-image" />
                <div className="preview-meta">
                  File: <span>{file?.name}</span> · Size: <span>{(file?.size / 1024).toFixed(1)} KB</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>🗑️ Remove</button>
                  <button className="btn btn-primary" style={{ flex: 2 }} onClick={analyze}>🔍 Analyze Scan</button>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ flex: 1 }}>
                <div className="empty-icon">🖼️</div>
                <p>No image selected yet.<br />Upload an MRI scan to preview it here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="card mt-24" style={{ background: "rgba(99,102,241,0.05)", borderColor: "rgba(99,102,241,0.2)" }}>
          <div style={{ fontWeight: 600, color: "var(--primary-light)", marginBottom: 8 }}>ℹ️ How It Works</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {["1️⃣ Upload a brain MRI image (JPEG/PNG)", "2️⃣ AI preprocesses the image to 176×176", "3️⃣ Deep learning model runs inference", "4️⃣ Get stage classification + confidence score"].map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SEVERITY BADGE HELPER
══════════════════════════════════════════ */
function SeverityBadge({ diagnosis }) {
  const map = {
    "Non Demented": "low",
    "Very Mild Demented": "medium",
    "Mild Demented": "high",
    "Moderate Demented": "critical",
  };
  const sev = map[diagnosis] || "low";
  const short = { "Non Demented": "Non", "Very Mild Demented": "Very Mild", "Mild Demented": "Mild", "Moderate Demented": "Moderate" };
  return <span className={`badge badge-${sev}`}>● {short[diagnosis] || diagnosis}</span>;
}

/* ══════════════════════════════════════════
   RESULTS PAGE
══════════════════════════════════════════ */
function ResultsPage({ result, setPage }) {
  if (!result) {
    return (
      <div>
        <div className="page-header"><h2>📊 Results</h2></div>
        <div className="page-body">
          <div className="empty-state card">
            <div className="empty-icon">🔍</div>
            <p>No analysis result yet.</p>
            <button className="btn btn-primary mt-16" style={{ maxWidth: 200, margin: "16px auto 0" }} onClick={() => setPage("upload")}>Upload MRI Scan</button>
          </div>
        </div>
      </div>
    );
  }

  const sevColors = { low: "#22c55e", medium: "#eab308", high: "#f97316", critical: "#ef4444" };
  const color = sevColors[result.severity_level] || "#6366f1";
  const confWidth = Math.round(result.confidence);

  const sevEmoji = { low: "🟢", medium: "🟡", high: "🟠", critical: "🔴" };
  const sevLabel = { low: "Low Risk", medium: "Moderate Risk", high: "High Risk", critical: "Critical" };

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI / Results</div>
        <h2>📊 Analysis Results</h2>
        <p>AI-generated Alzheimer's stage prediction from your MRI scan</p>
      </div>
      <div className="page-body">
        <div className="results-grid">
          {/* Diagnosis Card */}
          <div className="result-hero">
            <div className="result-pulse" style={{ background: `${color}22`, border: `3px solid ${color}` }}>
              {sevEmoji[result.severity_level]}
            </div>
            <div className="result-diagnosis" style={{ color }}>{result.diagnosis}</div>
            <div className="result-confidence">
              Confidence: <strong style={{ color: "var(--text)" }}>{result.confidence}%</strong>
              &nbsp;·&nbsp;
              <span className={`badge badge-${result.severity_level}`}>{sevLabel[result.severity_level]}</span>
            </div>
            <div className="confidence-bar-outer" style={{ maxWidth: "100%" }}>
              <div className="confidence-bar-inner" style={{ width: `${confWidth}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }}></div>
            </div>
            <div className="result-description">{result.stage_description}</div>
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={() => setPage("upload")}>🔄 New Scan</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Report</button>
            </div>
          </div>

          {/* Stage Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="section-title">🧬 Alzheimer's Stages</div>
              {[
                { label: "Non Demented", color: "#22c55e", sev: "low", desc: "Normal brain function. No clinical signs." },
                { label: "Very Mild Demented", color: "#eab308", sev: "medium", desc: "Subtle memory lapses, largely independent." },
                { label: "Mild Demented", color: "#f97316", sev: "high", desc: "Noticeable memory & cognitive difficulty." },
                { label: "Moderate Demented", color: "#ef4444", sev: "critical", desc: "Requires full-time care and assistance." },
              ].map(s => (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  opacity: result.diagnosis === s.label ? 1 : 0.45,
                  transform: result.diagnosis === s.label ? "scale(1.02)" : "none",
                  transition: "all 0.2s"
                }}>
                  <div style={{ width: 8, height: 32, borderRadius: 4, background: s.color, flexShrink: 0 }}></div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: result.diagnosis === s.label ? s.color : "var(--text)" }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.desc}</div>
                  </div>
                  {result.diagnosis === s.label && <span className={`badge badge-${s.sev}`} style={{ marginLeft: "auto" }}>▶ Current</span>}
                </div>
              ))}
            </div>

            <div className="card">
              <div className="section-title">📁 Report Info</div>
              {[
                ["File", result.filename],
                ["Diagnosis", result.diagnosis],
                ["Confidence", `${result.confidence}%`],
                ["Risk Level", sevLabel[result.severity_level]],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{k}</span>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MODEL METRICS PAGE
══════════════════════════════════════════ */
function MetricsPage() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/metrics", {}, token)
      .then(d => { setMetrics(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  if (loading) return <LoadingOverlay text="Loading model metrics..." />;
  if (error) return (
    <div className="page-body" style={{ paddingTop: 32 }}>
      <div className="error-msg">⚠️ {error}</div>
    </div>
  );

  const labels = metrics.class_labels;
  const shortLabels = ["Non", "V.Mild", "Mild", "Moderate"];
  const cm = metrics.confusion_matrix;

  // Confusion matrix color: normalize per row max
  const cmMax = Math.max(...cm.flat());
  const cmColor = (val, row, col) => {
    if (row === col) {
      const intensity = Math.round((val / cmMax) * 180);
      return `rgb(${50},${80 + intensity},${50})`;
    }
    const intensity = Math.round((val / cmMax) * 140);
    return `rgb(${80 + intensity},${40},${40})`;
  };

  const clsReport = metrics.classification_report;
  const clsChartData = labels.map(l => ({
    name: shortLabels[labels.indexOf(l)],
    precision: Math.round((clsReport[l]?.precision || 0) * 100),
    recall: Math.round((clsReport[l]?.recall || 0) * 100),
    f1: Math.round((clsReport[l]["f1-score"] || 0) * 100),
  }));

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI / Metrics</div>
        <h2>📈 Model Performance Metrics</h2>
        <p>Evaluation results of the Alzheimer's classification model</p>
      </div>
      <div className="page-body">
        {/* Accuracy */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "rgba(99,102,241,0.15)" }}>🎯</div>
            <div className="stat-body">
              <div className="stat-label">Overall Accuracy</div>
              <div className="stat-value" style={{ fontSize: 36, background: "linear-gradient(135deg,#818cf8,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{metrics.accuracy}%</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "rgba(34,197,94,0.15)" }}>✅</div>
            <div className="stat-body">
              <div className="stat-label">Avg F1-Score</div>
              <div className="stat-value" style={{ color: "var(--sev-low)" }}>
                {(Object.values(clsReport).reduce((s, c) => s + (c?.["f1-score"] || 0), 0) / labels.length * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "rgba(234,179,8,0.15)" }}>🧬</div>
            <div className="stat-body">
              <div className="stat-label">Classes</div>
              <div className="stat-value">{labels.length}</div>
              <div className="stat-sub">Alzheimer stages</div>
            </div>
          </div>
        </div>

        <div className="grid-2 mt-24">
          {/* Confusion Matrix */}
          <div className="card">
            <div className="section-title">🗂️ Confusion Matrix</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Rows = Actual · Columns = Predicted</div>
            <div className="cm-grid" style={{ gridTemplateColumns: `28px repeat(${labels.length}, 1fr)` }}>
              {/* Header row */}
              <div className="cm-label"></div>
              {shortLabels.map(l => <div key={l} className="cm-label" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{l}</div>)}
              {/* Data rows */}
              {cm.map((row, ri) => (
                [
                  <div key={`rl${ri}`} className="cm-label" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{shortLabels[ri]}</div>,
                  ...row.map((val, ci) => (
                    <div key={`${ri}-${ci}`} className="cm-cell" style={{ background: cmColor(val, ri, ci), color: "#fff" }}>{val}</div>
                  ))
                ]
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: "rgb(50,210,50)" }}></div>Correct
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: "rgb(190,40,40)" }}></div>Incorrect
              </div>
            </div>
          </div>

          {/* Classification Report Chart */}
          <div className="card">
            <div className="section-title">📊 Per-Class Metrics</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clsChartData} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: "#141627", border: "1px solid #252848", borderRadius: 8, color: "#e2e8f0" }} formatter={(val) => `${val}%`} />
                <Bar dataKey="precision" fill="#6366f1" radius={[4, 4, 0, 0]} name="Precision" />
                <Bar dataKey="recall" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Recall" />
                <Bar dataKey="f1" fill="#ec4899" radius={[4, 4, 0, 0]} name="F1-Score" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
              {[["#6366f1", "Precision"], ["#a78bfa", "Recall"], ["#ec4899", "F1-Score"]].map(([c, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }}></div>{l}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Classification Report Table */}
        <div className="table-wrapper mt-24">
          <div className="table-header"><h3>📋 Full Classification Report</h3></div>
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1-Score</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => {
                const r = clsReport[label] || {};
                const sev = ["low", "medium", "high", "critical"][i];
                return (
                  <tr key={label}>
                    <td><span className={`badge badge-${sev}`}>{label}</span></td>
                    <td style={{ color: "var(--text)" }}>{((r.precision || 0) * 100).toFixed(1)}%</td>
                    <td style={{ color: "var(--text)" }}>{((r.recall || 0) * 100).toFixed(1)}%</td>
                    <td style={{ color: "var(--text)", fontWeight: 600 }}>{((r["f1-score"] || 0) * 100).toFixed(1)}%</td>
                    <td>{r.support || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PATIENTS PAGE (Doctor only)
══════════════════════════════════════════ */
function PatientsPage() {
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/patients", {}, token).then(p => { setPatients(p); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingOverlay text="Loading patients..." />;

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI / Patients</div>
        <h2>👥 Patient Registry</h2>
        <p>All registered patients and their profiles</p>
      </div>
      <div className="page-body">
        <div className="table-wrapper">
          <div className="table-header">
            <h3>All Patients ({patients.length})</h3>
          </div>
          {patients.length ? (
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text-muted)" }}>#{p.id}</td>
                    <td className="td-name">🧑 {p.full_name}</td>
                    <td>{p.email}</td>
                    <td>{p.age || "—"}</td>
                    <td>{p.gender || "—"}</td>
                    <td>{new Date(p.registered_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><div className="empty-icon">👥</div><p>No patients registered yet. Patients will appear here after they sign up.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ALL REPORTS PAGE
══════════════════════════════════════════ */
function ReportsPage({ myReportsOnly = false }) {
  const { token } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = myReportsOnly ? "/my-reports" : "/reports";
    apiFetch(endpoint, {}, token).then(r => { setReports(r); setLoading(false); }).catch(() => setLoading(false));
  }, [token, myReportsOnly]);

  if (loading) return <LoadingOverlay text="Loading reports..." />;

  return (
    <div>
      <div className="page-header">
        <div className="breadcrumb">NeuroDetect AI / Reports</div>
        <h2>📋 {myReportsOnly ? "My MRI Reports" : "All MRI Reports"}</h2>
        <p>{myReportsOnly ? "Your personal MRI analysis history" : "All patient MRI reports across the system"}</p>
      </div>
      <div className="page-body">
        <div className="table-wrapper">
          <div className="table-header"><h3>Reports ({reports.length})</h3></div>
          {reports.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  {!myReportsOnly && <><th>Patient</th><th>Uploaded By</th></>}
                  <th>Diagnosis</th>
                  <th>Confidence</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: "var(--text-muted)" }}>#{r.id}</td>
                    <td className="td-name">🖼️ {r.filename}</td>
                    {!myReportsOnly && <><td>{r.patient_name || "—"}</td><td>{r.uploaded_by}</td></>}
                    <td><SeverityBadge diagnosis={r.diagnosis} /></td>
                    <td style={{ color: "var(--text)" }}><strong>{r.confidence}%</strong></td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><div className="empty-icon">📋</div><p>No reports yet.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN APP SHELL
══════════════════════════════════════════ */
function AppShell() {
  const { isDoctor } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [lastResult, setLastResult] = useState(null);

  const renderPage = () => {
    switch (page) {
      case "dashboard": return isDoctor ? <DoctorDashboard setPage={setPage} /> : <PatientDashboard setPage={setPage} />;
      case "upload":    return <UploadMRI setPage={setPage} setLastResult={setLastResult} />;
      case "results":   return <ResultsPage result={lastResult} setPage={setPage} />;
      case "metrics":   return <MetricsPage />;
      case "patients":  return <PatientsPage />;
      case "reports":   return <ReportsPage myReportsOnly={false} />;
      case "my-reports":return <ReportsPage myReportsOnly={true} />;
      default:          return <DoctorDashboard setPage={setPage} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

/* ══════════════════════════════════════════
   ROOT APP
══════════════════════════════════════════ */
function App() {
  const { user } = useAuth();
  return user ? <AppShell /> : <AuthPage />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </AuthProvider>
);

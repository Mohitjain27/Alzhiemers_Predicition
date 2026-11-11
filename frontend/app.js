/* ════════════════════════════════════════════════════════════
   NeuroDetect AI — Pure Vanilla JS SPA
   No build step, no frameworks, works with python3 -m http.server
════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8000';

// Upload icon SVG (blue arrow + grey tray)
const UPLOAD_SVG = `<svg width="18" height="18" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:5px">
  <rect x="10" y="46" width="52" height="14" rx="3" fill="#5b6880"/>
  <rect x="10" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
  <rect x="42" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
  <rect x="30" y="20" width="12" height="28" fill="#1565C0"/>
  <rect x="30" y="20" width="6" height="28" fill="#1976D2"/>
  <polygon points="36,4 58,30 14,30" fill="#1565C0"/>
  <polygon points="36,4 47,17 36,30 25,17" fill="#1E88E5"/>
</svg>`;

const UPLOAD_SVG_LG = `<svg width="28" height="28" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:8px">
  <rect x="10" y="46" width="52" height="14" rx="3" fill="#5b6880"/>
  <rect x="10" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
  <rect x="42" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
  <rect x="30" y="20" width="12" height="28" fill="#1565C0"/>
  <rect x="30" y="20" width="6" height="28" fill="#1976D2"/>
  <polygon points="36,4 58,30 14,30" fill="#1565C0"/>
  <polygon points="36,4 47,17 36,30 25,17" fill="#1E88E5"/>
</svg>`;

// ── State ─────────────────────────────────────────────────
let state = {
  user: null,
  token: null,
  page: 'dashboard',
  lastResult: null,
  toasts: [],
};

// Load persisted auth
try {
  state.user  = JSON.parse(localStorage.getItem('nd_user'));
  state.token = localStorage.getItem('nd_token');
} catch(_) {}

// ── DOM helpers ───────────────────────────────────────────
const el  = (id)      => document.getElementById(id);
const qs  = (s, ctx)  => (ctx || document).querySelector(s);
const qsa = (s, ctx)  => [...(ctx || document).querySelectorAll(s)];

function render(id, html) {
  const node = el(id);
  if (node) node.innerHTML = html;
}

function setHTML(node, html) {
  if (typeof node === 'string') node = el(node);
  if (node) node.innerHTML = html;
}

// ── API helpers ───────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  Object.assign(headers, options.headers || {});

  const res  = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  // Auto-logout if token expired / invalid
  if (res.status === 401) {
    doLogout();
    showToast('error', 'Session expired', 'Please sign in again.');
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    // Pydantic returns detail as an array of error objects — parse to readable string
    let msg;
    if (Array.isArray(data.detail)) {
      msg = data.detail.map(e => {
        const field = e.loc ? e.loc.slice(-1)[0] : '';
        return field ? `${field}: ${e.msg}` : e.msg;
      }).join(' | ');
    } else {
      msg = data.detail || `HTTP ${res.status}`;
    }
    throw new Error(msg);
  }
  return data;
}

async function apiUpload(path, formData) {
  const res  = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body:    formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────
function showToast(type, title, msg = '') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const id    = Date.now();
  const div   = document.createElement('div');
  div.className = `toast ${type}`;
  div.id = `toast-${id}`;
  div.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>`;
  el('toasts').appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ── Loading overlay ───────────────────────────────────────
function showLoading(text = 'Processing...', sub = '') {
  el('loading').innerHTML = `
    <div class="spinner-ring"></div>
    <div class="loading-text">${text}</div>
    ${sub ? `<div class="loading-sub">${sub}</div>` : ''}`;
  el('loading').classList.remove('hidden');
}
function hideLoading() { el('loading').classList.add('hidden'); }

// ── Auth ──────────────────────────────────────────────────
async function doLogin(userData, token) {
  state.user  = userData;
  state.token = token;
  localStorage.setItem('nd_user',  JSON.stringify(userData));
  localStorage.setItem('nd_token', token);

  // Fetch full profile (includes phone_number, age, gender, email)
  try {
    const profile = await apiFetch('/me');
    state.user = { ...state.user, ...profile };
    localStorage.setItem('nd_user', JSON.stringify(state.user));
  } catch(_) {/* non-critical, continue */}

  navigate('dashboard');
}

function doLogout() {
  state.user = state.token = null;
  state.page = 'dashboard';
  state.lastResult = null;
  localStorage.removeItem('nd_user');
  localStorage.removeItem('nd_token');

  // Reset auth form state so the next user starts fresh
  currentTab   = 'login';
  selectedRole = 'doctor';
  uploadFile   = null;
  uploadStep   = 1;

  renderApp();
}

// ── Navigation ────────────────────────────────────────────
function navigate(page) {
  state.page = page;
  renderApp();
}

// ══════════════════════════════════════
//  AUTH PAGE
// ══════════════════════════════════════
function renderAuthPage() {
  return `
  <div class="auth-page">
    <div class="auth-blob auth-blob-1"></div>
    <div class="auth-blob auth-blob-2"></div>
    <div class="auth-blob auth-blob-3"></div>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-badge">🧠 NeuroDetect AI</div>
        <h2>Alzheimer's MRI Analysis</h2>
        <p>AI-powered diagnosis for clinical workflows</p>
      </div>

      <div class="tab-switch">
        <button class="tab-btn active" id="tab-login" onclick="switchAuthTab('login')">Sign In</button>
        <button class="tab-btn" id="tab-signup" onclick="switchAuthTab('signup')">Create Account</button>
      </div>

      <div id="role-selector" class="hidden">
        <div class="role-selector">
          <div class="role-card selected" id="role-doctor" onclick="selectRole('doctor')">
            <div class="role-emoji">🩺</div>
            <div class="role-label">Doctor</div>
            <div class="role-desc">Clinical access</div>
          </div>
          <div class="role-card" id="role-patient" onclick="selectRole('patient')">
            <div class="role-emoji">🧑</div>
            <div class="role-label">Patient</div>
            <div class="role-desc">Personal reports</div>
          </div>
        </div>
      </div>

      <div id="auth-error" class="error-msg hidden"></div>

      <form id="auth-form" onsubmit="submitAuth(event)">
        <!-- SIGN UP ONLY FIELDS -->
        <div class="form-group hidden" id="field-name">
          <label class="form-label">Full Name <span style="color:#ef4444">*</span></label>
          <input class="form-input" type="text" id="input-name" placeholder="Dr. Ramesh Kumar" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group hidden" id="field-phone">
            <label class="form-label">Phone Number <span style="color:#ef4444">*</span></label>
            <input class="form-input" type="tel" id="input-phone" placeholder="+91 98765 43210" />
          </div>
          <div class="form-group hidden" id="field-age">
            <label class="form-label">Age <span style="color:#ef4444">*</span></label>
            <input class="form-input" type="number" id="input-age" placeholder="35" min="1" max="120" />
          </div>
        </div>
        <div class="form-group hidden" id="field-gender">
          <label class="form-label">Gender <span style="color:#ef4444">*</span></label>
          <select class="form-input" id="input-gender" style="cursor:pointer">
            <option value="">-- Select Gender --</option>
            <option value="male">♂️ Male</option>
            <option value="female">♀️ Female</option>
            <option value="other">⚧️ Other</option>
          </select>
        </div>
        <!-- COMMON FIELDS -->
        <div class="form-group">
          <label class="form-label">Email Address <span style="color:#ef4444">*</span></label>
          <input class="form-input" type="email" id="input-email" placeholder="doctor@hospital.com" required />
        </div>
        <div class="form-group">
          <label class="form-label">Password <span style="color:#ef4444">*</span></label>
          <input class="form-input" type="password" id="input-password" placeholder="Min. 6 characters" required />
        </div>
        <button type="submit" class="btn btn-primary" id="auth-submit-btn">🔐 Sign In</button>
      </form>

      <div style="text-align:center;margin-top:16px;font-size:12px;color:var(--text-muted)">
        Demo: Sign up as a Doctor or Patient to begin
      </div>
    </div>
  </div>`;
}

// Called by renderApp after auth page is injected into DOM
function resetAuthForm() {
  ['input-name','input-email','input-password','input-phone','input-age'].forEach(id => {
    const inp = el(id); if (inp) inp.value = '';
  });
  const genderEl = el('input-gender');
  if (genderEl) genderEl.value = '';

  // Reset JS variable — THIS is what gets sent to the backend
  currentTab   = 'login';
  selectedRole = 'doctor';

  el('role-doctor')?.classList.add('selected');
  el('role-patient')?.classList.remove('selected');
  el('tab-login')?.classList.add('active');
  el('tab-signup')?.classList.remove('active');
  el('role-selector')?.classList.add('hidden');
  ['field-name','field-phone','field-age','field-gender'].forEach(id => {
    el(id)?.classList.add('hidden');
  });
  // Clear both the hidden class AND any leftover inline styles (e.g. green signup-success)
  const errEl = el('auth-error');
  if (errEl) { errEl.classList.add('hidden'); errEl.style.cssText = ''; }
  const btn = el('auth-submit-btn');
  if (btn) btn.textContent = '🔐 Sign In';
}

let currentTab = 'login';
let selectedRole = 'doctor';

function switchAuthTab(tab) {
  currentTab = tab;
  el('tab-login')?.classList.toggle('active', tab === 'login');
  el('tab-signup')?.classList.toggle('active', tab === 'signup');
  el('role-selector')?.classList.toggle('hidden', tab === 'login');
  ['field-name','field-phone','field-age','field-gender'].forEach(id => {
    el(id)?.classList.toggle('hidden', tab === 'login');
  });
  // Show role in the button so user always knows what they're signing up as
  const btn = el('auth-submit-btn');
  if (btn) btn.textContent = tab === 'login'
    ? '🔐 Sign In'
    : `🚀 Create Account as ${selectedRole === 'patient' ? 'Patient' : 'Doctor'}`;
  // Hide banner AND clear any inline style (prevents green signup-success bleeding into errors)
  const errEl = el('auth-error');
  if (errEl) { errEl.classList.add('hidden'); errEl.style.cssText = ''; }
}

function selectRole(role) {
  selectedRole = role;
  el('role-doctor')?.classList.toggle('selected', role === 'doctor');
  el('role-patient')?.classList.toggle('selected', role === 'patient');
  // Update button text to confirm selected role clearly
  const btn = el('auth-submit-btn');
  if (btn && currentTab === 'signup') {
    btn.textContent = `🚀 Create Account as ${role === 'patient' ? 'Patient' : 'Doctor'}`;
  }
}

// Email format validator — must match name@domain.ext
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

async function submitAuth(e) {
  e.preventDefault();
  const btn = el('auth-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Processing...';

  // Sync currentTab from DOM in case of re-render desync
  if (el('tab-signup')?.classList.contains('active')) currentTab = 'signup';
  else currentTab = 'login';

  // Hide & fully reset the error/success banner
  const errBanner = el('auth-error');
  errBanner.classList.add('hidden');
  errBanner.style.cssText = '';  // clear any inline green style from prior signup success

  try {
    const emailVal = el('input-email').value.trim();

    // ── Email format check (both login & signup) ──────────────
    if (!emailVal) {
      showAuthError('Email address is required'); return;
    }
    if (!isValidEmail(emailVal)) {
      showAuthError('Please enter a valid email address (e.g. name@gmail.com)'); return;
    }

    let data;
    if (currentTab === 'login') {
      const pwd = el('input-password').value;
      if (!pwd) { showAuthError('Password is required'); return; }

      data = await apiFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailVal, password: pwd }),
      });
    } else {
      // ── Validate all required signup fields ──────────────────
      const name   = el('input-name').value.trim();
      const phone  = el('input-phone').value.trim();
      const age    = parseInt(el('input-age').value);
      const gender = el('input-gender').value;
      const pwd    = el('input-password').value;

      if (!name)                    { showAuthError('Full name is required');                          return; }
      if (!phone)                   { showAuthError('Phone number is required');                       return; }
      if (!/^\+?[\d\s\-()]{7,}$/.test(phone))
                                    { showAuthError('Please enter a valid phone number');              return; }
      if (!age || age < 1 || age > 120) { showAuthError('Please enter a valid age (1–120)');          return; }
      if (!gender)                  { showAuthError('Please select your gender');                      return; }
      if (!pwd || pwd.length < 6)   { showAuthError('Password must be at least 6 characters');        return; }

      data = await apiFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({
          full_name:    name,
          email:        emailVal,
          password:     pwd,
          role:         selectedRole,
          phone_number: phone,
          age:          age,
          gender:       gender,
        }),
      });

      // ── After signup: switch to Sign In tab, pre-fill email, show success ──
      switchAuthTab('login');
      const emailField = el('input-email');
      if (emailField) emailField.value = emailVal;
      el('input-password').value = '';

      // Show a prominent success banner above the form
      const errEl = el('auth-error');
      errEl.textContent = `✅ Account created for ${data.full_name}! Please sign in below.`;
      errEl.style.cssText = 'background:rgba(34,197,94,0.15);border:1px solid #22c55e;color:#22c55e;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:500;';
      errEl.classList.remove('hidden');
      return;
    }
    doLogin({ full_name: data.full_name, role: data.role, user_id: data.user_id }, data.access_token);
    showToast('success', 'Welcome back!', `Signed in as ${data.full_name}`);
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    // Re-read currentTab — may have been switched by signup success handler
    const activeTab = el('tab-signup')?.classList.contains('active') ? 'signup' : 'login';
    btn.textContent = activeTab === 'login'
      ? '🔐 Sign In'
      : `🚀 Create Account as ${selectedRole === 'patient' ? 'Patient' : 'Doctor'}`;
  }
}

function showAuthError(msg) {
  const e = el('auth-error');
  // Always reset inline style so green signup-success colour doesn't persist
  e.style.cssText = 'background:rgba(239,68,68,0.12);border:1px solid #ef4444;color:#ef4444;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:500;';
  e.textContent = `⚠️ ${msg}`;
  e.classList.remove('hidden');
}

// ══════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════
function renderSidebar() {
  const isDoctor = state.user?.role === 'doctor';
  const nav = isDoctor ? [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'upload',    icon: `${UPLOAD_SVG}`, label: 'Upload MRI' },
    { id: 'patients',  icon: '👥', label: 'Patients' },
    { id: 'metrics',   icon: '📈', label: 'Model Metrics' },
    { id: 'reports',   icon: '📋', label: 'All Reports' },
  ] : [
    { id: 'dashboard',  icon: '🏠', label: 'My Dashboard' },
    { id: 'upload',     icon: `${UPLOAD_SVG}`, label: 'Upload MRI' },
    { id: 'my-reports', icon: '📋', label: 'My Reports' },
  ];

  const u = state.user || {};
  const accentColor = isDoctor ? 'var(--primary)' : '#22c55e';
  const roleLabel   = isDoctor ? '🩺 Doctor' : '🧑 Patient';

  return `
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-icon">🧠</div>
      <div>
        <h1>NeuroDetect</h1>
        <span>AI Diagnosis Platform</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">${isDoctor ? 'Doctor' : 'Patient'} Portal</div>
      ${nav.map(item => `
        <button class="nav-item ${state.page === item.id ? 'active' : ''}" onclick="navigate('${item.id}')">
          <span class="nav-icon">${item.icon}</span> ${item.label}
        </button>
      `).join('')}
    </nav>

    <!-- Profile popup (hidden by default) -->
    <div id="profile-popup" style="
      display:none;position:absolute;bottom:80px;left:12px;right:12px;
      background:var(--surface);border:1px solid var(--border);border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.45);z-index:999;overflow:hidden;
      animation:popupIn 0.18s ease">
      <style>
        @keyframes popupIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      </style>
      <!-- Popup header -->
      <div style="background:${accentColor}22;padding:16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)">
        <div style="width:44px;height:44px;border-radius:50%;background:${accentColor};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0">
          ${(u.full_name?.[0] || '?').toUpperCase()}
        </div>
        <div>
          <div style="font-weight:700;color:var(--text);font-size:14px">${u.full_name || '—'}</div>
          <div style="font-size:12px;color:${accentColor};font-weight:600">${roleLabel}</div>
        </div>
      </div>
      <!-- Details -->
      <div style="padding:12px 16px">
        ${[
          ['Email',  u.email        || '—'],
          ['Phone',  u.phone_number || '—'],
          ['Age',    u.age          ? u.age + ' years' : '—'],
          ['Gender', u.gender       ? (u.gender.charAt(0).toUpperCase() + u.gender.slice(1)) : '—'],
          ['Role',   isDoctor ? 'Doctor' : 'Patient'],
        ].map(([key, val]) => `
          <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:12px;color:var(--text-muted);width:52px;flex-shrink:0">${key}</span>
            <span style="font-size:12px;color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</span>
          </div>`).join('')}
      </div>
      <!-- Logout -->
      <div style="padding:10px 16px">
        <button onclick="doLogout()" style="
          width:100%;padding:9px;border-radius:8px;border:none;cursor:pointer;
          background:#ef444422;color:#ef4444;font-weight:700;font-size:13px;
          display:flex;align-items:center;justify-content:center;gap:8px;
          transition:background 0.2s"
          onmouseenter="this.style.background='#ef444433'"
          onmouseleave="this.style.background='#ef444422'">
          ⏹️ Sign Out
        </button>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="user-chip" onclick="toggleProfilePopup()" style="cursor:pointer" title="View profile">
        <div class="user-avatar" style="background:${accentColor}">${(u.full_name?.[0] || '?').toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${u.full_name}</div>
          <div class="user-role" style="color:${accentColor};font-weight:600">${roleLabel}</div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);margin-left:auto">▲</span>
      </div>
    </div>
  </aside>`;
}

function toggleProfilePopup() {
  const popup = el('profile-popup');
  if (!popup) return;
  const isOpen = popup.style.display !== 'none';
  popup.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // Close on next outside click
    setTimeout(() => {
      document.addEventListener('click', closeProfilePopupOutside, { once: true });
    }, 10);
  }
}

function closeProfilePopupOutside(e) {
  const popup = el('profile-popup');
  if (popup && !popup.contains(e.target)) {
    popup.style.display = 'none';
  }
}

// ══════════════════════════════════════
//  DOCTOR DASHBOARD
// ══════════════════════════════════════
async function renderDoctorDashboard() {
  showLoading('Loading dashboard...');
  let patients = [], reports = [];
  try {
    [patients, reports] = await Promise.all([
      apiFetch('/patients').catch(() => []),
      apiFetch('/reports').catch(() => []),
    ]);
  } finally { hideLoading(); }

  const stageCounts = {};
  reports.forEach(r => { stageCounts[r.diagnosis] = (stageCounts[r.diagnosis] || 0) + 1; });

  const stats = [
    { icon: '👥', bg: 'rgba(99,102,241,0.15)',  label: 'Total Patients', value: patients.length, sub: 'Registered' },
    { icon: '📋', bg: 'rgba(236,72,153,0.15)', label: 'MRI Reports',   value: reports.length,  sub: 'Analyzed' },
    { icon: '🟢', bg: 'rgba(34,197,94,0.15)',   label: 'No Impairment', value: stageCounts['No Impairment'] || 0, sub: 'Cases' },
    { icon: '🔴', bg: 'rgba(239,68,68,0.15)',   label: 'Moderate Cases', value: stageCounts['Moderate Impairment'] || 0, sub: 'Critical' },
  ];

  const recentReports = reports.slice(0, 5).map(r => `
    <tr>
      <td class="td-name">🖼️ ${r.filename}</td>
      <td>${severityBadge(r.diagnosis)}</td>
      <td>${r.confidence}%</td>
      <td>${r.patient_name !== 'N/A' ? `<span style="color:var(--text);font-weight:500">${r.patient_name}</span>` : '<span style="color:var(--text-muted);font-style:italic">— Direct</span>'}</td>
    </tr>`).join('');

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI</div>
      <h2>Doctor Dashboard</h2>
      <p>Overview of patients, MRI reports, and model activity</p>
    </div>
    <div class="page-body">
      <div class="stats-grid">
        ${stats.map(s => `
          <div class="stat-card">
            <div class="stat-icon" style="background:${s.bg}">${s.icon}</div>
            <div class="stat-body">
              <div class="stat-label">${s.label}</div>
              <div class="stat-value">${s.value}</div>
              <div class="stat-sub">${s.sub}</div>
            </div>
          </div>`).join('')}
      </div>

      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <div class="section-title">📊 Stage Distribution</div>
          ${Object.keys(stageCounts).length ? `
            <div style="display:flex;gap:10px;flex-wrap:wrap;padding:8px 0">
              ${Object.entries(stageCounts).map(([label, count]) => {
                const colors = {
                  'No Impairment':       '#22c55e',
                  'Very Mild Impairment':'#eab308',
                  'Mild Impairment':     '#f97316',
                  'Moderate Impairment': '#ef4444'
                };
                const pct = Math.round((count / reports.length) * 100);
                return `<div style="flex:1;min-width:100px">
                  <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${label.replace(' Impairment','')}</div>
                  <div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${colors[label]||'#6366f1'};border-radius:99px"></div>
                  </div>
                  <div style="font-size:13px;font-weight:700;color:${colors[label]||'#6366f1'};margin-top:4px">${count} <span style="font-weight:400;color:var(--text-muted)">(${pct}%)</span></div>
                </div>`;
              }).join('')}
            </div>` : '<div class="empty-state"><div class="empty-icon">📊</div><p>No report data yet.</p></div>'}
        </div>

        <div class="card">
          <div class="flex-between mb-16">
            <div class="section-title" style="margin-bottom:0">🕐 Recent Reports</div>
            <button class="btn btn-ghost btn-sm" onclick="navigate('reports')">View All →</button>
          </div>
          ${reports.length ? `
            <div class="table-wrapper">
              <table>
                <thead><tr><th>File</th><th>Diagnosis</th><th>Conf%</th><th>Patient</th></tr></thead>
                <tbody>${recentReports}</tbody>
              </table>
            </div>` : '<div class="empty-state"><div class="empty-icon">📋</div><p>No reports yet</p></div>'}
        </div>
      </div>

      <div class="section-title">⚡ Quick Actions</div>
      <div class="grid-3">
        ${[
          { icon: UPLOAD_SVG_LG, title: 'Upload MRI Scan',  desc: 'Analyze a new brain MRI image',    page: 'upload',   color: '#6366f1' },
          { icon: '👥', title: 'View Patients',     desc: 'Browse all registered patients',   page: 'patients', color: '#ec4899' },
          { icon: '📈', title: 'Model Metrics',     desc: 'View accuracy & confusion matrix', page: 'metrics',  color: '#22c55e' },
        ].map(a => `
          <div class="card" style="cursor:pointer;transition:border-color 0.2s"
               onmouseenter="this.style.borderColor='${a.color}'"
               onmouseleave="this.style.borderColor='var(--border)'"
               onclick="navigate('${a.page}')">
            <div style="font-size:32px;margin-bottom:12px">${a.icon}</div>
            <div style="font-weight:600;color:var(--text);margin-bottom:4px">${a.title}</div>
            <div style="font-size:13px;color:var(--text-secondary)">${a.desc}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════
//  PATIENT DASHBOARD
// ══════════════════════════════════════
async function renderPatientDashboard() {
  showLoading('Loading your profile...');
  let reports = [];
  try { reports = await apiFetch('/my-reports').catch(() => []); }
  finally { hideLoading(); }

  const last = reports[0];

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI</div>
      <h2>Welcome, ${state.user.full_name} 👋</h2>
      <p>Your MRI reports and Alzheimer's analysis results</p>
    </div>
    <div class="page-body">
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
        ${[
          { icon: '📋', bg: 'rgba(99,102,241,0.15)', label: 'Total Scans', value: reports.length, sub: 'Uploaded' },
          { icon: '🏥', bg: 'rgba(34,197,94,0.15)',  label: 'Latest Stage', value: last ? last.diagnosis.split(' ')[0] : '—', sub: 'Diagnosis' },
          { icon: '📊', bg: 'rgba(234,179,8,0.15)',  label: 'Confidence', value: last ? `${last.confidence}%` : '—', sub: 'Last scan' },
        ].map(s => `
          <div class="stat-card">
            <div class="stat-icon" style="background:${s.bg}">${s.icon}</div>
            <div class="stat-body">
              <div class="stat-label">${s.label}</div>
              <div class="stat-value" style="font-size:24px">${s.value}</div>
              <div class="stat-sub">${s.sub}</div>
            </div>
          </div>`).join('')}
      </div>

      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <div class="section-title">👤 Profile</div>
          ${[['Name', state.user.full_name], ['Role', 'Patient'], ['Account', 'Active']].map(([k,v]) => `
            <div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`).join('')}
        </div>
        <div class="card flex-center" style="flex-direction:column;gap:16px;text-align:center">
          <div style="margin-bottom:8px">
            <svg width="56" height="56" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="46" width="52" height="14" rx="3" fill="#5b6880"/>
              <rect x="10" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
              <rect x="42" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
              <rect x="30" y="20" width="12" height="28" fill="#1565C0"/>
              <rect x="30" y="20" width="6" height="28" fill="#1976D2"/>
              <polygon points="36,4 58,30 14,30" fill="#1565C0"/>
              <polygon points="36,4 47,17 36,30 25,17" fill="#1E88E5"/>
            </svg>
          </div>
          <div style="font-weight:700;font-size:18px;color:var(--text)">Scan Your MRI</div>
          <div style="font-size:13px;color:var(--text-secondary);max-width:260px">Upload a brain MRI image to receive an instant Alzheimer's stage prediction.</div>
          <button class="btn btn-primary" style="max-width:200px" onclick="navigate('upload')">${UPLOAD_SVG} Upload MRI Scan</button>
        </div>
      </div>

      ${reports.length ? `
        <div class="flex-between mb-16">
          <div class="section-title" style="margin-bottom:0">🕐 Recent Reports</div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('my-reports')">View All →</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>File</th><th>Diagnosis</th><th>Confidence</th><th>Date</th></tr></thead>
            <tbody>
              ${reports.slice(0,5).map(r => `
                <tr>
                  <td class="td-name">🖼️ ${r.filename}</td>
                  <td>${severityBadge(r.diagnosis)}</td>
                  <td style="color:var(--text)">${r.confidence}%</td>
                  <td>${new Date(r.created_at).toLocaleDateString()}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
    </div>`;
}

// ══════════════════════════════════════
//  UPLOAD MRI
// ══════════════════════════════════════
let uploadFile = null;
let uploadStep = 1;
let doctorPatients = [];

async function renderUploadPage() {
  if (state.user?.role === 'doctor') {
    try { doctorPatients = await apiFetch('/patients'); }
    catch(_) { doctorPatients = []; }
  }

  const patientSelector = state.user?.role === 'doctor' ? `
    <div class="card" style="margin-bottom:20px">
      <div class="section-title" style="margin-bottom:12px;color:#60a5fa;display:flex;align-items:center;gap:6px">👤 Link to Patient (Optional)</div>
      <select id="select-patient" class="form-input" style="cursor:pointer;width:100%">
        <option value="">— Select a patient to link this scan to —</option>
        ${doctorPatients.map(p =>
          `<option value="${p.id}">${p.full_name} (${p.email})</option>`
        ).join('')}
      </select>
      <div style="font-size:12px;color:var(--text-muted);margin-top:8px">If left blank, the report will be saved without a patient link.</div>
    </div>` : '';

  return `
    <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div class="breadcrumb">NeuroDetect AI / Upload</div>
        <h2>${UPLOAD_SVG_LG} Upload MRI Scan</h2>
        <p>Drag and drop or browse a brain MRI image for Alzheimer's prediction</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('dashboard')" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px">
        ← Back to Dashboard
      </button>
    </div>
    <div class="page-body">
      <div class="progress-steps" style="margin-bottom:24px">
        ${['Select Image','Preview & Confirm','Get Results'].map((label, i) => `
          <div class="progress-step">
            <div class="step-dot ${uploadStep > i+1 ? 'done' : uploadStep === i+1 ? 'active' : ''}">${uploadStep > i+1 ? '✓' : i+1}</div>
            <div class="step-label">${label}</div>
          </div>`).join('')}
      </div>
      ${patientSelector}
      <div class="upload-layout">
        <div class="drop-zone" id="drop-zone" onclick="el('file-input').click()"
             ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
          <input type="file" id="file-input" accept="image/jpeg,image/png" hidden onchange="handleFileInput(event)" />
          <div class="drop-icon">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Tray -->
              <rect x="10" y="46" width="52" height="14" rx="3" fill="#5b6880"/>
              <rect x="10" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
              <rect x="42" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
              <!-- Arrow shaft -->
              <rect x="30" y="20" width="12" height="28" fill="#1565C0"/>
              <rect x="30" y="20" width="6" height="28" fill="#1976D2"/>
              <!-- Arrow head -->
              <polygon points="36,4 58,30 14,30" fill="#1565C0"/>
              <polygon points="36,4 47,17 36,30 25,17" fill="#1E88E5"/>
            </svg>
          </div>
          <h3>Drop MRI Image Here</h3>
          <p>or click to browse from your device</p>
          <div class="drop-hint">Supports JPEG, PNG · Max 10MB</div>
        </div>

        <div class="preview-panel">
          <div class="section-title" style="margin-bottom:0">📷 Image Preview</div>
          <div id="preview-area" style="flex:1;display:flex;flex-direction:column">
            <div class="empty-state" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <svg width="48" height="48" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity:0.35;margin-bottom:12px">
                <rect x="10" y="46" width="52" height="14" rx="3" fill="#5b6880"/>
                <rect x="10" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
                <rect x="42" y="46" width="20" height="14" rx="2" fill="#7a8899"/>
                <rect x="30" y="20" width="12" height="28" fill="#1565C0"/>
                <rect x="30" y="20" width="6" height="28" fill="#1976D2"/>
                <polygon points="36,4 58,30 14,30" fill="#1565C0"/>
                <polygon points="36,4 47,17 36,30 25,17" fill="#1E88E5"/>
              </svg>
              <div style="font-size:14px;color:var(--text-secondary);font-weight:500;margin-bottom:4px">No image selected yet.</div>
              <div style="font-size:12px;color:var(--text-muted)">Upload an MRI scan to preview it here.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="info-box mt-24">
        <div class="info-box-title" style="color:#60a5fa;margin-bottom:14px;font-size:14px">How It Works</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
          ${[
            ['1', 'Select Image',    'Choose a brain MRI scan from your device (JPEG or PNG)'],
            ['2', 'Upload',          'The image is securely sent to the analysis server'],
            ['3', 'AI Analysis',     'Our model examines the scan for Alzheimer\'s indicators'],
            ['4', 'View Results',    'Get a clear stage diagnosis with confidence score'],
          ].map(([num, title, desc]) => `
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div style="width:26px;height:26px;border-radius:50%;background:#3b82f6;color:#fff;
                          font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;
                          flex-shrink:0;margin-top:1px">${num}</div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">${title}</div>
                <div style="font-size:12px;color:var(--text-muted);line-height:1.4">${desc}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function onDragOver(e) { e.preventDefault(); el('drop-zone').classList.add('drag-over'); }
function onDragLeave()  { el('drop-zone').classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  el('drop-zone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
}
function handleFileInput(e) { handleFile(e.target.files[0]); }

function handleFile(f) {
  if (!f) return;
  if (!['image/jpeg','image/png','image/jpg'].includes(f.type)) {
    showToast('error','Invalid file','Only JPEG and PNG files are accepted.'); return;
  }
  uploadFile = f;
  uploadStep = 2;
  const url = URL.createObjectURL(f);
  setHTML('preview-area', `
    <img src="${url}" alt="MRI Preview" class="preview-image" />
    <div class="preview-meta">File: <span>${f.name}</span> · Size: <span>${(f.size/1024).toFixed(1)} KB</span></div>
    <div style="display:flex;gap:10px;margin-top:auto">
      <button class="btn btn-ghost" style="flex:1" onclick="resetUpload()">🗑️ Remove</button>
      <button class="btn btn-primary" style="flex:2" onclick="analyzeImage()">🔍 Analyze Scan</button>
    </div>`);
}

function resetUpload() {
  uploadFile = null;
  uploadStep = 1;
  navigate('upload');
}

async function analyzeImage() {
  if (!uploadFile) return;
  const selectedModel = (document.querySelector('input[name="model-select"]:checked') || {}).value || 'resnet50';
  showLoading('Running AI Analysis', 'Analyzing MRI brain scan with neural network...');
  try {
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('model_name', selectedModel);
    const patientSel = el('select-patient');
    if (patientSel && patientSel.value) fd.append('patient_id', patientSel.value);
    const result = await apiUpload('/predict', fd);
    state.lastResult = result;
    hideLoading();
    showToast('success', 'Analysis Complete!', `Diagnosis: ${result.diagnosis}`);
    uploadStep = 3;
    navigate('results');
  } catch (err) {
    hideLoading();
    showToast('error', 'Prediction failed', err.message);
  }
}

// ══════════════════════════════════════
//  RESULTS PAGE
// ══════════════════════════════════════
function renderResultsPage() {
  const result = state.lastResult;
  if (!result) return `
    <div class="page-header"><h2>📊 Results</h2></div>
    <div class="page-body">
      <div class="empty-state card">
        <div class="empty-icon">🔍</div>
        <p>No analysis result yet.</p>
        <button class="btn btn-primary mt-16" style="max-width:200px" onclick="navigate('upload')">Upload MRI Scan</button>
      </div>
    </div>`;

  const sevColors = { low:'#22c55e', medium:'#eab308', high:'#f97316', critical:'#ef4444' };
  const color     = sevColors[result.severity_level] || '#6366f1';
  const sevEmoji  = { low:'🟢', medium:'🟡', high:'🟠', critical:'🔴' };
  const sevLabel  = { low:'Low Risk', medium:'Moderate Risk', high:'High Risk', critical:'Critical' };

  const stages = [
    { label:'No Impairment',       color:'#22c55e', sev:'low',      desc:'Normal brain function. No clinical signs of impairment.' },
    { label:'Very Mild Impairment',color:'#eab308', sev:'medium',   desc:'Subtle memory lapses, largely independent.' },
    { label:'Mild Impairment',     color:'#f97316', sev:'high',     desc:'Noticeable memory & cognitive difficulty.' },
    { label:'Moderate Impairment', color:'#ef4444', sev:'critical', desc:'Requires full-time care and assistance.' },
  ];

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI / Results</div>
      <h2>📊 Analysis Results</h2>
      <p>AI-generated Alzheimer's stage prediction from your MRI scan</p>
    </div>
    <div class="page-body">
      <div class="results-grid">
        <div class="result-hero">
          <div class="result-pulse" style="background:${color}22;border:3px solid ${color}">
            ${sevEmoji[result.severity_level]}
          </div>
          <div class="result-diagnosis" style="color:${color}">${result.diagnosis}</div>
          <div class="result-confidence">
            Confidence: <strong style="color:var(--text)">${result.confidence}%</strong>
            &nbsp;·&nbsp;
            <span class="badge badge-${result.severity_level}">${sevLabel[result.severity_level]}</span>
          </div>
          <div class="confidence-bar-outer" style="max-width:100%">
            <div class="confidence-bar-inner" style="width:${result.confidence}%;background:linear-gradient(90deg,${color},${color}aa)"></div>
          </div>
          <div class="result-description">${result.stage_description}</div>
          <div style="display:flex;gap:10px;justify-content:center;width:100%">
            <button class="btn btn-secondary" onclick="navigate('upload')">🔄 New Scan</button>
            <button class="btn btn-primary" onclick="generateMedicalReport()">📄 Download Report</button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="section-title">🧬 Alzheimer's Stages</div>
            ${stages.map(s => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);
                           opacity:${result.diagnosis===s.label?1:0.45};transform:${result.diagnosis===s.label?'scale(1.02)':'none'};transition:all 0.2s">
                <div style="width:8px;height:32px;border-radius:4px;background:${s.color};flex-shrink:0"></div>
                <div>
                  <div style="font-weight:600;font-size:13px;color:${result.diagnosis===s.label?s.color:'var(--text)'}">${s.label}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${s.desc}</div>
                </div>
                ${result.diagnosis===s.label?`<span class="badge badge-${s.sev}" style="margin-left:auto">▶ Current</span>`:''}
              </div>`).join('')}
          </div>

          <div class="card">
            <div class="section-title">📁 Report Info</div>
            ${[['File',result.filename],['Diagnosis',result.diagnosis],['Confidence',`${result.confidence}%`],['Model',result.model_used||'—'],['Risk Level',sevLabel[result.severity_level]]].map(([k,v]) => `
              <div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════
//  MEDICAL REPORT GENERATOR
// ══════════════════════════════════════
function generateMedicalReport() {
  const result = state.lastResult;
  if (!result) return;

  const patient  = state.user?.full_name || 'Unknown Patient';
  const role     = state.user?.role     || 'patient';
  const now      = new Date();
  const dateStr  = now.toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });
  const timeStr  = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const reportId = 'NDR-' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-' + Math.floor(Math.random()*9000+1000);

  const sevColors = { low:'#16a34a', medium:'#d97706', high:'#ea580c', critical:'#dc2626' };
  const sevBg     = { low:'#dcfce7', medium:'#fef3c7', high:'#ffedd5', critical:'#fee2e2' };
  const sevLabel  = { low:'Low Risk', medium:'Moderate Risk', high:'High Risk', critical:'Critical Risk' };
  const color     = sevColors[result.severity_level] || '#6366f1';
  const bg        = sevBg[result.severity_level]     || '#eef2ff';

  const stageDetails = {
    'No Impairment': {
      overview: 'No Impairment (also known as clinically normal) represents a state of normal brain function with no detectable cognitive decline. Individuals in this stage show no memory problems and no symptoms of dementia.',
      symptoms: ['No significant memory problems', 'Normal daily functioning', 'No behavioral changes', 'Standard cognitive test performance'],
      risk: 'Low — Regular monitoring recommended every 12–24 months.',
      recommendations: ['Maintain healthy lifestyle (exercise, diet, sleep)', 'Regular cognitive check-ups', 'Manage cardiovascular risk factors', 'Stay socially and mentally active'],
    },
    'Very Mild Impairment': {
      overview: 'Very Mild Impairment (early-stage) involves subtle memory lapses that may be noticeable to close family or friends but not yet clinically significant. Daily activities remain largely unaffected.',
      symptoms: ['Occasional forgetfulness (names, words, keys)', 'Mild difficulty concentrating', 'Subtle personality changes', 'Slight navigation difficulties in unfamiliar places'],
      risk: 'Moderate — Annual neurological evaluation strongly recommended.',
      recommendations: ['Neuropsychological testing', 'Brain-healthy diet (Mediterranean diet)', 'Regular physical exercise (150 min/week)', 'Cognitive training exercises', 'Consider genetic counseling'],
    },
    'Mild Impairment': {
      overview: 'Mild Impairment (moderate Alzheimer\'s) is characterized by noticeable cognitive and functional decline. Memory loss becomes more pronounced, affecting daily life. Professional medical management is essential at this stage.',
      symptoms: ['Significant short-term memory loss', 'Difficulty with problem-solving and planning', 'Confusion with dates/times/places', 'Trouble managing finances or medication', 'Increased anxiety or agitation'],
      risk: 'High — Immediate neurologist consultation and care planning required.',
      recommendations: ['Begin Alzheimer\'s medication (consult specialist)', 'Structured daily routine', 'Safety-proofing the home environment', 'Cognitive therapy / memory aids', 'Caregiver support network', 'Legal & financial planning (POA, will)'],
    },
    'Moderate Impairment': {
      overview: 'Moderate Impairment (late-stage Alzheimer\'s) involves severe cognitive decline with significant loss of independence. Full-time care and medical supervision are required. Behavioral and personality changes are common.',
      symptoms: ['Severe memory loss (may not recognize family)', 'Loss of bowel/bladder control', 'Inability to perform basic ADLs independently', 'Sundowning (increased confusion at night)', 'Delusions, hallucinations, or paranoia', 'Limited verbal communication'],
      risk: 'Critical — Full-time professional or family care required. Immediate specialist referral.',
      recommendations: ['Full-time supervised care (home or facility)', 'Anti-dementia medications (doctor-prescribed)', 'Behavioral intervention therapy', 'Palliative care planning', 'Family counseling and support groups', 'Regular falls prevention assessment'],
    },
  };

  const detail = stageDetails[result.diagnosis] || stageDetails['No Impairment'];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NeuroDetect AI — MRI Report ${reportId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; color:#1a1a2e; background:#fff; font-size:13px; line-height:1.6; }

    .page { max-width:780px; margin:0 auto; padding:40px 48px; }

    /* Header */
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #4f46e5; padding-bottom:18px; margin-bottom:24px; }
    .logo   { display:flex; align-items:center; gap:10px; }
    .logo-icon { font-size:28px; }
    .logo-text h1 { font-size:18px; font-weight:700; color:#4f46e5; letter-spacing:-0.5px; }
    .logo-text p  { font-size:11px; color:#6b7280; margin-top:1px; }
    .report-meta  { text-align:right; font-size:11px; color:#6b7280; }
    .report-meta .report-id { font-weight:700; color:#4f46e5; font-size:12px; }

    /* Section titles */
    .section { margin-bottom:24px; }
    .section-title { font-size:13px; font-weight:700; color:#4f46e5; text-transform:uppercase; letter-spacing:0.8px; border-left:4px solid #4f46e5; padding-left:10px; margin-bottom:12px; }

    /* Diagnosis banner */
    .diagnosis-banner { background:${bg}; border:2px solid ${color}; border-radius:10px; padding:20px 24px; margin-bottom:24px; display:flex; align-items:center; gap:24px; }
    .diag-left { text-align:center; }
    .diag-emoji { font-size:40px; }
    .diag-label { font-size:20px; font-weight:700; color:${color}; margin:6px 0 2px; }
    .diag-conf  { font-size:12px; color:#6b7280; }
    .diag-right { flex:1; border-left:1px solid ${color}44; padding-left:20px; }
    .risk-badge { display:inline-block; background:${color}; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:99px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; }
    .conf-bar   { height:8px; background:#e5e7eb; border-radius:99px; overflow:hidden; margin:6px 0; }
    .conf-fill  { height:100%; background:${color}; border-radius:99px; width:${result.confidence}%; }

    /* 2-col grid */
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
    .info-table { width:100%; border-collapse:collapse; }
    .info-table td { padding:7px 10px; border-bottom:1px solid #f0f0f5; font-size:12px; }
    .info-table td:first-child { color:#6b7280; font-weight:500; width:40%; }
    .info-table td:last-child  { font-weight:600; color:#1a1a2e; }

    /* Disease description */
    .desc-box { background:#f8f9fc; border-radius:8px; padding:16px; margin-bottom:16px; font-size:12.5px; color:#374151; line-height:1.7; }

    /* Symptoms list */
    .symp-list { list-style:none; margin:0; padding:0; }
    .symp-list li { padding:5px 0; font-size:12px; color:#374151; display:flex; gap:8px; }
    .symp-list li::before { content:'•'; color:${color}; font-weight:700; flex-shrink:0; }

    /* Stages table */
    .stages-table { width:100%; border-collapse:collapse; font-size:12px; }
    .stages-table th { background:#f3f4f6; padding:8px 12px; text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; color:#6b7280; letter-spacing:0.5px; }
    .stages-table td { padding:10px 12px; border-bottom:1px solid #f0f0f5; vertical-align:top; }
    .stages-table tr.current-row td { background:${bg}; font-weight:600; }
    .stage-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
    .current-tag { background:${color}; color:#fff; font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; float:right; }

    /* Recommendations */
    .rec-list { list-style:none; padding:0; margin:0; }
    .rec-list li { padding:5px 0 5px 20px; font-size:12px; color:#374151; position:relative; border-bottom:1px solid #f0f0f5; }
    .rec-list li::before { content:'✓'; position:absolute; left:0; color:#16a34a; font-weight:700; }

    /* Disclaimer */
    .disclaimer { background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:14px 16px; font-size:11px; color:#92400e; line-height:1.6; margin-top:24px; }
    .disclaimer strong { color:#78350f; }

    /* Model comparison table */
    .model-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:12px; }
    .model-card { border-radius:8px; padding:14px 16px; border:1.5px solid #e5e7eb; }
    .model-card.primary { border-color:#6366f1; background:#f5f3ff; }
    .model-card.secondary { border-color:#d1fae5; background:#f0fdf4; }
    .model-name { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px; }
    .model-diag { font-size:15px; font-weight:700; margin-bottom:2px; }
    .model-conf { font-size:12px; font-weight:600; }
    .avg-formula { background:#f8f9fc; border:1px dashed #c7d2fe; border-radius:8px; padding:14px 16px; margin-bottom:12px; text-align:center; }
    .avg-formula .formula-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:6px; }
    .avg-formula .f-box { text-align:center; }
    .avg-formula .f-label { font-size:10px; font-weight:700; text-transform:uppercase; margin-bottom:2px; }
    .avg-formula .f-val { font-size:18px; font-weight:800; }
    .avg-formula .f-op { font-size:20px; color:#6b7280; }
    .avg-formula .f-result { background:#fff; border:2px solid ${color}; border-radius:6px; padding:8px 14px; }
    .avg-formula .f-result .f-label { color:${color}; }
    .avg-formula .f-result .f-val { color:${color}; }
    .primary-badge { display:inline-block; background:#6366f1; color:#fff; font-size:9px; font-weight:700; padding:1px 7px; border-radius:99px; margin-bottom:4px; letter-spacing:0.4px; }

    /* Footer */
    .footer { border-top:1px solid #e5e7eb; padding-top:14px; margin-top:20px; display:flex; justify-content:space-between; font-size:10px; color:#9ca3af; }

    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .no-print { display:none !important; }
      .page { padding:24px 32px; }
      .print-btn-bar { display:none; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print" style="background:#4f46e5;padding:12px 24px;display:flex;align-items:center;justify-content:space-between">
    <span style="color:#fff;font-family:Inter,sans-serif;font-size:14px;font-weight:600">📄 NeuroDetect AI — Medical Report</span>
    <button onclick="window.print()" style="background:#fff;color:#4f46e5;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Save as PDF / Print</button>
  </div>

  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="logo">
        <div class="logo-icon">🧠</div>
        <div class="logo-text">
          <h1>NeuroDetect AI</h1>
          <p>AI-Powered Alzheimer's MRI Analysis Platform</p>
        </div>
      </div>
      <div class="report-meta">
        <div class="report-id">${reportId}</div>
        <div style="margin-top:4px">Date: ${dateStr}</div>
        <div>Time: ${timeStr}</div>
        <div style="margin-top:4px;color:#4f46e5;font-weight:600">${role === 'doctor' ? 'Clinical Report' : 'Patient Report'}</div>
      </div>
    </div>

    <!-- PATIENT INFO -->
    <div class="section">
      <div class="section-title">Patient Information</div>
      <table class="info-table">
        <tr><td>Patient Name</td><td>${patient}</td></tr>
        <tr><td>Role</td><td style="text-transform:capitalize">${role}</td></tr>
        <tr><td>Scan File</td><td>${result.filename}</td></tr>
        <tr><td>Report Generated</td><td>${dateStr} at ${timeStr}</td></tr>
        <tr><td>Report ID</td><td>${reportId}</td></tr>
      </table>
    </div>

    <!-- DIAGNOSIS BANNER -->
    <div class="diagnosis-banner">
      <div class="diag-left">
        <div class="diag-emoji">${ {low:'🟢',medium:'🟡',high:'🟠',critical:'🔴'}[result.severity_level] }</div>
        <div class="diag-label">${result.diagnosis}</div>
        <div class="diag-conf">AI Confidence</div>
      </div>
      <div class="diag-right">
        <div class="risk-badge">${sevLabel[result.severity_level]}</div>
        <div style="font-size:12px;color:#374151;margin-bottom:6px">Model Confidence Score</div>
        <div class="conf-bar"><div class="conf-fill"></div></div>
        <div style="font-size:13px;font-weight:700;color:${color}">${result.confidence}%</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px">${result.stage_description}</div>
      </div>
    </div>

    <!-- DISEASE DESCRIPTION -->
    <div class="section">
      <div class="section-title">Diagnosis Overview — ${result.diagnosis}</div>
      <div class="desc-box">${detail.overview}</div>

      <div class="grid2">
        <div>
          <div class="section-title" style="font-size:11px">Common Symptoms</div>
          <ul class="symp-list">
            ${detail.symptoms.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
        <div>
          <div class="section-title" style="font-size:11px">Clinical Recommendations</div>
          <ul class="rec-list">
            ${detail.recommendations.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div style="background:#fef2f2;border-left:4px solid ${color};border-radius:4px;padding:12px 14px;font-size:12px;color:#374151">
        <strong>Risk Assessment:</strong> ${detail.risk}
      </div>
    </div>

    <!-- ALZHEIMER'S STAGES -->
    <div class="section">
      <div class="section-title">Alzheimer's Disease — All Stages</div>
      <table class="stages-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Description</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
          <tr class="${result.diagnosis==='No Impairment'?'current-row':''}">
            <td><span class="stage-dot" style="background:#16a34a"></span>No Impairment${result.diagnosis==='No Impairment'?'<span class="current-tag">Current</span>':''}</td>
            <td>Normal brain function. No clinical signs of impairment.</td>
            <td style="color:#16a34a;font-weight:600">Low</td>
          </tr>
          <tr class="${result.diagnosis==='Very Mild Impairment'?'current-row':''}">
            <td><span class="stage-dot" style="background:#d97706"></span>Very Mild Impairment${result.diagnosis==='Very Mild Impairment'?'<span class="current-tag">Current</span>':''}</td>
            <td>Subtle memory lapses, largely independent. Early monitoring needed.</td>
            <td style="color:#d97706;font-weight:600">Moderate</td>
          </tr>
          <tr class="${result.diagnosis==='Mild Impairment'?'current-row':''}">
            <td><span class="stage-dot" style="background:#ea580c"></span>Mild Impairment${result.diagnosis==='Mild Impairment'?'<span class="current-tag">Current</span>':''}</td>
            <td>Noticeable memory & cognitive difficulty. Medical care required.</td>
            <td style="color:#ea580c;font-weight:600">High</td>
          </tr>
          <tr class="${result.diagnosis==='Moderate Impairment'?'current-row':''}">
            <td><span class="stage-dot" style="background:#dc2626"></span>Moderate Impairment${result.diagnosis==='Moderate Impairment'?'<span class="current-tag">Current</span>':''}</td>
            <td>Significant decline, full-time care required. Immediate specialist referral.</td>
            <td style="color:#dc2626;font-weight:600">Critical</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ABOUT ALZHEIMER'S -->
    <div class="section">
      <div class="section-title">About Alzheimer's Disease</div>
      <div class="desc-box">
        Alzheimer's disease is a progressive neurological disorder that causes brain cells to waste away (degenerate) and die.
        It is the most common cause of dementia — a continuous decline in thinking, behavioral and social skills that affects a
        person's ability to function independently. Early detection through AI-based MRI analysis enables earlier intervention,
        better management, and improved quality of life outcomes. The ResNet50 deep learning model used in this analysis was
        trained on clinically validated MRI datasets to classify stages with high accuracy.
      </div>
    </div>

    <!-- DISCLAIMER -->
    <div class="disclaimer">
      <strong>⚠️ Medical Disclaimer:</strong> This report is generated by NeuroDetect AI (${result.model_used || 'AI Model'}) and is intended
      for informational purposes only. It does <strong>not</strong> constitute a medical diagnosis. Always consult a qualified
      neurologist or healthcare professional before making any clinical decisions. The confidence score reflects model certainty,
      not absolute clinical accuracy. Misclassification is possible in edge cases.
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div>NeuroDetect AI · AI Diagnosis Platform · neurodetect.ai</div>
      <div>Report ID: ${reportId} · Generated ${dateStr}</div>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ══════════════════════════════════════
//  PATIENTS PAGE (Doctor only)
// ══════════════════════════════════════
let selectedPatientId = null;

async function renderPatientsPage() {
  showLoading('Loading patients...');
  let patients = [];
  try { patients = await apiFetch('/patients').catch(() => []); }
  finally { hideLoading(); }

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI / Patients</div>
      <h2>👥 Patients</h2>
      <p>All registered patients in the system</p>
    </div>
    <div class="page-body">
      ${patients.length ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div style="font-size:13px;color:var(--text-muted)">
            <span style="font-weight:700;color:var(--text);font-size:18px">${patients.length}</span>
            &nbsp;patient${patients.length !== 1 ? 's' : ''} registered
          </div>
          <div style="font-size:12px;color:var(--text-muted)">Select a patient when uploading MRI to link the scan to them</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
          ${patients.map(p => {
            const initials = (p.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
            const genderColors = { male:'#6366f1', female:'#ec4899', other:'#22c55e' };
            const avatarBg = genderColors[p.gender?.toLowerCase()] || '#6366f1';
            const regDate = p.registered_at ? new Date(p.registered_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—';
            return `
            <div class="card" style="transition:border-color 0.2s;cursor:default"
                 onmouseenter="this.style.borderColor='var(--primary)'"
                 onmouseleave="this.style.borderColor='var(--border)'">
              <!-- Patient card header -->
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                <div style="width:46px;height:46px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">
                  ${initials}
                </div>
                <div style="overflow:hidden">
                  <div style="font-weight:700;color:var(--text);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.full_name}</div>
                  <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.email}</div>
                </div>
              </div>
              <!-- Details -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
                ${[
                  ['Email',      p.email || '—'],
                  ['Age',        p.age ? p.age + ' years' : '—'],
                  ['Gender',     p.gender ? (p.gender.charAt(0).toUpperCase() + p.gender.slice(1)) : '—'],
                  ['Registered', regDate],
                ].map(([k,v]) => `
                  <div style="background:var(--surface2);border-radius:6px;padding:8px 10px">
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">${k}</div>
                    <div style="font-size:12px;font-weight:600;color:var(--text)">${v}</div>
                  </div>`).join('')}
              </div>
              <!-- Action -->
              <button class="btn btn-ghost btn-sm" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px"
                onclick="navigate('upload')"
                title="Upload MRI scan for this patient">
                ${UPLOAD_SVG} Upload MRI for this Patient
              </button>
            </div>`;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state card">
          <div class="empty-icon">👥</div>
          <p style="margin-bottom:8px">No patients registered yet.</p>
          <p style="font-size:12px;color:var(--text-muted)">Patients need to sign up using the <strong>Create Account → Patient</strong> option.<br/>Once registered, they will appear here.</p>
        </div>`}
    </div>`;
}


// ══════════════════════════════════════
//  REPORTS PAGE
// ══════════════════════════════════════
async function renderReportsPage(myOnly = false) {
  showLoading('Loading reports...');
  let reports = [];
  try {
    reports = await apiFetch(myOnly ? '/my-reports' : '/reports').catch(() => []);
  } finally { hideLoading(); }

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI / ${myOnly ? 'My Reports' : 'All Reports'}</div>
      <h2>📋 ${myOnly ? 'My MRI Reports' : 'All MRI Reports'}</h2>
      <p>${myOnly ? 'Your personal scan history' : 'All patient MRI analysis records'}</p>
    </div>
    <div class="page-body">
      ${reports.length ? `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Diagnosis</th>
                <th>Confidence</th>
                ${!myOnly ? '<th>Patient</th>' : ''}
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map(r => `
                <tr>
                  <td class="td-name">🖼️ ${r.filename}</td>
                  <td>${severityBadge(r.diagnosis)}</td>
                  <td style="color:var(--text)">${r.confidence}%</td>
                  ${!myOnly ? `<td>${r.patient_name !== 'N/A' ? `<span style="color:var(--text);font-weight:500">${r.patient_name}</span>` : '<span style="color:var(--text-muted);font-style:italic">— Direct</span>'}</td>` : ''}
                  <td>${new Date(r.created_at).toLocaleDateString()}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state card">
          <div class="empty-icon">📋</div>
          <p>No reports yet. Upload an MRI scan to see results here.</p>
          <button class="btn btn-primary mt-16" style="max-width:200px" onclick="navigate('upload')">Upload MRI Scan</button>
        </div>`}
    </div>`;
}

// ══════════════════════════════════════
//  MODEL METRICS PAGE
// ══════════════════════════════════════
async function renderMetricsPage() {
  showLoading('Loading metrics...');
  let metrics = null, stats = null, error = '';
  try {
    [metrics, stats] = await Promise.all([
      apiFetch('/metrics'),
      apiFetch('/stats').catch(() => null),
    ]);
  }
  catch(e) { error = e.message; }
  finally { hideLoading(); }

  if (error) return `
    <div class="page-header"><h2>📈 Model Metrics</h2></div>
    <div class="page-body"><div class="error-msg">⚠️ ${error}</div></div>`;

  const labels = metrics.class_labels;
  const short  = ['Non', 'V.Mild', 'Mild', 'Moderate'];
  const cm     = metrics.confusion_matrix;
  const cmMax  = Math.max(...cm.flat());
  const report = metrics.classification_report;
  const accuracy   = parseFloat(metrics.accuracy);
  const avgF1      = (Object.values(report).reduce((s,c) => s + (c?.['f1-score']||0), 0) / labels.length * 100).toFixed(1);

  // Donut SVG gauge
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const filled = circ * (accuracy / 100);
  const donut = `
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="14"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#6366f1" stroke-width="14"
        stroke-dasharray="${filled} ${circ}" stroke-dashoffset="${circ * 0.25}"
        stroke-linecap="round" style="transition:stroke-dasharray 1s ease"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        font-size="20" font-weight="700" fill="var(--text)">${accuracy}%</text>
      <text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="9" fill="var(--text-muted)">ACCURACY</text>
    </svg>`;

  // Stage info for plain-language cards
  const stageInfo = [
    { name:'No Impairment',        color:'#22c55e', icon:'🟢', plain:'Healthy — No signs of Alzheimer\'s detected' },
    { name:'Very Mild Impairment', color:'#eab308', icon:'🟡', plain:'Early stage — Minor forgetfulness, independent living' },
    { name:'Mild Impairment',      color:'#f97316', icon:'🟠', plain:'Moderate stage — Noticeable memory loss, needs support' },
    { name:'Moderate Impairment',  color:'#ef4444', icon:'🔴', plain:'Advanced stage — Requires full-time care' },
  ];

  const barChart = labels.map((label, i) => {
    const cls  = report[label] || {};
    const prec = Math.round((cls.precision  || 0) * 100);
    const rec  = Math.round((cls.recall     || 0) * 100);
    const f1   = Math.round((cls['f1-score']|| 0) * 100);
    const si   = stageInfo[i] || stageInfo[0];
    return `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:12px;height:12px;border-radius:50%;background:${si.color};flex-shrink:0"></div>
        <div style="font-weight:700;font-size:14px;color:var(--text)">${short[i]} Impairment</div>
        <div style="font-size:11px;color:var(--text-muted);margin-left:auto">${si.plain}</div>
      </div>
      ${[['Detection Rate', rec, '#22c55e', 'How often the model correctly identifies this stage'],
         ['Precision',      prec,'#6366f1', 'When it predicts this stage, how often it\'s right'],
         ['Overall Score',  f1,  si.color,  'Combined accuracy score for this stage'],
        ].map(([lbl, val, col, tip]) => `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text-muted)">${lbl}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;color:var(--text-muted);font-style:italic;font-size:10px">${tip}</span>
              <span style="font-size:13px;font-weight:700;color:${col}">${val}%</span>
            </div>
          </div>
          <div style="height:8px;background:var(--surface);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${val}%;background:${col};border-radius:99px;transition:width 0.8s ease"></div>
          </div>
        </div>`).join('')}
    </div>`;
  }).join('');

  // Compact confusion matrix (collapsible details)
  const cmCompact = `<details style="margin-top:4px">
    <summary style="cursor:pointer;font-size:13px;color:var(--text-muted);padding:8px 0;user-select:none">
      ▶ Show detailed confusion matrix (for technical review)
    </summary>
    <div style="overflow-x:auto;margin-top:12px">
      <table style="border-collapse:separate;border-spacing:3px;font-size:12px">
        <thead><tr>
          <th style="color:var(--text-muted);padding:4px 8px;font-size:10px">Actual ↓ / Predicted →</th>
          ${short.map(s => `<th style="color:var(--text-muted);padding:4px 10px;text-align:center">${s}</th>`).join('')}
        </tr></thead>
        <tbody>${cm.map((row, ri) => `<tr>
          <td style="color:var(--text-muted);font-size:11px;padding:4px 8px;white-space:nowrap">${short[ri]}</td>
          ${row.map((val, ci) => {
            const intensity = Math.round((val / cmMax) * 180);
            const bg = ri === ci ? `rgb(50,${80+intensity},50)` : `rgb(${80+Math.round((val/cmMax)*100)},40,40)`;
            return `<td style="text-align:center;padding:0"><div style="min-width:48px;min-height:38px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:4px;font-weight:600;font-size:13px;color:#fff">${val}</div></td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">🟢 Diagonal = correct &nbsp; 🔴 Off-diagonal = errors</div>
    </div>
  </details>`;

  return `
    <div class="page-header">
      <div class="breadcrumb">NeuroDetect AI / Metrics</div>
      <h2>📊 Model Performance</h2>
      <p>How accurately the AI detects each Alzheimer's stage</p>
    </div>
    <div class="page-body">

      <!-- LIVE SYSTEM STATS -->
      ${stats ? (() => {
        const sd   = stats.stage_distribution || {};
        const ac   = stats.avg_confidence     || {};
        const rd   = stats.recent_by_day      || {};
        const totalSD = Object.values(sd).reduce((a,b) => a+b, 0) || 1;

        const stageColors = {
          'No Impairment':'#22c55e','Non Demented':'#22c55e',
          'Very Mild Impairment':'#eab308','Very Mild Demented':'#eab308',
          'Mild Impairment':'#f97316','Mild Demented':'#f97316',
          'Moderate Impairment':'#ef4444','Moderate Demented':'#ef4444',
        };

        // 7-day chart
        const days = Array.from({length:7}, (_,i) => {
          const d = new Date(); d.setDate(d.getDate() - (6-i));
          return d.toISOString().slice(0,10);
        });
        const dayMax = Math.max(...days.map(d => rd[d] || 0), 1);
        const sparkline = days.map(d => {
          const cnt = rd[d] || 0;
          const h = Math.max(4, Math.round((cnt / dayMax) * 48));
          const label = new Date(d).toLocaleDateString('en-IN', {weekday:'short'});
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
            <div style="font-size:11px;color:var(--text-muted);font-weight:${cnt>0?'600':'400'};color:${cnt>0?'var(--text)':'var(--text-muted)'}">${cnt||''}</div>
            <div style="width:100%;display:flex;align-items:flex-end;height:48px">
              <div style="width:100%;height:${h}px;background:${cnt>0?'#6366f1':'var(--surface)'};border-radius:4px 4px 0 0;transition:height 0.5s ease"></div>
            </div>
            <div style="font-size:10px;color:var(--text-muted)">${label}</div>
          </div>`;
        }).join('');

        return `
        <!-- Headline numbers -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">
          ${[
            {label:'Registered Patients', val:stats.total_patients,  icon:'👥', color:'#6366f1'},
            {label:'Total MRI Scans',     val:stats.total_scans,     icon:'🖼️',  color:'#22c55e'},
            {label:'Patients Scanned',    val:stats.scanned_patients,icon:'✅',  color:'#eab308'},
            {label:'Doctors',             val:stats.total_doctors,   icon:'🩺',  color:'#ec4899'},
          ].map(c => `
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
              <div style="font-size:22px;margin-bottom:6px">${c.icon}</div>
              <div style="font-size:28px;font-weight:800;color:${c.color}">${c.val ?? '—'}</div>
              <div style="font-size:12px;color:var(--text-muted)">${c.label}</div>
            </div>`).join('')}
        </div>

        <!-- Two column: stage dist + 7-day activity -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">

          <!-- Stage distribution -->
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px">
            <div class="section-title" style="margin-bottom:14px">Scans per Stage</div>
            ${Object.keys(sd).length ? Object.entries(sd).map(([stage, count]) => {
              const pct = Math.round((count / totalSD) * 100);
              const col = stageColors[stage] || '#6366f1';
              const avgConf = ac[stage] ? ` · avg ${ac[stage]}% confidence` : '';
              return `
              <div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:10px;height:10px;border-radius:50%;background:${col}"></div>
                    <span style="font-size:13px;font-weight:600;color:var(--text)">${stage.replace(' Impairment','').replace(' Demented','')}</span>
                    <span style="font-size:11px;color:var(--text-muted)">${avgConf}</span>
                  </div>
                  <div style="font-size:13px;font-weight:700;color:${col}">${count} <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(${pct}%)</span></div>
                </div>
                <div style="height:10px;background:var(--surface);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${col};border-radius:99px"></div>
                </div>
              </div>`;
            }).join('') : `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No scans yet.<br/>Upload MRI scans to see distribution.</div>`}
          </div>

          <!-- 7-day activity -->
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px">
            <div class="section-title" style="margin-bottom:14px">Scans — Last 7 Days</div>
            <div style="display:flex;gap:6px;align-items:flex-end;height:80px;padding-bottom:4px">
              ${sparkline}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:10px">
              Total this week: <strong style="color:var(--text)">${days.reduce((s,d)=>s+(rd[d]||0),0)}</strong> scans
            </div>
          </div>
        </div>`;
      })() : ''}

      <!-- TOP: Accuracy Overview -->

      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:24px">
        <div style="text-align:center">${donut}</div>
        <div>
          <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:6px">
            The AI is correct <span style="color:#6366f1">${accuracy}% of the time</span>
          </div>
          <div style="font-size:14px;color:var(--text-muted);max-width:500px;line-height:1.6">
            Out of every 100 MRI scans, the model correctly identifies the Alzheimer's stage in approximately
            <strong style="color:var(--text)">${Math.round(accuracy)}</strong> cases. This is considered
            <strong style="color:#22c55e">${accuracy >= 95 ? 'excellent' : accuracy >= 85 ? 'very good' : 'good'}</strong> performance for a medical AI model.
          </div>
        </div>
        <div style="text-align:center;padding:16px;background:var(--surface);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Avg Score</div>
          <div style="font-size:28px;font-weight:700;color:#22c55e">${avgF1}%</div>
          <div style="font-size:11px;color:var(--text-muted)">Across all stages</div>
        </div>
      </div>

      <!-- What does this mean for you -->
      <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:18px;margin-bottom:24px">
        <div style="font-size:14px;font-weight:700;color:var(--primary-light);margin-bottom:10px">What does this mean for patients?</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
          ${[
            ['🔍','High Detection Rate', 'The model rarely misses a case — early detection is reliable'],
            ['⚡','Fast Results',        'Analysis completes in seconds, no waiting for lab results'],
            ['🩺','Doctor Verified',     'All AI results should be reviewed and confirmed by your doctor'],
          ].map(([icon,title,desc]) => `
            <div style="background:var(--surface2);border-radius:8px;padding:14px">
              <div style="font-size:20px;margin-bottom:6px">${icon}</div>
              <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">${title}</div>
              <div style="font-size:12px;color:var(--text-muted)">${desc}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Per-stage bar charts -->
      <div style="margin-bottom:20px">
        <div class="section-title" style="margin-bottom:16px">Detection Accuracy by Stage</div>
        ${barChart}
      </div>

      <!-- Collapsible confusion matrix for doctors -->
      <div class="card">
        <div class="section-title">Technical Details</div>
        ${cmCompact}
      </div>

    </div>`;
}

// ══════════════════════════════════════
//  BADGE HELPER
// ══════════════════════════════════════
function severityBadge(diagnosis) {
  const map = {
    // New dataset labels (Luke Chugh)
    'No Impairment':       ['low',      'No Impairment'],
    'Very Mild Impairment':['medium',   'Very Mild'],
    'Mild Impairment':     ['high',     'Mild'],
    'Moderate Impairment': ['critical', 'Moderate'],
    // Legacy labels fallback
    'Non Demented':        ['low',      'Non Demented'],
    'Very Mild Demented':  ['medium',   'Very Mild'],
    'Mild Demented':       ['high',     'Mild'],
    'Moderate Demented':   ['critical', 'Moderate'],
  };
  const [sev, label] = map[diagnosis] || ['low', diagnosis];
  return `<span class="badge badge-${sev}">● ${label}</span>`;
}

// ══════════════════════════════════════
//  MAIN RENDER
// ══════════════════════════════════════
async function renderApp() {
  const app = el('app');
  if (!app) return;

  // Not logged in → show auth page
  if (!state.user || !state.token) {
    app.innerHTML = renderAuthPage() + globalUI();
    resetAuthForm();   // ← NOW the DOM exists, safe to call
    return;
  }

  // Render shell: sidebar is position:fixed, main-content has margin-left to compensate
  const isDoctor = state.user.role === 'doctor';
  app.innerHTML = `
    ${renderSidebar()}
    <div class="main-content" id="main-content">
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:16px">
        <div class="spinner-ring"></div>
        <div class="loading-text">Loading...</div>
      </div>
    </div>
    ${globalUI()}`;

  // Render page content
  let html = '';
  try {
    switch(state.page) {
      case 'dashboard':  html = isDoctor ? await renderDoctorDashboard()  : await renderPatientDashboard(); break;
      case 'upload':     html = await renderUploadPage(); break;
      case 'results':    html = renderResultsPage(); break;
      case 'metrics':    html = await renderMetricsPage(); break;
      case 'patients':   html = await renderPatientsPage(); break;
      case 'reports':    html = await renderReportsPage(false); break;
      case 'my-reports': html = await renderReportsPage(true); break;
      default:           html = isDoctor ? await renderDoctorDashboard() : await renderPatientDashboard();
    }
  } catch(e) {
    html = `<div class="page-body"><div class="error-msg">❌ Failed to load page: ${e.message}</div></div>`;
    hideLoading();
  }

  setHTML('main-content', html);
}

function globalUI() {
  return `
    <div id="loading" class="loading-overlay hidden"></div>
    <div id="toasts" class="toast-container"></div>`;
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', renderApp);

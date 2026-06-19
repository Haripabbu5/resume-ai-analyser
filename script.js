/* ============================================================
   ResumeAI v2 - Complete Production Script
   Storage: 100% localStorage (free, no cloud needed)
   Features: Auth, History, PDF upload, 3 analysis modes,
             SVG score rings, Export, Copy, Download
   ============================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────
const K_USERS    = 'resumeai_users';
const K_SESSION  = 'resumeai_session';
const K_HISTORY  = 'resumeai_history';
const GEMINI_KEY = 'AIzaSyCXDv_L3aFcDVKB4sJZLDLo-vb_pNzSjcA';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

let currentMode = 'analyse';
let currentResult = null;
let currentUser = null;

// ─── SIMPLE HASH (security: prevent plain-text password storage) ──
function hashPass(pass) {
  // Simple deterministic hash using btoa + char manipulation (no crypto needed)
  let h = 0;
  for (let i = 0; i < pass.length; i++) { h = (Math.imul(31, h) + pass.charCodeAt(i)) | 0; }
  return btoa('raiHash' + Math.abs(h).toString(36) + pass.length);
}

// ─── AUTH HELPERS ────────────────────────────────────────────
function getUsers() { return JSON.parse(localStorage.getItem(K_USERS) || '[]'); }
function setUsers(u) { localStorage.setItem(K_USERS, JSON.stringify(u)); }
function getSession() { return JSON.parse(localStorage.getItem(K_SESSION) || 'null'); }

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function showTab(tab) {
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('loginTab').classList.toggle('active',  tab === 'login');
  document.getElementById('signupTab').classList.toggle('active', tab === 'signup');
  document.getElementById('loginError').textContent  = '';
  document.getElementById('signupError').textContent = '';
}

function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  const showing = inp.type === 'text';
  inp.type = showing ? 'password' : 'text';
  btn.innerHTML = showing ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function doSignup() {
  const name  = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('signupPassword').value;
  const err   = document.getElementById('signupError');
  err.textContent = '';

  if (!name)              { err.textContent = 'Please enter your full name.'; return; }
  if (!isValidEmail(email)) { err.textContent = 'Please enter a valid email address.'; return; }
  if (pass.length < 6)    { err.textContent = 'Password must be at least 6 characters.'; return; }

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    err.textContent = 'Email already registered. Please login.'; return;
  }
  const newUser = { id: Date.now().toString(), name, email, password: hashPass(pass), createdAt: new Date().toISOString() };
  users.push(newUser);
  setUsers(users);
  localStorage.setItem(K_SESSION, JSON.stringify({ id: newUser.id, name, email }));
  launchApp({ id: newUser.id, name, email });
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  err.textContent = '';

  if (!email || !pass)     { err.textContent = 'Please enter email and password.'; return; }
  if (!isValidEmail(email)) { err.textContent = 'Please enter a valid email address.'; return; }

  const users = getUsers();
  const user  = users.find(u => u.email === email && u.password === hashPass(pass));
  if (!user) {
    // Legacy: check plain-text passwords from old version and migrate
    const legacyUser = users.find(u => u.email === email && u.password === pass);
    if (legacyUser) {
      legacyUser.password = hashPass(pass); // migrate
      setUsers(users);
      localStorage.setItem(K_SESSION, JSON.stringify({ id: legacyUser.id || Date.now().toString(), name: legacyUser.name, email }));
      launchApp({ id: legacyUser.id, name: legacyUser.name, email });
      return;
    }
    err.textContent = 'Invalid email or password. Please try again.'; return;
  }
  localStorage.setItem(K_SESSION, JSON.stringify({ id: user.id, name: user.name, email }));
  launchApp({ id: user.id, name: user.name, email });
}

function doLogout() {
  localStorage.removeItem(K_SESSION);
  currentUser = null;
  currentResult = null;
  document.getElementById('mainApp').style.display   = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  // Clear form fields
  ['loginEmail','loginPassword','signupName','signupEmail','signupPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  showTab('login');
}

function launchApp(user) {
  currentUser = user;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display    = 'block';
  document.getElementById('navUserName').textContent  = user.name.split(' ')[0];
  updateHistoryBadge();
  switchView('analyse');
}

// ─── VIEW SWITCHING ───────────────────────────────────────────
function switchView(view) {
  document.getElementById('analyseView').style.display = view === 'analyse' ? 'block' : 'none';
  document.getElementById('historyView').style.display = view === 'history' ? 'block' : 'none';
  document.getElementById('navAnalyse').classList.toggle('active', view === 'analyse');
  document.getElementById('navHistory').classList.toggle('active', view === 'history');
  if (view === 'history') renderHistory();
}

// ─── PDF EXTRACTION ───────────────────────────────────────────
function dragOver(e)  { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function dragLeave(e) { document.getElementById('dropZone').classList.remove('drag-over'); }
function dropFile(e)  {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') processPDF(f);
  else setDropError('Please drop a PDF file.');
}
function onFileSelect(e) {
  const f = e.target.files[0];
  if (f) processPDF(f);
}

async function processPDF(file) {
  if (file.size > 5 * 1024 * 1024) { setDropError('File too large. Max 5MB.'); return; }
  setDropState('loading', file.name);
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 50) { setDropError('Could not extract text. Please paste manually.'); return; }
    document.getElementById('resumeText').value = cleaned;
    updateCharCount();
    setDropState('done', file.name);
  } catch (e) {
    setDropError('Error reading PDF: ' + e.message);
  }
}

function setDropState(state, name) {
  const zone  = document.getElementById('dropZone');
  const icon  = document.getElementById('dropIcon');
  const text  = document.getElementById('dropText');
  zone.className = 'drop-zone ' + state;
  if (state === 'loading') {
    icon.className = 'fas fa-spinner fa-spin drop-icon';
    text.innerHTML = 'Extracting text from <strong>' + name + '</strong>...';
  } else if (state === 'done') {
    icon.className = 'fas fa-check-circle drop-icon';
    text.innerHTML = '<strong>' + name + '</strong> extracted successfully!';
  }
}
function setDropError(msg) {
  const zone = document.getElementById('dropZone');
  zone.className = 'drop-zone error';
  document.getElementById('dropIcon').className = 'fas fa-exclamation-circle drop-icon';
  document.getElementById('dropText').textContent = msg;
}

function updateCharCount() {
  const len = document.getElementById('resumeText').value.length;
  const el  = document.getElementById('charCount');
  el.textContent = len.toLocaleString() + ' characters';
  el.style.color = len < 100 ? '#ef4444' : len > 5000 ? '#f59e0b' : '#22c55e';
}

// ─── MODE SWITCHING ───────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  ['analyse','jd','tailor'].forEach(m => {
    document.getElementById('btnMode' + m.charAt(0).toUpperCase() + m.slice(1))
      .classList.toggle('active', m === mode);
  });
  document.getElementById('jdSection').style.display     = mode === 'jd'      ? 'block' : 'none';
  document.getElementById('tailorSection').style.display = mode === 'tailor'  ? 'block' : 'none';
  document.getElementById('analyseSection').style.display = mode === 'analyse' ? 'block' : 'none';
  const labels = { analyse: 'Analyse Resume', jd: 'Match vs Job Description', tailor: 'Tailor My Resume' };
  document.getElementById('submitText').textContent = labels[mode];
  document.getElementById('formError').textContent  = '';
  document.getElementById('resultsSection').style.display = 'none';
}

// ─── FORM VALIDATION ─────────────────────────────────────────
function validateForm() {
  const resume = document.getElementById('resumeText').value.trim();
  const err    = document.getElementById('formError');
  err.textContent = '';
  if (!resume) { err.textContent = 'Please paste your resume text or upload a PDF.'; return false; }
  if (resume.length < 100) { err.textContent = 'Resume text is too short (min 100 characters). Please paste the full resume.'; return false; }
  if (currentMode === 'jd') {
    const jd = document.getElementById('jdText').value.trim();
    if (!jd) { err.textContent = 'Please paste the Job Description.'; return false; }
    if (jd.length < 50) { err.textContent = 'Job description is too short. Please paste the full JD.'; return false; }
  }
  if (currentMode === 'tailor') {
    const role = document.getElementById('targetRole').value.trim();
    if (!role) { err.textContent = 'Please enter a target job role (e.g. Project Manager).'; return false; }
  }
  return true;
}

// ─── MAIN SUBMIT ─────────────────────────────────────────────
async function handleSubmit() {
  if (!validateForm()) return;

  const resume = document.getElementById('resumeText').value.trim();
  showLoading(true);
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('savedMsg').style.display = 'none';

  // Animate loading steps
  setTimeout(() => activateLoadingStep(2), 1200);
  setTimeout(() => activateLoadingStep(3), 2800);

  let prompt;
  if (currentMode === 'analyse') {
    const role = document.getElementById('jobRole').value.trim();
    prompt = promptAnalyse(resume, role);
  } else if (currentMode === 'jd') {
    const jd = document.getElementById('jdText').value.trim();
    prompt = promptJD(resume, jd);
  } else {
    const role = document.getElementById('targetRole').value.trim();
    prompt = promptTailor(resume, role);
  }

  try {
    const raw = await callGemini(prompt);
    const result = parseGeminiResponse(raw);
    result.mode = currentMode;
    result.date = new Date().toISOString();
    result.resumeSnippet = resume.substring(0, 120) + '...';
    if (currentMode === 'jd')      result.jdSnippet = document.getElementById('jdText').value.trim().substring(0, 80) + '...';
    if (currentMode === 'tailor')  result.targetRole = document.getElementById('targetRole').value.trim();
    if (currentMode === 'analyse') result.jobRole = document.getElementById('jobRole').value.trim();
    currentResult = result;
    showLoading(false);
    renderResults(result);
  } catch (e) {
    showLoading(false);
    document.getElementById('formError').textContent = 'Error: ' + e.message + '. Please check your resume text and try again.';
  } finally {
    document.getElementById('submitBtn').disabled = false;
  }
}

function activateLoadingStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('lstep' + i);
    if (!el) return;
    if (i < step)  { el.className = 'lstep done';   el.querySelector('i').className = 'fas fa-check-circle'; }
    if (i === step){ el.className = 'lstep active';  el.querySelector('i').className = 'fas fa-circle-notch fa-spin'; }
    if (i > step)  { el.className = 'lstep';         el.querySelector('i').className = 'fas fa-circle'; }
  }
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
  if (show) {
    activateLoadingStep(1);
    const msgs = { analyse: 'Analysing your resume...', jd: 'Matching against Job Description...', tailor: 'Rewriting resume for new role...' };
    document.getElementById('loadingTitle').textContent = msgs[currentMode] || 'Processing...';
  }
}

// ─── GEMINI API ───────────────────────────────────────────────
async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || 'API error ' + res.status;
    if (res.status === 429) throw new Error('Rate limit reached. Please wait 30 seconds and try again.');
    if (res.status === 400) throw new Error('Invalid request. Please check your resume text.');
    throw new Error(msg);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseGeminiResponse(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse AI response. Please try again.');
  try { return JSON.parse(match[0]); }
  catch (e) {
    // Try to fix common JSON issues
    const fixed = match[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return JSON.parse(fixed);
  }
}

// ─── PROMPTS ─────────────────────────────────────────────────
function promptAnalyse(resume, role) {
  return `You are an expert ATS resume analyser and career coach with 15+ years experience. Analyse the resume${role ? ` for the "${role}" role` : ''} and respond ONLY with valid JSON (no markdown, no extra text):
{
  "ats_score": <integer 0-100>,
  "overall_rating": <integer 0-10>,
  "skills_detected": ["up to 12 skills"],
  "strengths": ["4 specific strengths with detail"],
  "weaknesses": ["3 specific weaknesses with detail"],
  "suggestions": ["5 specific, actionable suggestions"],
  "summary": "3 sentence professional summary of resume quality."
}
RESUME:
${resume}`;
}

function promptJD(resume, jd) {
  return `You are an expert ATS specialist and hiring manager. Compare the resume against the job description and respond ONLY with valid JSON:
{
  "ats_score": <integer 0-100>,
  "match_score": <integer 0-100>,
  "overall_rating": <integer 0-10>,
  "skills_detected": ["skills found in resume"],
  "missing_keywords": ["important JD keywords missing from resume"],
  "strengths": ["4 strengths relevant to this JD"],
  "weaknesses": ["3 gaps vs JD requirements"],
  "suggestions": ["5 specific actions to improve JD match"],
  "summary": "3 sentence summary of candidate fit for this specific role."
}
RESUME:
${resume}
JOB DESCRIPTION:
${jd}`;
}

function promptTailor(resume, role) {
  return `You are a professional resume writer. Rewrite the resume for the "${role}" role. Update: summary, skills section, bullet points. Keep the same work history but reframe achievements. Respond ONLY with valid JSON:
{
  "ats_score": <integer 0-100 for the rewritten version>,
  "overall_rating": <integer 0-10>,
  "skills_detected": ["updated skills relevant to ${role}"],
  "strengths": ["3 strengths of tailored resume"],
  "weaknesses": ["2 remaining gaps for this role"],
  "suggestions": ["3 tips to further improve for ${role}"],
  "summary": "2 sentence explanation of how resume was tailored.",
  "tailored_resume": "FULL rewritten resume text with proper formatting (use \\n for line breaks)"
}
ORIGINAL RESUME:
${resume}`;
}

// ─── RESULTS RENDERING ───────────────────────────────────────
function renderResults(r) {
  const section = document.getElementById('resultsSection');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Title & meta
  const titles = {
    analyse: '<i class="fas fa-search"></i> Resume Analysis',
    jd:      '<i class="fas fa-file-alt"></i> JD Match Results',
    tailor:  '<i class="fas fa-magic"></i> Tailored Resume'
  };
  document.getElementById('resultsTitle').innerHTML = titles[r.mode] || 'Results';
  document.getElementById('resultsMeta').textContent =
    new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  // SVG score rings (animated)
  setRing('atsRing',    'atsScoreVal',   r.ats_score || 0,         100, '#6366f1');
  setRing('ratingRing', 'ratingVal',     (r.overall_rating || 0) * 10, 100, '#8b5cf6');

  const matchCard = document.getElementById('matchScoreCard');
  if (r.match_score !== undefined) {
    matchCard.style.display = 'flex';
    setRing('matchRing', 'matchScoreVal', r.match_score, 100, '#0ea5e9');
  } else {
    matchCard.style.display = 'none';
  }

  // Score ring colours based on value
  updateRingColor('atsRing',   'atsScoreVal',   r.ats_score || 0);
  updateRingColor('ratingRing','ratingVal',      (r.overall_rating||0)*10);

  // Summary
  document.getElementById('summaryText').textContent = r.summary || '';

  // Skills
  const sw = document.getElementById('skillsWrap');
  sw.innerHTML = (r.skills_detected || []).map(s => `<span class="tag">${escHtml(s)}</span>`).join('');

  // Strengths & weaknesses
  document.getElementById('strengthsList').innerHTML =
    (r.strengths || []).map(s => `<li><i class="fas fa-check-circle"></i><span>${escHtml(s)}</span></li>`).join('');
  document.getElementById('weaknessesList').innerHTML =
    (r.weaknesses || []).map(w => `<li><i class="fas fa-times-circle"></i><span>${escHtml(w)}</span></li>`).join('');

  // Missing keywords
  const mb = document.getElementById('missingBlock');
  if (r.missing_keywords?.length) {
    mb.style.display = 'block';
    document.getElementById('missingWrap').innerHTML =
      r.missing_keywords.map(k => `<span class="tag missing-tag">${escHtml(k)}</span>`).join('');
  } else { mb.style.display = 'none'; }

  // Suggestions
  document.getElementById('suggestionsList').innerHTML =
    (r.suggestions || []).map((s, i) =>
      `<li><span class="sug-num">${i+1}</span><span>${escHtml(s)}</span></li>`
    ).join('');

  // Tailored resume
  const tb = document.getElementById('tailoredBlock');
  if (r.tailored_resume) {
    tb.style.display = 'block';
    document.getElementById('tailoredText').textContent = r.tailored_resume;
  } else { tb.style.display = 'none'; }
}

function setRing(ringId, valId, value, max, color) {
  const circumference = 314; // 2 * π * 50
  const offset = circumference - (value / max) * circumference;
  const ring = document.getElementById(ringId);
  const val  = document.getElementById(valId);
  if (!ring || !val) return;
  setTimeout(() => {
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = color;
  }, 100);
  val.textContent = ringId === 'ratingRing' ? (value/10).toFixed(1) : value;
}

function updateRingColor(ringId, valId, pct) {
  const color = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  setTimeout(() => {
    const ring = document.getElementById(ringId);
    if (ring) ring.style.stroke = color;
    const val = document.getElementById(valId);
    if (val) val.style.color = color;
  }, 200);
}

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── COPY / DOWNLOAD / EXPORT ────────────────────────────────
function copyTailored() {
  const text = document.getElementById('tailoredText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.btn-copy');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    btn.style.background = '#22c55e';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('Copied!');
  });
}

function downloadTailored() {
  const text = document.getElementById('tailoredText').textContent;
  const role = currentResult?.targetRole || 'role';
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'Resume_Tailored_' + role.replace(/\s+/g,'-') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function printResults() {
  window.print();
}

// ─── HISTORY ────────────────────────────────────────────────
function getAllHistory() {
  return JSON.parse(localStorage.getItem(K_HISTORY) || '{}');
}
function getUserHistory() {
  if (!currentUser) return [];
  const all = getAllHistory();
  return (all[currentUser.id] || []).sort((a,b) => new Date(b.date) - new Date(a.date));
}

function saveToHistory() {
  if (!currentResult || !currentUser) return;
  const all     = getAllHistory();
  const userHist = all[currentUser.id] || [];
  const entry   = { ...currentResult, id: Date.now().toString() };
  userHist.unshift(entry);
  // Keep max 20 per user
  all[currentUser.id] = userHist.slice(0, 20);
  localStorage.setItem(K_HISTORY, JSON.stringify(all));
  updateHistoryBadge();
  document.getElementById('savedMsg').style.display = 'inline-flex';
  setTimeout(() => { document.getElementById('savedMsg').style.display = 'none'; }, 3000);
}

function updateHistoryBadge() {
  const hist  = getUserHistory();
  const badge = document.getElementById('historyBadge');
  if (!badge) return;
  if (hist.length > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent   = hist.length;
  } else {
    badge.style.display = 'none';
  }
}

function renderHistory() {
  const hist  = getUserHistory();
  const list  = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  const clearBtn = document.getElementById('clearHistoryBtn');

  if (hist.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    clearBtn.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  clearBtn.style.display = 'inline-flex';

  const modeIcon  = { analyse: 'fas fa-search', jd: 'fas fa-file-alt', tailor: 'fas fa-magic' };
  const modeLabel = { analyse: 'Analyse', jd: 'JD Match', tailor: 'Tailor' };
  const modeColor = { analyse: '#6366f1', jd: '#0ea5e9', tailor: '#8b5cf6' };

  list.innerHTML = hist.map(h => {
    const date   = new Date(h.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const score  = h.ats_score !== undefined ? h.ats_score : '--';
    const rating = h.overall_rating !== undefined ? h.overall_rating + '/10' : '--';
    const match  = h.match_score !== undefined ? ` | Match: ${h.match_score}%` : '';
    const role   = h.targetRole ? ` → ${h.targetRole}` : (h.jobRole ? ` (${h.jobRole})` : '');
    const color  = modeColor[h.mode] || '#6366f1';
    return `
    <div class="hist-card" onclick="viewHistoryItem('${h.id}')">
      <div class="hist-icon" style="background:${color}20;color:${color}">
        <i class="${modeIcon[h.mode] || 'fas fa-file'}"></i>
      </div>
      <div class="hist-body">
        <div class="hist-title">${modeLabel[h.mode] || h.mode}${role}</div>
        <div class="hist-meta">ATS: ${score}% | Rating: ${rating}${match}</div>
        <div class="hist-summary">${escHtml(h.summary || '').substring(0,100)}...</div>
      </div>
      <div class="hist-right">
        <div class="hist-date">${date}</div>
        <button class="hist-del" onclick="deleteHistoryItem(event,'${h.id}')"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>`;
  }).join('');
}

function viewHistoryItem(id) {
  const hist = getUserHistory();
  const item = hist.find(h => h.id === id);
  if (!item) return;
  currentResult = item;
  currentMode   = item.mode;
  switchView('analyse');
  renderResults(item);
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

function deleteHistoryItem(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this analysis?')) return;
  const all  = getAllHistory();
  all[currentUser.id] = (all[currentUser.id] || []).filter(h => h.id !== id);
  localStorage.setItem(K_HISTORY, JSON.stringify(all));
  updateHistoryBadge();
  renderHistory();
}

function clearHistory() {
  if (!confirm('Clear all your analysis history? This cannot be undone.')) return;
  const all = getAllHistory();
  delete all[currentUser.id];
  localStorage.setItem(K_HISTORY, JSON.stringify(all));
  updateHistoryBadge();
  renderHistory();
}

// ─── RESET ───────────────────────────────────────────────────
function resetForm() {
  document.getElementById('resumeText').value = '';
  document.getElementById('jdText').value     = '';
  document.getElementById('targetRole').value = '';
  document.getElementById('jobRole').value    = '';
  document.getElementById('pdfFile').value    = '';
  document.getElementById('formError').textContent = '';
  document.getElementById('charCount').textContent = '0 characters';
  document.getElementById('charCount').style.color = '';
  const zone = document.getElementById('dropZone');
  zone.className = 'drop-zone';
  document.getElementById('dropIcon').className = 'fas fa-cloud-upload-alt drop-icon';
  document.getElementById('dropText').innerHTML = 'Click to upload or <strong>drag &amp; drop</strong>';
  document.getElementById('resultsSection').style.display = 'none';
  currentResult = null;
  setMode('analyse');
  document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  // Resume textarea char count
  document.getElementById('resumeText')?.addEventListener('input', updateCharCount);

  // Check session
  const session = getSession();
  if (session) {
    currentUser = session;
    // Migrate legacy users who don't have id
    if (!currentUser.id) currentUser.id = currentUser.email;
    launchApp(currentUser);
  }
});

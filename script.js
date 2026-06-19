// ========== AUTH SYSTEM ==========
const USERS_KEY = 'resumeai_users';
const SESSION_KEY = 'resumeai_session';

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function showTab(tab) {
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((el, i) => {
    el.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
}

function doSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const err = document.getElementById('signupError');
  if (!name || !email || !password) { err.textContent = 'All fields are required.'; return; }
  if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  const users = getUsers();
  if (users.find(u => u.email === email)) { err.textContent = 'Email already registered. Please login.'; return; }
  users.push({ name, email, password });
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name, email }));
  startApp(name);
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  if (!email || !password) { err.textContent = 'Please enter email and password.'; return; }
  const users = getUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) { err.textContent = 'Invalid email or password.'; return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email }));
  startApp(user.name);
}

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  resetForm();
}

function startApp(name) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('navUserName').textContent = 'Hi, ' + name.split(' ')[0] + ' 👋';
}

// Check session on load
window.addEventListener('DOMContentLoaded', () => {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    const user = JSON.parse(session);
    startApp(user.name);
  }
  // Set up PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
});

// ========== PDF UPLOAD ==========
async function handlePDFUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('File too large. Max 5MB.'); return; }
  await extractPDF(file);
}

function handleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') extractPDF(file);
  else alert('Please drop a PDF file.');
}

async function extractPDF(file) {
  const label = document.getElementById('uploadLabel');
  label.textContent = 'Extracting text from PDF...';
  document.getElementById('uploadArea').classList.add('uploading');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    document.getElementById('resumeText').value = text.trim();
    label.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e"></i> ' + file.name + ' extracted!';
    document.getElementById('uploadArea').classList.remove('uploading');
    document.getElementById('uploadArea').classList.add('uploaded');
  } catch (e) {
    label.textContent = 'Error reading PDF. Please paste text manually.';
    document.getElementById('uploadArea').classList.remove('uploading');
    console.error(e);
  }
}

// ========== MODE SWITCHING ==========
let currentMode = 'analyse';

function setMode(mode) {
  currentMode = mode;
  document.getElementById('jdSection').style.display = mode === 'jd' ? 'block' : 'none';
  document.getElementById('tailorSection').style.display = mode === 'tailor' ? 'block' : 'none';
  document.getElementById('analyseSection').style.display = mode === 'analyse' ? 'block' : 'none';
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
  const btnText = document.getElementById('btnText');
  if (mode === 'analyse') btnText.textContent = 'Analyse Resume';
  else if (mode === 'jd') btnText.textContent = 'Match vs Job Description';
  else btnText.textContent = 'Tailor My Resume';
  document.getElementById('analyseError').textContent = '';
}

// ========== MAIN SUBMIT ==========
async function handleSubmit() {
  const resumeText = document.getElementById('resumeText').value.trim();
  const err = document.getElementById('analyseError');
  err.textContent = '';
  if (!resumeText) { err.textContent = 'Please paste your resume text or upload a PDF.'; return; }
  if (resumeText.length < 100) { err.textContent = 'Resume text is too short. Please paste the full resume.'; return; }
  if (currentMode === 'jd' && !document.getElementById('jdText').value.trim()) {
    err.textContent = 'Please paste the Job Description.'; return;
  }
  if (currentMode === 'tailor' && !document.getElementById('targetRole').value.trim()) {
    err.textContent = 'Please enter a target job role.'; return;
  }

  const GEMINI_KEY = 'AIzaSyCXDv_L3aFcDVKB4sJZLDLo-vb_pNzSjcA';
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('analyseBtn').disabled = true;
  document.getElementById('results').style.display = 'none';

  let prompt = '';
  if (currentMode === 'analyse') {
    const jobRole = document.getElementById('jobRole').value.trim();
    document.getElementById('loadingText').textContent = 'Analysing your resume with AI...';
    prompt = buildAnalysePrompt(resumeText, jobRole);
  } else if (currentMode === 'jd') {
    const jdText = document.getElementById('jdText').value.trim();
    document.getElementById('loadingText').textContent = 'Matching your resume against the Job Description...';
    prompt = buildJDPrompt(resumeText, jdText);
  } else {
    const targetRole = document.getElementById('targetRole').value.trim();
    document.getElementById('loadingText').textContent = 'Rewriting your resume for ' + targetRole + '...';
    prompt = buildTailorPrompt(resumeText, targetRole);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    );
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || 'API request failed.');
    }
    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response.');
    const result = JSON.parse(jsonMatch[0]);
    displayResults(result);
  } catch (e) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('analyseBtn').disabled = false;
    err.textContent = 'Error: ' + e.message;
  }
}

// ========== PROMPTS ==========
function buildAnalysePrompt(resume, jobRole) {
  return `You are an expert resume analyser and career coach. Analyse the following resume${jobRole ? ` for the role of "${jobRole}"` : ''} and respond ONLY with valid JSON in this exact format:
{
  "mode": "analyse",
  "ats_score": <number 0-100>,
  "overall_rating": <number 0-10>,
  "skills_detected": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"],
  "summary": "A 2-3 sentence overall summary."
}
RESUME:
${resume}`;
}

function buildJDPrompt(resume, jd) {
  return `You are an expert ATS and hiring specialist. Compare the resume against the job description and respond ONLY with valid JSON:
{
  "mode": "jd",
  "ats_score": <number 0-100>,
  "match_score": <number 0-100>,
  "overall_rating": <number 0-10>,
  "skills_detected": ["skill1", "skill2"],
  "missing_keywords": ["keyword1", "keyword2"],
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"],
  "summary": "A 2-3 sentence summary of fit for this role."
}
RESUME:
${resume}
JOB DESCRIPTION:
${jd}`;
}

function buildTailorPrompt(resume, targetRole) {
  return `You are an expert resume writer and career coach. Rewrite and tailor the following resume for the target role of "${targetRole}". Rewrite the summary, skills, and bullet points to align with what a hiring manager for this role would want to see. Then respond ONLY with valid JSON:
{
  "mode": "tailor",
  "ats_score": <number 0-100 for the tailored version>,
  "overall_rating": <number 0-10>,
  "skills_detected": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "summary": "A 2-3 sentence summary of how the resume was tailored.",
  "tailored_resume": "The full rewritten resume text here, properly formatted with newlines"
}
ORIGINAL RESUME:
${resume}`;
}

// ========== DISPLAY RESULTS ==========
function displayResults(r) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('analyseBtn').disabled = false;
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

  // Scores
  const atsScore = r.ats_score || 0;
  document.getElementById('atsScore').textContent = atsScore;
  const atsCircle = document.getElementById('atsScoreCircle');
  atsCircle.style.background = `conic-gradient(${scoreColor(atsScore)} ${atsScore * 3.6}deg, #e2e8f0 0deg)`;

  document.getElementById('overallRating').textContent = r.overall_rating || '--';

  // Match score (JD mode)
  const matchCard = document.getElementById('matchScoreCard');
  if (r.match_score !== undefined) {
    matchCard.style.display = 'flex';
    document.getElementById('matchScore').textContent = r.match_score;
    document.getElementById('matchScoreCircle').style.background = `conic-gradient(${scoreColor(r.match_score)} ${r.match_score * 3.6}deg, #e2e8f0 0deg)`;
  } else {
    matchCard.style.display = 'none';
  }

  // Title
  const titles = { analyse: 'Analysis Results', jd: 'JD Match Results', tailor: 'Tailored Resume Results' };
  document.getElementById('resultsTitle').textContent = titles[r.mode] || 'Results';

  document.getElementById('summaryText').textContent = r.summary || '';

  // Skills
  const skillsEl = document.getElementById('skillsList');
  skillsEl.innerHTML = (r.skills_detected || []).map(s => `<span class="skill-tag">${s}</span>`).join('');

  // Strengths
  document.getElementById('strengthsList').innerHTML = (r.strengths || []).map(s => `<li><i class="fas fa-check-circle"></i> ${s}</li>`).join('');

  // Weaknesses
  document.getElementById('weaknessesList').innerHTML = (r.weaknesses || []).map(w => `<li><i class="fas fa-times-circle"></i> ${w}</li>`).join('');

  // Missing keywords
  const mkBlock = document.getElementById('missingKeywordsBlock');
  if (r.missing_keywords && r.missing_keywords.length > 0) {
    mkBlock.style.display = 'block';
    document.getElementById('missingKeywordsList').innerHTML = r.missing_keywords.map(k => `<span class="skill-tag missing">${k}</span>`).join('');
  } else {
    mkBlock.style.display = 'none';
  }

  // Suggestions
  document.getElementById('suggestionsList').innerHTML = (r.suggestions || []).map((s, i) => `<li><span class="suggest-num">${i+1}</span> ${s}</li>`).join('');

  // Tailored resume
  const tailorBlock = document.getElementById('tailoredResumeBlock');
  if (r.tailored_resume) {
    tailorBlock.style.display = 'block';
    document.getElementById('tailoredResumeText').textContent = r.tailored_resume;
  } else {
    tailorBlock.style.display = 'none';
  }
}

function scoreColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function copyTailored() {
  const text = document.getElementById('tailoredResumeText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy Tailored Resume'; }, 2000);
  });
}

function resetForm() {
  document.getElementById('resumeText').value = '';
  document.getElementById('jdText') && (document.getElementById('jdText').value = '');
  document.getElementById('targetRole') && (document.getElementById('targetRole').value = '');
  document.getElementById('jobRole') && (document.getElementById('jobRole').value = '');
  document.getElementById('pdfInput').value = '';
  document.getElementById('uploadLabel').innerHTML = 'Click to upload PDF <span>or drag & drop</span>';
  document.getElementById('uploadArea').classList.remove('uploaded', 'uploading');
  document.getElementById('results').style.display = 'none';
  document.getElementById('analyseError').textContent = '';
  setMode('analyse');
  document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

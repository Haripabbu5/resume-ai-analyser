function toggleKey() {
  const input = document.getElementById('apiKey');
  const btn = document.getElementById('toggleBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function analyseResume() {
  const resumeText = document.getElementById('resumeText').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const jobRole = document.getElementById('jobRole').value.trim();

  if (!resumeText) { alert('Please paste your resume text first.'); return; }
  if (!apiKey) { alert('Please enter your Gemini API key.'); return; }
  if (resumeText.length < 100) { alert('Resume text is too short. Please paste the full resume.'); return; }

  document.getElementById('loading').style.display = 'flex';
  document.getElementById('analyseBtn').disabled = true;
  document.getElementById('results').style.display = 'none';

  const prompt = `You are an expert resume analyser and career coach. Analyse the following resume${jobRole ? ` for the role of "${jobRole}"` : ''} and provide a structured JSON response.

RESUME TEXT:
${resumeText}

Respond ONLY with valid JSON in this exact format:
{
  "ats_score": <number 0-100>,
  "overall_rating": <number 0-10>,
  "skills_detected": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2", "strength3", "strength4"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"],
  "summary": "A 2-3 sentence overall summary of the resume quality and fit."
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'API request failed. Please check your API key.');
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response. Please try again.');

    const result = JSON.parse(jsonMatch[0]);
    displayResults(result);

  } catch (error) {
    alert('Error: ' + error.message + '\n\nTips:\n- Make sure your API key starts with AIzaSy\n- Check your internet connection\n- Try again in a few seconds');
    console.error(error);
  } finally {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('analyseBtn').disabled = false;
  }
}

function displayResults(data) {
  document.getElementById('atsScore').textContent = data.ats_score || '--';
  document.getElementById('overallScore').textContent = (data.overall_rating || '--') + '/10';
  document.getElementById('skillsCount').textContent = (data.skills_detected || []).length;

  const atsBox = document.getElementById('atsScoreBox');
  const score = data.ats_score;
  if (score >= 75) atsBox.style.borderColor = '#10b981';
  else if (score >= 50) atsBox.style.borderColor = '#f59e0b';
  else atsBox.style.borderColor = '#ef4444';

  document.getElementById('strengthsList').innerHTML = (data.strengths || []).map(s => `<div class="item">${s}</div>`).join('');
  document.getElementById('weaknessesList').innerHTML = (data.weaknesses || []).map(w => `<div class="item">${w}</div>`).join('');
  document.getElementById('skillsList').innerHTML = (data.skills_detected || []).map(s => `<span class="skill-tag">${s}</span>`).join('');
  document.getElementById('suggestionsList').innerHTML = (data.suggestions || []).map(s => `<div class="item">${s}</div>`).join('');
  document.getElementById('summaryText').textContent = data.summary || '';

  const resultsSection = document.getElementById('results');
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function analyseAgain() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('resumeText').value = '';
  document.getElementById('jobRole').value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

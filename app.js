/* ═══════════════════════════════════════════════════════════════
   DrawScan v5.2 — Indicator + Form Model
   383-match recalibration: BTTS/U25/DrawOdds thresholds updated,
   away streak=1 and both wins≤2 removed, prob bands recalibrated.
═══════════════════════════════════════════════════════════════ */

/* ─── State ───────────────────────────────────────────────── */
const formState = { A: ['?','?','?','?','?'], B: ['?','?','?','?','?'] };
const formCycle = { '?': 'W', 'W': 'D', 'D': 'L', 'L': 'W' };

/* ─── Form sequence toggle ────────────────────────────────── */
function cycleForm(btn, team) {
  const cur = btn.getAttribute('data-val') || '?';
  const next = formCycle[cur] || 'W';
  const idx = Array.from(btn.parentElement.children).indexOf(btn);
  formState[team][idx] = next;
  btn.setAttribute('data-val', next);
  btn.textContent = next;
}

/* ─── Live name sync ──────────────────────────────────────── */
document.getElementById('teamA').addEventListener('input', function () {
  document.getElementById('lbl-teamA').textContent = this.value.trim() || 'Home Team';
});
document.getElementById('teamB').addEventListener('input', function () {
  document.getElementById('lbl-teamB').textContent = this.value.trim() || 'Away Team';
});

/* ─── Helpers ─────────────────────────────────────────────── */
function val(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = el.value;
  if (v === '' || v === null) return null;
  return parseFloat(v);
}
function str(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/* ─── Form helpers ────────────────────────────────────────── */
function getForm(team) {
  // Only return set values (not '?')
  return formState[team].filter(r => r !== '?');
}

function countInForm(team, result) {
  return formState[team].filter(r => r === result).length;
}

function hasAllSet(team) {
  return formState[team].every(r => r !== '?');
}

function getWinStreak(team) {
  // Consecutive W from the front (most recent)
  let streak = 0;
  for (const r of formState[team]) {
    if (r === 'W') streak++;
    else break;
  }
  return streak;
}

function isAlternating(team) {
  const f = formState[team].filter(r => r !== '?');
  if (f.length < 4) return false;
  for (let i = 0; i < f.length - 1; i++) {
    if (f[i] === f[i + 1]) return false;
  }
  return true;
}

/* ─── Gauge animation ─────────────────────────────────────── */
function animateGauge(prob, tier) {
  const path = document.getElementById('gauge-fill');
  const text = document.getElementById('gauge-pct-text');
  const arcLen = Math.PI * 60;
  const fill = (prob / 100) * arcLen;
  path.setAttribute('stroke-dasharray', `${fill.toFixed(2)} ${arcLen.toFixed(2)}`);
  path.className = `gauge-fill tier-${tier}`;

  let current = 0;
  const duration = 750;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    current = Math.round(eased * prob);
    text.textContent = current + '%';
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ─── Indicator row builder ───────────────────────────────── */
function indRow(label, detail, pass, badgeType, badgeText) {
  const dotClass = pass ? 'dot-pass' : 'dot-fail';
  const labelClass = pass ? 'ind-pass' : 'ind-fail';
  const rowExtra = badgeType === 'sub' ? ' penalty' : badgeType === 'bonus' ? ' bonus' : '';
  return `
    <div class="ind-item${rowExtra}">
      <div class="ind-left">
        <span class="ind-num"></span>
        <div class="ind-dot ${dotClass}"></div>
        <div>
          <div class="ind-label ${labelClass}">${label}</div>
          ${detail ? `<div style="font-family:var(--mono);font-size:10px;color:var(--t4);margin-top:1px">${detail}</div>` : ''}
        </div>
      </div>
      ${badgeText ? `<span class="ind-badge badge-${badgeType}">${badgeText}</span>` : `<span class="ind-status ${pass ? 'status-pass' : 'status-fail'}">${pass ? 'Met' : 'Not met'}</span>`}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN ANALYSIS
═══════════════════════════════════════════════════════════ */
function analyze() {
  const filterEl  = document.getElementById('filter-fail');
  const filterMsg = document.getElementById('filter-reasons');
  const resultEl  = document.getElementById('result-card');

  filterEl.style.display = 'none';
  resultEl.style.display = 'none';

  /* ── Collect inputs ───────────────────────────────────── */
  const posA = val('posA'), posB = val('posB');
  const gdA  = val('gdA'),  gdB  = val('gdB');
  const gsA  = val('gsA'),  gsB  = val('gsB');
  const gcA  = val('gcA'),  gcB  = val('gcB');
  const drawRate  = val('drawRate');
  const oddsHome  = val('oddsHome'), oddsDraw = val('oddsDraw'), oddsAway = val('oddsAway');
  const bttsy = val('bttsy'), bttsn = val('bttsn'), under25 = val('under25');

  const tA = str('teamA') || 'Home Team';
  const tB = str('teamB') || 'Away Team';
  const leagueSel   = document.getElementById('league');
  const leagueTier  = leagueSel.value;
  const leagueLabel = leagueSel.options[leagueSel.selectedIndex]?.text || '';

  const formA = formState.A;
  const formB = formState.B;
  const formASet = getForm('A');
  const formBSet = getForm('B');

  const wsA = getWinStreak('A');
  const wsB = getWinStreak('B');

  /* ── HARD FILTERS ─────────────────────────────────────── */
  const fails = [];

  // Table distance hard filter
  if (posA !== null && posB !== null) {
    const dist = Math.abs(posA - posB);
    if (dist > 12) fails.push(`Table distance (${dist}) exceeds max of 12`);
  }

  // Goal difference gap between teams ≤ 11
  if (gdA !== null && gdB !== null) {
    const gdGap = Math.abs(gdA - gdB);
    if (gdGap > 15)
      fails.push(`Goal difference gap between teams (${gdGap}) exceeds max of 15`);
  }

  // Winning streak — block if 3 or more consecutive wins
  if (formASet.length >= 3 && wsA >= 3)
    fails.push(`${tA} has ${wsA} consecutive wins — strong momentum reduces draw likelihood`);
  if (formBSet.length >= 3 && wsB >= 3)
    fails.push(`${tB} has ${wsB} consecutive wins — strong momentum reduces draw likelihood`);

  // Combined goals — calculated for indicators & soft penalty
  const cgs = (gsA !== null && gsB !== null) ? +(gsA + gsB).toFixed(2) : null;
  const cgc = (gcA !== null && gcB !== null) ? +(gcA + gcB).toFixed(2) : null;

  if (fails.length > 0) {
    filterMsg.innerHTML = fails.map(f => `<span>— ${f}</span>`).join('');
    filterEl.style.display = 'block';
    filterEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  /* ── BASE INDICATORS (7) ──────────────────────────────── */
  const baseIndicators = [
    {
      label: 'Similar goal difference',
      detail: 'GD gap ≤ 8',
      pass: gdA !== null && gdB !== null && Math.abs(gdA - gdB) <= 8
    },
    {
      label: 'Draw odds in signal range',
      detail: '2.50–2.90  (383-match validated)',
      pass: oddsDraw !== null && oddsDraw >= 2.50 && oddsDraw <= 2.90
    },
    {
      label: 'Balanced team odds',
      detail: 'Home 2.50–3.00 · Away 2.50–3.10',
      pass: oddsHome !== null && oddsAway !== null &&
            oddsHome >= 2.50 && oddsHome <= 3.00 &&
            oddsAway >= 2.50 && oddsAway <= 3.10
    },
    {
      label: 'Under 2.5 market signal',
      detail: 'Odds ≤ 1.40  (data-calibrated, 383-match validated)',
      pass: under25 !== null && under25 <= 1.40
    },
    {
      label: 'BTTS market signal',
      detail: 'Yes 1.80–1.95  or  No 1.40–1.60',
      pass: (bttsy !== null && bttsy >= 1.80 && bttsy <= 1.95) ||
            (bttsn !== null && bttsn >= 1.40 && bttsn <= 1.60)
    },
    {
      label: 'League draw rate ≥ 29%',
      detail: 'Historical draw rate signal',
      pass: drawRate !== null && drawRate >= 29
    }
  ];

  const baseScore = baseIndicators.filter(i => i.pass).length;

  /* ── FORM PATTERN ENGINE ──────────────────────────────── */
  const formPatterns = [];
  let formDelta = 0;
  const formAvailable = formASet.length > 0 && formBSet.length > 0;

  if (formAvailable) {
    const wA = countInForm('A','W'), dA = countInForm('A','D'), lA = countInForm('A','L');
    const wB = countInForm('B','W'), dB = countInForm('B','D'), lB = countInForm('B','L');
    const mixedA = wA > 0 && dA > 0 && lA > 0;
    const mixedB = wB > 0 && dB > 0 && lB > 0;

    // Mixed form vs mixed form (+1)
    const p1 = mixedA && mixedB;
    formPatterns.push({ label: 'Mixed form vs mixed form', detail: 'Both teams show W, D & L', delta: 1, triggered: p1 });
    if (p1) formDelta += 1;

    // Streak control (+1)
    const p2 = wsA < 3 && wsB < 3;
    formPatterns.push({ label: 'Streak control', detail: 'Both teams fewer than 3 consecutive wins', delta: 1, triggered: p2 });
    if (p2) formDelta += 1;

    // P3: Both drew in last 2 (+1) — stable +6.5% lift across 3 datasets
    // (Away streak=1 removed — negative in 3/3 datasets)
    // (Both wins≤2 removed — negative in 2/2 datasets)
    const recentDrawA = formState.A.slice(0,2).filter(r => r === 'D').length >= 1;
    const recentDrawB = formState.B.slice(0,2).filter(r => r === 'D').length >= 1;
    const p3 = recentDrawA && recentDrawB;
    formPatterns.push({ label: 'Both drew in last 2 matches', detail: 'Recent draw form for both sides', delta: 1, triggered: p3 });
    if (p3) formDelta += 1;


    // Penalty: 5 straight wins (−2)
    const fiveWinA = formState.A.every(r => r === 'W');
    const fiveWinB = formState.B.every(r => r === 'W');
    if (fiveWinA || fiveWinB) {
      const who = fiveWinA && fiveWinB ? 'Both teams' : fiveWinA ? tA : tB;
      formPatterns.push({ label: `${who}: 5 straight wins`, detail: 'Strong momentum — draw unlikely', delta: -2, triggered: true, isPenalty: true });
      formDelta -= 2;
    }

    // Penalty: strong vs weak mismatch (−2)
    const strongWeak = (wA >= 4 && lB >= 4) || (wB >= 4 && lA >= 4);
    if (strongWeak) {
      formPatterns.push({ label: 'Strong vs weak form mismatch', detail: 'One team 4–5W vs other 4–5L', delta: -2, triggered: true, isPenalty: true });
      formDelta -= 2;
    }
  }

  // Soft penalty: CGC > 2.4 (runs regardless of form)
  if (cgc !== null && cgc > 2.4) {
    formPatterns.push({ label: 'High combined goals conceded', detail: `CGC ${cgc.toFixed(2)} > 2.4 — weak defensive environment`, delta: -1, triggered: true, isPenalty: true });
    formDelta -= 1;
  }

  /* ── TOTAL SCORE ──────────────────────────────────────── */
  const totalScore = Math.max(0, baseScore + formDelta);

  /* ── PROBABILITY BANDS — recalibrated from 383-match dataset ── */
  // Actual: score≤3=~7%, 4-5=~44%, 6-7=~52%, 8-9=~54%, 10+=~55%
  let prob, tier;
  if (totalScore <= 3)       { prob = 15;  tier = 'low'; }
  else if (totalScore <= 5)  { prob = 42;  tier = 'medium'; }
  else if (totalScore <= 7)  { prob = 50;  tier = 'medium'; }
  else if (totalScore <= 9)  { prob = 55;  tier = 'high'; }
  else                       { prob = 60;  tier = 'high'; }

  /* ── LEAGUE WEIGHTING (add % directly) ───────────────── */
  const leagueBoost = { high: 8, african: 6, medium: 5, youth: 0, other: 0, '': 0 };
  const boost = leagueBoost[leagueTier] || 0;
  prob = Math.min(95, prob + boost);

  if (prob >= 55) tier = 'high';
  else if (prob >= 38) tier = 'medium';
  else tier = 'low';

  /* ── RENDER ───────────────────────────────────────────── */
  document.getElementById('res-match').textContent = `${tA} vs ${tB}`;
  const tierLabels = { high: 'High Draw League +8%', african: 'African Draw League +6%', medium: 'Medium Draw League +5%', youth: 'Youth Competition', other: '' };
  document.getElementById('res-league-tag').textContent =
    leagueLabel ? leagueLabel + (tierLabels[leagueTier] ? '  ·  ' + tierLabels[leagueTier] : '') : 'League not specified';

  document.getElementById('kpi-ind').textContent  = totalScore;
  document.getElementById('kpi-base').textContent = baseScore;
  document.getElementById('kpi-form').textContent = formDelta >= 0 ? '+' + formDelta : String(formDelta);
  document.getElementById('kpi-cgs').textContent  = cgs !== null ? cgs.toFixed(2) : '—';
  document.getElementById('kpi-cgc').textContent  = cgc !== null ? cgc.toFixed(2) : '—';

  // Base indicators
  document.getElementById('ind-list').innerHTML = baseIndicators.map(ind =>
    indRow(ind.label, ind.detail, ind.pass, ind.pass ? 'add' : 'skip', ind.pass ? '+1' : '—')
  ).join('');

  // Form patterns
  if (formAvailable && formPatterns.length > 0) {
    document.getElementById('form-list').innerHTML = formPatterns.map(p => {
      const badgeType = p.isPenalty ? 'sub' : p.triggered ? 'add' : 'skip';
      const badgeText = p.triggered ? (p.delta > 0 ? `+${p.delta}` : String(p.delta)) : '—';
      return indRow(p.label, p.detail, p.triggered && !p.isPenalty, badgeType, badgeText);
    }).join('');
  } else {
    document.getElementById('form-list').innerHTML = `
      <div style="font-family:var(--mono);font-size:12px;color:var(--t4);padding:12px 0;">
        — Enter last 5 results for both teams to activate form pattern analysis
      </div>`;
  }

  // League boost
  const boostSection = document.getElementById('league-boost-section');
  const boostList    = document.getElementById('league-boost-list');
  if (boost > 0) {
    boostSection.style.display = 'block';
    boostList.innerHTML = `
      <div class="league-boost-row">
        <div class="boost-dot"></div>
        <span>${leagueLabel} · historically high draw rate</span>
        <span class="ind-badge badge-bonus" style="margin-left:auto">+${boost}%</span>
      </div>`;
  } else {
    boostSection.style.display = 'none';
  }

  resultEl.style.display = 'block';

  // Reset + animate gauge
  const gp = document.getElementById('gauge-fill');
  gp.setAttribute('stroke-dasharray', '0 189');
  document.getElementById('gauge-pct-text').textContent = '0%';

  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => animateGauge(prob, tier), 200);

  // Save to history
  saveToHistory({
    id: Date.now(),
    date: new Date().toISOString(),
    teamA: tA, teamB: tB,
    league: leagueLabel || 'Unknown league',
    leagueTier, prob, tier,
    totalScore, baseScore, formDelta,
    // Raw inputs
    posA, posB, gdA, gdB, gsA, gsB, gcA, gcB,
    drawRate,
    oddsHome, oddsDraw, oddsAway,
    bttsy, bttsn, under25,
    cgs: cgs !== null ? +cgs.toFixed(2) : null,
    cgc: cgc !== null ? +cgc.toFixed(2) : null,
    formA: [...formState.A],
    formB: [...formState.B],
    // Base indicator pass/fail (1/0 for ML)
    ind_gdGap:          baseIndicators[0].pass ? 1 : 0,
    ind_drawOdds:       baseIndicators[1].pass ? 1 : 0,
    ind_balancedOdds:   baseIndicators[2].pass ? 1 : 0,
    ind_under25:        baseIndicators[3].pass ? 1 : 0,
    ind_btts:           baseIndicators[4].pass ? 1 : 0,
    ind_leagueDrawRate: baseIndicators[5].pass ? 1 : 0,
    // Form pattern pass/fail (1/0 for ML)
    fp_mixedForm:       formAvailable ? (formPatterns.find(p=>p.label==='Mixed form vs mixed form')?.triggered ? 1 : 0) : null,
    fp_streakControl:   formAvailable ? (formPatterns.find(p=>p.label==='Streak control')?.triggered ? 1 : 0) : null,
    fp_bothRecentDraw:  formAvailable ? (formPatterns.find(p=>p.label==='Both drew in last 2 matches')?.triggered ? 1 : 0) : null,
    neg_strongVsWeak:   formAvailable ? (formPatterns.find(p=>p.label==='Strong vs weak form mismatch')?.triggered ? 1 : 0) : null,
    outcome: null
  });
}

/* ─── Reset ───────────────────────────────────────────────── */
function resetForm() {
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('filter-fail').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════
   HISTORY ENGINE
═══════════════════════════════════════════════════════════ */

const HISTORY_KEY = 'drawscan_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > 100) history.pop();
  saveHistory(history);
  renderHistory();
}

function setOutcome(id, outcome) {
  const history = loadHistory();
  const entry = history.find(h => h.id === id);
  if (entry) {
    entry.outcome = entry.outcome === outcome ? null : outcome;
    saveHistory(history);
    renderHistory();
  }
}

function deleteEntry(id) {
  const history = loadHistory().filter(h => h.id !== id);
  saveHistory(history);
  renderHistory();
}

function clearHistory() {
  if (!confirm('Clear all history? This cannot be undone.')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + '  ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function tierColor(tier) {
  return tier === 'high' ? 'var(--green)' : tier === 'medium' ? 'var(--amber)' : 'var(--red)';
}

function formPills(form) {
  return form.map(r => {
    const col = r === 'W' ? 'var(--green)' : r === 'D' ? 'var(--gold)' : r === 'L' ? 'var(--red)' : 'var(--t4)';
    const bg  = r === 'W' ? 'rgba(78,203,141,0.1)' : r === 'D' ? 'rgba(232,184,75,0.1)' : r === 'L' ? 'rgba(240,96,90,0.1)' : 'transparent';
    return `<span style="font-family:var(--mono);font-size:10px;color:${col};background:${bg};border:1px solid ${col}33;border-radius:4px;padding:1px 5px;">${r}</span>`;
  }).join('');
}

function outcomeButtons(entry) {
  const outcomes = [
    { val: 'draw', label: 'Draw', color: 'var(--gold)' },
    { val: 'home', label: 'Home', color: 'var(--blue)' },
    { val: 'away', label: 'Away', color: 'var(--t2)'   },
  ];
  return outcomes.map(o => {
    const active = entry.outcome === o.val;
    const bg   = active ? o.color : 'transparent';
    const col  = active ? 'var(--ink)' : 'var(--t4)';
    const bord = active ? o.color : 'var(--rim-2)';
    return `<button onclick="setOutcome(${entry.id},'${o.val}')"
      style="font-family:var(--mono);font-size:9px;letter-spacing:.06em;padding:3px 8px;border-radius:4px;border:1px solid ${bord};background:${bg};color:${col};cursor:pointer;">${o.label}</button>`;
  }).join('');
}

function renderHistory() {
  const container = document.getElementById('history-panel');
  if (!container) return;
  const history = loadHistory();

  if (history.length === 0) {
    container.innerHTML = `<div class="history-empty">No analyses saved yet. Run your first analysis above.</div>`;
    return;
  }

  const total    = history.length;
  const resolved = history.filter(h => h.outcome !== null);
  const correct  = resolved.filter(h => h.outcome === 'draw');
  const accuracy = resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : null;
  const avgProb  = Math.round(history.reduce((s, h) => s + h.prob, 0) / total);

  container.innerHTML = `
    <div class="history-header">
      <div class="history-stats-row">
        <div class="hst"><span class="hst-n">${total}</span><span class="hst-l">Analyses</span></div>
        <div class="hst-sep"></div>
        <div class="hst"><span class="hst-n">${avgProb}%</span><span class="hst-l">Avg probability</span></div>
        <div class="hst-sep"></div>
        <div class="hst"><span class="hst-n">${resolved.length}</span><span class="hst-l">Outcomes logged</span></div>
        <div class="hst-sep"></div>
        <div class="hst"><span class="hst-n" style="color:${accuracy !== null ? 'var(--green)' : 'var(--t3)'}">${accuracy !== null ? accuracy + '%' : '—'}</span><span class="hst-l">Draw accuracy</span></div>
      </div>
      <button class="clear-btn" onclick="clearHistory()">Clear all</button>
    </div>
    <div class="history-list">
      ${history.map(entry => `
        <div class="history-row ${entry.outcome === 'draw' ? 'row-correct' : entry.outcome ? 'row-wrong' : ''}">
          <div class="hr-left">
            <div class="hr-prob" style="color:${tierColor(entry.tier)}">${entry.prob}%</div>
            <div class="hr-main">
              <div class="hr-match">${entry.teamA} <span style="color:var(--t4)">vs</span> ${entry.teamB}</div>
              <div class="hr-meta">
                <span>${entry.league}</span>
                <span class="hr-dot">·</span>
                <span>${formatDate(entry.date)}</span>
                <span class="hr-dot">·</span>
                <span style="color:var(--t3)">${entry.totalScore} indicators</span>
              </div>
              ${(entry.formA.some(r=>r!=='?') || entry.formB.some(r=>r!=='?')) ? `
              <div class="hr-form">
                <span class="hr-form-team">${entry.teamA.split(' ')[0]}</span>
                ${formPills(entry.formA)}
                <span class="hr-form-sep">·</span>
                <span class="hr-form-team">${entry.teamB.split(' ')[0]}</span>
                ${formPills(entry.formB)}
              </div>` : ''}
            </div>
          </div>
          <div class="hr-right">
            <div class="hr-outcome-label">Actual result</div>
            <div class="hr-outcome-btns">${outcomeButtons(entry)}</div>
            <button class="hr-delete" onclick="deleteEntry(${entry.id})" title="Remove">✕</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

document.addEventListener('DOMContentLoaded', renderHistory);

/* ═══════════════════════════════════════════════════════════
   EXCEL EXPORT  (uses SheetJS / xlsx)
═══════════════════════════════════════════════════════════ */

function n(v) { return v !== null && v !== undefined ? v : ''; }

function exportToExcel() {
  const history = loadHistory();
  if (history.length === 0) { alert('No analyses to export yet.'); return; }
  const XLSX = window.XLSX;
  if (!XLSX) { alert('Export library not loaded. Check your internet connection.'); return; }

  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: All Analyses ─────────────────────────────── */
  const ws1 = XLSX.utils.json_to_sheet(history.map((h, i) => ({
    '#':                  i + 1,
    'Date':               new Date(h.date).toLocaleString('en-GB'),
    'Home Team':          h.teamA,
    'Away Team':          h.teamB,
    'League':             h.league,
    'Draw Probability %': h.prob,
    'Confidence Tier':    h.tier.charAt(0).toUpperCase() + h.tier.slice(1),
    'Total Indicators':   h.totalScore,
    'Base Indicators':    h.baseScore,
    'Form Delta':         n(h.formDelta),
    'CGS':                n(h.cgs),
    'CGC':                n(h.cgc),
    'Form A':             h.formA.join(' '),
    'Form B':             h.formB.join(' '),
    'Actual Outcome':     h.outcome ? h.outcome.charAt(0).toUpperCase() + h.outcome.slice(1) : 'Pending',
    'Prediction Correct': h.outcome === null ? 'Pending' : h.outcome === 'draw' ? 'Yes' : 'No',
  })));
  ws1['!cols'] = [
    {wch:4},{wch:18},{wch:20},{wch:20},{wch:28},{wch:20},{wch:16},
    {wch:16},{wch:14},{wch:12},{wch:8},{wch:8},{wch:14},{wch:14},{wch:16},{wch:18}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'All Analyses');

  /* ── Sheet 2: ML Training Data ─────────────────────────── */
  // Recalculate indicator flags from raw inputs for legacy entries
  // that were saved before indicator flags were added to history
  function recomputeInds(h) {
    const gdA = h.gdA, gdB = h.gdB, cgc = h.cgc;
    return {
      ind_gdGap:         (gdA != null && gdB != null) ? (Math.abs(gdA-gdB) <= 8 ? 1 : 0) : '',
      ind_drawOdds:      h.oddsDraw != null ? (h.oddsDraw >= 2.50 && h.oddsDraw <= 2.90 ? 1 : 0) : '',
      ind_balancedOdds:  (h.oddsHome != null && h.oddsAway != null)
                           ? (h.oddsHome>=2.50&&h.oddsHome<=3.00&&h.oddsAway>=2.50&&h.oddsAway<=3.10 ? 1:0) : '',
      ind_under25:       h.under25 != null ? (h.under25 <= 1.40 ? 1 : 0) : '',
      ind_btts:          ((h.bttsy!=null&&h.bttsy>=1.80&&h.bttsy<=1.95)||(h.bttsn!=null&&h.bttsn>=1.40&&h.bttsn<=1.60)) ? 1 : (h.bttsy==null&&h.bttsn==null ? '' : 0),
      ind_leagueDrawRate:h.drawRate != null ? (h.drawRate >= 29 ? 1 : 0) : '',
    };
  }

  // Include only labelled entries (outcome logged)
  const labelled = history.filter(h => h.outcome !== null);

  const mlRows = labelled.map((h, i) => {
    // Use stored flags if available, otherwise recompute from raw inputs
    const hasFlags = h.ind_tableDistance !== undefined;
    const flags = hasFlags ? {
      ind_tableDistance: h.ind_tableDistance,
      ind_gdGap:         h.ind_gdGap,
      ind_drawOdds:      h.ind_drawOdds,
      ind_balancedOdds:  h.ind_balancedOdds,
      ind_under25:       h.ind_under25,
      ind_btts:          h.ind_btts,
      ind_leagueDrawRate:h.ind_leagueDrawRate,
    } : recomputeInds(h);

    return {
      // ── Identifiers
      'match_id':           h.id,
      'date':               new Date(h.date).toISOString().slice(0,10),
      'home_team':          h.teamA,
      'away_team':          h.teamB,
      'league':             h.league,
      'league_tier':        h.leagueTier || '',

      // ── Raw inputs
      'pos_home':           n(h.posA),
      'pos_away':           n(h.posB),
      'table_distance':     (h.posA != null && h.posB != null) ? Math.abs(h.posA - h.posB) : '',
      'gd_home':            n(h.gdA),
      'gd_away':            n(h.gdB),
      'gd_gap':             (h.gdA != null && h.gdB != null) ? Math.abs(h.gdA - h.gdB) : '',
      'gs_avg_home':        n(h.gsA),
      'gs_avg_away':        n(h.gsB),
      'gc_avg_home':        n(h.gcA),
      'gc_avg_away':        n(h.gcB),
      'cgs':                n(h.cgs),
      'cgc':                n(h.cgc),
      'draw_rate_pct':      n(h.drawRate),
      'odds_home':          n(h.oddsHome),
      'odds_draw':          n(h.oddsDraw),
      'odds_away':          n(h.oddsAway),
      'odds_btts_yes':      n(h.bttsy),
      'odds_btts_no':       n(h.bttsn),
      'odds_under25':       n(h.under25),
      'form_home':          h.formA ? h.formA.join('') : '',
      'form_away':          h.formB ? h.formB.join('') : '',

      // ── Base indicator flags (1 = passed, 0 = failed, blank = data not entered)
      'ind_gd_gap':         n(flags.ind_gdGap),
      'ind_draw_odds':      n(flags.ind_drawOdds),
      'ind_balanced_odds':  n(flags.ind_balancedOdds),
      'ind_under25':        n(flags.ind_under25),
      'ind_btts':           n(flags.ind_btts),
      'ind_league_rate':    n(flags.ind_leagueDrawRate),
      'base_score':         n(h.baseScore),

      // ── Form pattern flags (1/0, blank if form not entered)
      'fp_mixed_form':       h.fp_mixedForm      !== undefined ? n(h.fp_mixedForm)      : '',
      'fp_streak_control':   h.fp_streakControl  !== undefined ? n(h.fp_streakControl)  : '',
      'fp_both_recent_draw': h.fp_bothRecentDraw  !== undefined ? n(h.fp_bothRecentDraw): '',
      'neg_strong_vs_weak':  h.neg_strongVsWeak   !== undefined ? n(h.neg_strongVsWeak) : '',
      'form_delta':          n(h.formDelta),

      // ── Model output
      'total_indicators':   n(h.totalScore),
      'draw_probability':   n(h.prob),

      // ── Label (target variable)
      'outcome':            h.outcome,
      'label_is_draw':      h.outcome === 'draw' ? 1 : 0,
    };
  });

  // Always create the ML sheet
  const mlSheetData = mlRows.length > 0 ? mlRows : [{
    'note': 'No analyses yet — run an analysis first, then export.'
  }];
  const ws2 = XLSX.utils.json_to_sheet(mlSheetData);
  if (mlRows.length > 0) {
    ws2['!cols'] = Object.keys(mlRows[0]).map(key =>
      ({ wch: ['home_team','away_team','league'].includes(key) ? 22 : Math.max(key.length + 2, 8) })
    );
  }
  XLSX.utils.book_append_sheet(wb, ws2, 'ML Training Data');

  /* ── Sheet 3: Accuracy Summary ─────────────────────────── */
  const resolved   = history.filter(h => h.outcome !== null);
  const draws      = resolved.filter(h => h.outcome === 'draw');
  const homes      = resolved.filter(h => h.outcome === 'home');
  const aways      = resolved.filter(h => h.outcome === 'away');
  const correct    = draws.length;
  const accuracy   = resolved.length > 0 ? +((correct / resolved.length) * 100).toFixed(1) : 0;
  const avgProb    = +(history.reduce((s, h) => s + h.prob, 0) / history.length).toFixed(1);
  const avgProbResolved = resolved.length > 0
    ? +(resolved.reduce((s, h) => s + h.prob, 0) / resolved.length).toFixed(1) : 0;

  // Indicator hit-rate analysis
  const indKeys = [
    ['ind_tableDistance',  'Table distance ≤ 6'],
    ['ind_gdGap',          'GD gap ≤ 8'],
    ['ind_drawOdds',       'Draw odds > 2.45'],
    ['ind_balancedOdds',   'Balanced team odds'],
    ['ind_under25',        'Under 2.5 signal'],
    ['ind_btts',           'BTTS signal'],
    ['ind_leagueDrawRate', 'League draw rate ≥ 29%'],
  ];
  const indStats = indKeys.map(([key, label]) => {
    const withInd = resolved.filter(h => h[key] === 1);
    const drawsWithInd = withInd.filter(h => h.outcome === 'draw');
    const rate = withInd.length > 0 ? +((drawsWithInd.length / withInd.length) * 100).toFixed(1) : null;
    return { 'Indicator': label, 'Times triggered': withInd.length, 'Draws when triggered': drawsWithInd.length, 'Draw rate when triggered': rate !== null ? rate + '%' : 'N/A' };
  });

  const summaryRows = [
    { 'Metric': 'Total analyses',           'Value': history.length },
    { 'Metric': 'Outcomes logged',          'Value': resolved.length },
    { 'Metric': 'Pending outcomes',         'Value': history.length - resolved.length },
    { 'Metric': '', 'Value': '' },
    { 'Metric': 'Draw results',             'Value': draws.length },
    { 'Metric': 'Home win results',         'Value': homes.length },
    { 'Metric': 'Away win results',         'Value': aways.length },
    { 'Metric': '', 'Value': '' },
    { 'Metric': 'Correct draw predictions', 'Value': correct },
    { 'Metric': 'Draw prediction accuracy', 'Value': resolved.length > 0 ? accuracy + '%' : 'N/A' },
    { 'Metric': '', 'Value': '' },
    { 'Metric': 'Avg draw probability (all)',      'Value': avgProb + '%' },
    { 'Metric': 'Avg draw probability (resolved)', 'Value': avgProbResolved + '%' },
    { 'Metric': '', 'Value': '' },
    { 'Metric': 'Export generated', 'Value': new Date().toLocaleString('en-GB') },
  ];

  const ws3 = XLSX.utils.json_to_sheet(summaryRows);
  ws3['!cols'] = [{ wch: 34 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Accuracy Summary');

  /* ── Sheet 4: Indicator Hit Rates ──────────────────────── */
  if (resolved.length > 0) {
    const ws4 = XLSX.utils.json_to_sheet(indStats);
    ws4['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Indicator Hit Rates');
  }

  /* ── Sheet 5: Pending Outcomes ─────────────────────────── */
  const pending = history.filter(h => h.outcome === null);
  if (pending.length > 0) {
    const ws5 = XLSX.utils.json_to_sheet(pending.map((h, i) => ({
      '#':                  i + 1,
      'Date Analyzed':      new Date(h.date).toLocaleString('en-GB'),
      'Match':              `${h.teamA} vs ${h.teamB}`,
      'League':             h.league,
      'Draw Probability %': h.prob,
      'Total Indicators':   h.totalScore,
      'Actual Outcome':     '— enter result —',
    })));
    ws5['!cols'] = [{wch:4},{wch:18},{wch:36},{wch:28},{wch:20},{wch:16},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws5, 'Pending Outcomes');
  }

  /* ── Download ──────────────────────────────────────────── */
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `DrawScan_History_${date}.xlsx`);
}

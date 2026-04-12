/* ═══════════════════════════════════════════════════════════════
   DrawScan v2.0 — App Logic
   Updated PRD: Form Pattern Engine, Negative Filters, League %
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

  // Table distance (new: gap ≤ 8, not individual ≤ 10)
  if (posA !== null && posB !== null) {
    const dist = Math.abs(posA - posB);
    if (dist > 8) fails.push(`Table distance (${dist}) exceeds max of 8`);
  }

  // Goal difference gap between teams ≤ 11
  if (gdA !== null && gdB !== null) {
    const gdGap = Math.abs(gdA - gdB);
    if (gdGap > 11)
      fails.push(`Goal difference gap between teams (${gdGap}) exceeds max of 11`);
  }

  // Winning streak ≤ 3
  if (formASet.length >= 3 && wsA > 3)
    fails.push(`${tA} has a win streak of ${wsA} (max 3)`);
  if (formBSet.length >= 3 && wsB > 3)
    fails.push(`${tB} has a win streak of ${wsB} (max 3)`);

  // Combined goals filters
  const cgs = (gsA !== null && gsB !== null) ? +(gsA + gsB).toFixed(2) : null;
  const cgc = (gcA !== null && gcB !== null) ? +(gcA + gcB).toFixed(2) : null;

  if (cgs !== null && cgc !== null) {
    if (cgs >= 2.4 && cgc >= 2.4)
      fails.push(`Both CGS (${cgs}) and CGC (${cgc}) ≥ 2.4 — high-scoring match expected`);
    else if (cgs > 2.4 && cgc >= 1.4)
      fails.push(`CGS ${cgs} > 2.4 but CGC ${cgc} is not < 1.4 (extreme case rule)`);
    else if (cgc > 2.4 && cgs >= 1.4)
      fails.push(`CGC ${cgc} > 2.4 but CGS ${cgs} is not < 1.4 (extreme case rule)`);
  }

  if (fails.length > 0) {
    filterMsg.innerHTML = fails.map(f => `<span>— ${f}</span>`).join('');
    filterEl.style.display = 'block';
    filterEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  /* ── BASE INDICATORS (7) ──────────────────────────────── */
  const baseIndicators = [
    {
      label: 'Balanced league positions',
      detail: 'Table distance ≤ 6',
      pass: posA !== null && posB !== null && Math.abs(posA - posB) <= 6
    },
    {
      label: 'Similar goal difference',
      detail: 'GD gap ≤ 8',
      pass: gdA !== null && gdB !== null && Math.abs(gdA - gdB) <= 8
    },
    {
      label: 'Draw odds in signal range',
      detail: '> 2.45  (ideal 2.60–3.10)',
      pass: oddsDraw !== null && oddsDraw > 2.45
    },
    {
      label: 'Balanced team odds',
      detail: 'Home 2.40–2.80 · Away 2.70–3.20',
      pass: oddsHome !== null && oddsAway !== null &&
            oddsHome >= 2.40 && oddsHome <= 2.80 &&
            oddsAway >= 2.70 && oddsAway <= 3.20
    },
    {
      label: 'Under 2.5 market signal',
      detail: 'Odds < 1.70',
      pass: under25 !== null && under25 < 1.70
    },
    {
      label: 'BTTS market signal',
      detail: 'Yes 1.75–1.90  or  No 1.39–1.71',
      pass: (bttsy !== null && bttsy >= 1.75 && bttsy <= 1.90) ||
            (bttsn !== null && bttsn >= 1.39 && bttsn <= 1.71)
    },
    {
      label: 'Low scoring league',
      detail: 'Avg draw rate ≥ 29%',
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

    // P1: Mixed form vs Mixed form (+1)
    const p1 = mixedA && mixedB;
    formPatterns.push({ label: 'Mixed form vs mixed form', detail: 'Both teams show W, D & L', delta: 1, triggered: p1 });
    if (p1) formDelta += 1;

    // P2: Draw heavy teams (+2)
    const p2 = dA >= 2 && dB >= 2;
    formPatterns.push({ label: 'Draw-heavy teams', detail: 'Each team ≥ 2 draws in last 5', delta: 2, triggered: p2 });
    if (p2) formDelta += 2;

    // P3: Losing team vs defensive team (+1)
    const p3 = (lA >= 3 && dB >= 2) || (lB >= 3 && dA >= 2);
    formPatterns.push({ label: 'Losing side vs defensive side', detail: 'One team ≥ 3 losses, other ≥ 2 draws', delta: 1, triggered: p3 });
    if (p3) formDelta += 1;

    // P4: Alternating results (+1)
    const p4 = isAlternating('A') || isAlternating('B');
    formPatterns.push({ label: 'Alternating results pattern', detail: 'At least one team alternates W/D/L', delta: 1, triggered: p4 });
    if (p4) formDelta += 1;

    // P5: Competitive but not dominant (+1)
    const p5 = dA >= 1 && dB >= 1 && wA <= 2 && wB <= 2;
    formPatterns.push({ label: 'Competitive but not dominant', detail: 'Both ≥ 1 draw, neither > 2 wins', delta: 1, triggered: p5 });
    if (p5) formDelta += 1;

    // P6: Streak control (+1)
    const p6 = wsA <= 3 && wsB <= 3;
    formPatterns.push({ label: 'Streak control', detail: 'Both win streaks ≤ 3', delta: 1, triggered: p6 });
    if (p6) formDelta += 1;

    // Penalty: 5 straight wins (-2)
    const fiveWinA = formState.A.every(r => r === 'W');
    const fiveWinB = formState.B.every(r => r === 'W');
    if (fiveWinA || fiveWinB) {
      const who = fiveWinA && fiveWinB ? 'Both teams' : fiveWinA ? tA : tB;
      formPatterns.push({ label: `${who}: 5 straight wins`, detail: 'Strong momentum — draw unlikely', delta: -2, triggered: true, isPenalty: true });
      formDelta -= 2;
    }

    // Quick Form Validation bonus (+1)
    let qfv = 0;
    if (mixedA && mixedB) qfv++;
    if (wsA <= 3 && wsB <= 3) qfv++;
    if (dA >= 1 && dB >= 1) qfv++;
    if (qfv >= 2) {
      formPatterns.push({ label: 'Quick form validation passed', detail: `${qfv}/3 quick checks positive`, delta: 1, triggered: true, isBonus: true });
      formDelta += 1;
    }

    // Negative filter: strong vs weak form (-2)
    const strongWeak = (wA >= 4 && lB >= 4) || (wB >= 4 && lA >= 4);
    if (strongWeak) {
      formPatterns.push({ label: 'Strong vs weak form mismatch', detail: 'One team 4–5 wins, other 4–5 losses', delta: -2, triggered: true, isPenalty: true });
      formDelta -= 2;
    }

    // Negative filter: high scoring pattern (-1)
    const highScoring = cgs !== null && cgs > 2.2;
    if (highScoring) {
      formPatterns.push({ label: 'High scoring match pattern', detail: `CGS ${cgs} suggests goal-heavy match`, delta: -1, triggered: true, isPenalty: true });
      formDelta -= 1;
    }
  }

  /* ── TOTAL SCORE ──────────────────────────────────────── */
  const totalScore = Math.max(0, baseScore + formDelta);

  /* ── PROBABILITY BANDS ────────────────────────────────── */
  let prob, tier;
  if (totalScore <= 2)       { prob = 30;  tier = 'low'; }
  else if (totalScore <= 4)  { prob = 47;  tier = 'low'; }
  else if (totalScore <= 6)  { prob = 65;  tier = 'medium'; }
  else if (totalScore <= 8)  { prob = 74;  tier = 'medium'; }
  else                       { prob = 82;  tier = 'high'; }

  /* ── LEAGUE WEIGHTING (add % directly) ───────────────── */
  const leagueBoost = { high: 8, african: 6, medium: 5, youth: 0, other: 0, '': 0 };
  const boost = leagueBoost[leagueTier] || 0;
  prob = Math.min(95, prob + boost);

  if (prob >= 70) tier = 'high';
  else if (prob >= 50) tier = 'medium';
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
      const badgeType = p.isPenalty ? 'sub' : p.isBonus ? 'bonus' : p.triggered ? 'add' : 'skip';
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
    cgs: cgs !== null ? +cgs.toFixed(2) : null,
    cgc: cgc !== null ? +cgc.toFixed(2) : null,
    formA: [...formState.A],
    formB: [...formState.B],
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

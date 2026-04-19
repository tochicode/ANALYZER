/* ═══════════════════════════════════════════════════════════════
   DrawScan v4.1 — Weighted Scoring Model
   Form signals recalibrated from 94-match dataset (Apr 2026)
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

  /* ══════════════════════════════════════════════════════
     WEIGHTED SCORING MODEL v3
     Score = weighted sum of normalised signals − penalties
  ══════════════════════════════════════════════════════ */

  // ── 3.1 Under 2.5
  let v_u25 = 0;
  if (under25 !== null) {
    if (under25 <= 1.50)                    v_u25 = 1.0;
    else if (under25 <= 1.60)               v_u25 = 0.5;
  }

  // ── 3.2 BTTS
  let v_btts = 0;
  if ((bttsy !== null && bttsy >= 1.75 && bttsy <= 1.90) ||
      (bttsn !== null && bttsn >= 1.39 && bttsn <= 1.71)) v_btts = 1.0;

  // ── 3.3 CGC (most important)
  let v_cgc = 0;
  if (cgc !== null) {
    if (cgc <= 2.0)                         v_cgc = 1.0;
    else if (cgc <= 2.2)                    v_cgc = 0.7;
    else if (cgc <= 2.4)                    v_cgc = 0.3;
  }

  // ── 3.4 Odds balance (|home − away| diff)
  let v_oddsBalance = 0;
  if (oddsHome !== null && oddsAway !== null) {
    const diff = Math.abs(oddsHome - oddsAway);
    if (diff <= 0.30)                       v_oddsBalance = 1.0;
    else if (diff <= 0.60)                  v_oddsBalance = 0.5;
  }

  // ── 3.5 Draw odds
  let v_drawOdds = 0;
  if (oddsDraw !== null) {
    if (oddsDraw >= 2.55 && oddsDraw <= 2.95)  v_drawOdds = 1.0;
    else if (oddsDraw >= 2.40 && oddsDraw < 2.55) v_drawOdds = 0.5;
    else if (oddsDraw > 2.95 && oddsDraw <= 3.10) v_drawOdds = 0.5;
  }

  // ── 3.6 GD balance
  let v_gdBalance = 0;
  if (gdA !== null && gdB !== null) {
    if (Math.abs(gdA - gdB) <= 8)           v_gdBalance = 1.0;
  }

  // ── 3.7 Form — recalibrated from 94-match dataset
  // Old signal (both ≥1D + no streak≥3) had -14.4% lift — removed
  // New signals from data:
  //   Away streak = 1: +24.6% lift (56.5% DR) — away team won last game only
  //   Both wins ≤ 2:   +3.5% lift (35.4% DR)  — neither team on a run
  //   Both drew last 2: +6.8% lift (38.7% DR) — recent draw form
  let v_form = 0;
  let v_form_away_streak = 0;   // away streak=1 bonus
  let v_form_both_wins = 0;     // both wins≤2 bonus
  let v_form_recent_draw = 0;   // both drew in last 2
  const formAvailable = formASet.length > 0 && formBSet.length > 0;
  let formConditions = [];
  if (formAvailable) {
    const wA = countInForm('A','W'), wB = countInForm('B','W');
    // Away streak = 1 (away won their last game only, not on a run)
    const awayStreakOne = wsB === 1;
    // Both teams won ≤ 2 of last 5
    const bothWinsLow = wA <= 2 && wB <= 2;
    // Both drew in last 2 matches (most recent form)
    const recentDrawA = formState.A.slice(0,2).filter(r => r === 'D').length >= 1;
    const recentDrawB = formState.B.slice(0,2).filter(r => r === 'D').length >= 1;
    const bothRecentDraw = recentDrawA && recentDrawB;

    if (awayStreakOne)   { v_form_away_streak = 1.0; }
    if (bothWinsLow)     { v_form_both_wins   = 1.0; }
    if (bothRecentDraw)  { v_form_recent_draw = 1.0; }

    // v_form = weighted combo: away streak is dominant signal
    v_form = Math.min(1.0, (0.55 * v_form_away_streak) + (0.25 * v_form_both_wins) + (0.20 * v_form_recent_draw));

    formConditions = [
      { label: `Away on 1-game win streak (${tB})`, pass: awayStreakOne, lift: '+24.6%' },
      { label: 'Both teams ≤ 2 wins in last 5',     pass: bothWinsLow,  lift: '+3.5%' },
      { label: 'Both drew in last 2 matches',        pass: bothRecentDraw, lift: '+6.8%' },
    ];
  }

  // ── 3.8 League
  let v_league = 0;
  if (drawRate !== null) {
    if (drawRate >= 30)                     v_league = 1.0;
    else if (drawRate >= 27)                v_league = 0.5;
  }
  // League tier boost on top
  const leagueTierBoost = { high: 1.0, african: 0.7, medium: 0.5, youth: 0, other: 0, '': 0 };
  if (v_league === 0) v_league = leagueTierBoost[leagueTier] || 0;

  // ── 3.9 Negatives
  let v_negative = 0;
  const negReasons = [];
  if (oddsDraw !== null && oddsDraw > 3.20) {
    v_negative += 1;
    negReasons.push('Draw odds > 3.20 — market strongly doubts a draw');
  }
  if (formAvailable) {
    const wAn = countInForm('A','W'), lAn = countInForm('A','L');
    const wBn = countInForm('B','W'), lBn = countInForm('B','L');
    const dominant = (wAn >= 4 && lBn >= 4) || (wBn >= 4 && lAn >= 4);
    if (dominant) {
      v_negative += 1;
      negReasons.push('One team dominant (4–5W vs 4–5L)');
    }
    const fiveWinA = formState.A.every(r => r === 'W');
    const fiveWinB = formState.B.every(r => r === 'W');
    if (fiveWinA || fiveWinB) {
      v_negative += 1;
      negReasons.push(`${fiveWinA && fiveWinB ? 'Both teams' : fiveWinA ? tA : tB}: 5 straight wins`);
    }
  }
  if (cgs !== null && cgs > 2.6) {
    v_negative += 1;
    negReasons.push(`High scoring pattern — CGS ${cgs.toFixed(2)} > 2.6`);
  }

  // ── WEIGHTED SCORE — v4 weights (recalibrated from 94-match dataset)
  // Odds balance: 1.5→3.0 (+33.6% lift), CGC: 3.0→1.5 (−5.3% lift),
  // U25: 2.5→1.5 (+3.3% lift), BTTS: 2.5→1.0 (−0.1% lift)
  const rawScore = +(
    (1.5 * v_u25) +
    (1.0 * v_btts) +
    (1.5 * v_cgc) +
    (3.0 * v_oddsBalance) +
    (1.5 * v_drawOdds) +
    (1.0 * v_gdBalance) +
    (0.5 * v_form) +
    (0.5 * v_league) -
    (3.0 * v_negative)
  ).toFixed(2);

  const drawScore = Math.max(0, rawScore);

  // ── SCORE → PROBABILITY
  let prob, tier;
  if (drawScore <= 4)       { prob = 35; tier = 'low'; }
  else if (drawScore <= 6)  { prob = 50; tier = 'medium'; }
  else if (drawScore <= 8)  { prob = 60; tier = 'medium'; }
  else if (drawScore <= 10) { prob = 68; tier = 'high'; }
  else if (drawScore <= 12) { prob = 75; tier = 'high'; }
  else                      { prob = 82; tier = 'high'; }

  // Fine-tune within band using fractional score
  const bandSize = drawScore <= 4 ? 5 : drawScore <= 6 ? 10 : drawScore <= 8 ? 10 : drawScore <= 10 ? 8 : drawScore <= 12 ? 7 : 7;
  const bandFloor = drawScore <= 4 ? 30 : drawScore <= 6 ? 45 : drawScore <= 8 ? 55 : drawScore <= 10 ? 65 : drawScore <= 12 ? 72 : 78;
  const bandMax   = bandFloor + bandSize;
  const bandMin   = drawScore <= 4 ? 4 : drawScore <= 6 ? 4 : drawScore <= 8 ? 6 : drawScore <= 10 ? 8 : drawScore <= 12 ? 10 : 12;
  const bandRange = drawScore <= 4 ? 4 : 2;
  prob = Math.round(Math.min(bandMax, bandFloor + ((drawScore - bandMin) / bandRange) * bandSize));
  prob = Math.max(bandFloor, Math.min(bandMax, prob));

  if (prob >= 65) tier = 'high';
  else if (prob >= 48) tier = 'medium';
  else tier = 'low';

  /* ── RENDER ───────────────────────────────────────────── */
  document.getElementById('res-match').textContent = `${tA} vs ${tB}`;
  const tierLabels = { high: 'High Draw League', african: 'African Draw League', medium: 'Medium Draw League', youth: 'Youth Competition', other: '' };
  document.getElementById('res-league-tag').textContent =
    leagueLabel ? leagueLabel + (tierLabels[leagueTier] ? '  ·  ' + tierLabels[leagueTier] : '') : 'League not specified';

  document.getElementById('kpi-ind').textContent  = drawScore.toFixed(1);
  document.getElementById('kpi-base').textContent = rawScore >= 0 ? '+' + rawScore : rawScore;
  document.getElementById('kpi-form').textContent = v_negative > 0 ? `−${(3.0 * v_negative).toFixed(1)}` : '0';
  document.getElementById('kpi-cgs').textContent  = cgs !== null ? cgs.toFixed(2) : '—';
  document.getElementById('kpi-cgc').textContent  = cgc !== null ? cgc.toFixed(2) : '—';

  // Signal breakdown rows
  const signals = [
    { label: 'Odds balance',        detail: oddsHome !== null && oddsAway !== null ? `|${oddsHome}−${oddsAway}| = ${Math.abs(oddsHome-oddsAway).toFixed(2)}` : 'No data', val: v_oddsBalance, weight: 3.0, contrib: +(3.0 * v_oddsBalance).toFixed(2) },
    { label: 'Draw odds',           detail: oddsDraw !== null ? `${oddsDraw}` : 'No data',             val: v_drawOdds,   weight: 1.5, contrib: +(1.5 * v_drawOdds).toFixed(2) },
    { label: 'CGC',                 detail: cgc !== null ? `Combined ${cgc.toFixed(2)}` : 'No data',   val: v_cgc,        weight: 1.5, contrib: +(1.5 * v_cgc).toFixed(2) },
    { label: 'Under 2.5',          detail: under25 !== null ? `Odds ${under25}` : 'No data',          val: v_u25,        weight: 1.5, contrib: +(1.5 * v_u25).toFixed(2) },
    { label: 'GD balance',          detail: gdA !== null && gdB !== null ? `Gap ${Math.abs(gdA-gdB)}` : 'No data', val: v_gdBalance, weight: 1.0, contrib: +(1.0 * v_gdBalance).toFixed(2) },
    { label: 'BTTS signal',         detail: bttsy !== null || bttsn !== null ? `Yes ${bttsy??'—'} / No ${bttsn??'—'}` : 'No data', val: v_btts, weight: 1.0, contrib: +(1.0 * v_btts).toFixed(2) },
    { label: 'Form',                detail: formAvailable ? (() => {
      const parts = [];
      if (v_form_away_streak) parts.push('Away streak=1');
      if (v_form_both_wins)   parts.push('Both wins≤2');
      if (v_form_recent_draw) parts.push('Both drew last 2');
      return parts.length ? parts.join(' · ') : 'No conditions met';
    })() : 'No form entered', val: v_form, weight: 0.5, contrib: +(0.5 * v_form).toFixed(2) },
    { label: 'League',              detail: drawRate !== null ? `Draw rate ${drawRate}%` : leagueTier !== '' && leagueTier !== 'other' ? `Tier: ${leagueTier}` : 'No data', val: v_league, weight: 0.5, contrib: +(0.5 * v_league).toFixed(2) },
  ];

  document.getElementById('ind-list').innerHTML = signals.map(s => {
    const active = s.contrib > 0;
    const dotClass = active ? 'dot-pass' : 'dot-fail';
    const labelClass = active ? 'ind-pass' : 'ind-fail';
    const valDisp = s.val === 1 ? '1.0' : s.val === 0.7 ? '0.7' : s.val === 0.5 ? '0.5' : s.val === 0.3 ? '0.3' : '0';
    return `
      <div class="ind-item">
        <div class="ind-left">
          <div class="ind-dot ${dotClass}"></div>
          <div>
            <div class="ind-label ${labelClass}">${s.label} <span style="color:var(--t3);font-size:10px">× ${s.weight}</span></div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--t4);margin-top:1px">${s.detail}</div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:var(--mono);font-size:12px;color:${active ? 'var(--accent)' : 'var(--t4)'}">+${s.contrib}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--t4)">val ${valDisp}</div>
        </div>
      </div>`;
  }).join('');

  // Negatives
  const formSection = document.getElementById('form-section');
  if (formSection) {
    const negHTML = negReasons.length > 0
      ? negReasons.map(r => `
          <div class="ind-item penalty">
            <div class="ind-left">
              <div class="ind-dot" style="background:var(--red);box-shadow:0 0 8px rgba(240,96,90,.5)"></div>
              <div class="ind-label" style="color:var(--red)">${r}</div>
            </div>
            <span class="ind-badge badge-sub">−3.0 pts</span>
          </div>`).join('')
      : `<div style="font-family:var(--mono);font-size:12px;color:var(--t4);padding:12px 0;">— No penalties triggered</div>`;

    document.getElementById('form-list').innerHTML = negHTML;

    if (formAvailable && formConditions.length > 0) {
      document.getElementById('form-list').innerHTML += formConditions.map(c => `
        <div class="ind-item">
          <div class="ind-left">
            <div class="ind-dot ${c.pass ? 'dot-pass' : 'dot-fail'}"></div>
            <div>
              <div class="ind-label ${c.pass ? 'ind-pass' : 'ind-fail'}">${c.label}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--t4);margin-top:1px">Data lift: ${c.lift}</div>
            </div>
          </div>
          <span class="ind-status ${c.pass ? 'status-pass' : 'status-fail'}">${c.pass ? 'Met' : 'Not met'}</span>
        </div>`).join('');
    } else if (!formAvailable) {
      document.getElementById('form-list').innerHTML += `
        <div style="font-family:var(--mono);font-size:12px;color:var(--t4);padding:8px 0;">
          — Enter last 5 results to activate form analysis
        </div>`;
    }
  }

  // Hide league boost section (now folded into v_league)
  const boostSection = document.getElementById('league-boost-section');
  if (boostSection) boostSection.style.display = 'none';

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
    drawScore, rawScore,
    // Raw inputs
    posA, posB, gdA, gdB, gsA, gsB, gcA, gcB,
    drawRate,
    oddsHome, oddsDraw, oddsAway,
    bttsy, bttsn, under25,
    cgs: cgs !== null ? +cgs.toFixed(2) : null,
    cgc: cgc !== null ? +cgc.toFixed(2) : null,
    formA: [...formState.A],
    formB: [...formState.B],
    // Normalised signal values (for ML)
    v_u25, v_btts, v_cgc, v_oddsBalance, v_drawOdds,
    v_gdBalance, v_form, v_form_away_streak, v_form_both_wins, v_form_recent_draw,
    v_league, v_negative,
    // Weighted contributions
    w_u25:         +(1.5 * v_u25).toFixed(2),
    w_btts:        +(1.0 * v_btts).toFixed(2),
    w_cgc:         +(1.5 * v_cgc).toFixed(2),
    w_oddsBalance: +(3.0 * v_oddsBalance).toFixed(2),
    w_drawOdds:    +(1.5 * v_drawOdds).toFixed(2),
    w_gdBalance:   +(1.0 * v_gdBalance).toFixed(2),
    w_form:        +(0.5 * v_form).toFixed(2),
    w_league:      +(0.5 * v_league).toFixed(2),
    w_negative:    +(3.0 * v_negative).toFixed(2),
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
      ind_drawOdds:      h.oddsDraw != null ? (h.oddsDraw >= 2.55 && h.oddsDraw <= 2.95 ? 1 : 0) : '',
      ind_balancedOdds:  (h.oddsHome != null && h.oddsAway != null)
                           ? (h.oddsHome>=2.50&&h.oddsHome<=3.00&&h.oddsAway>=2.50&&h.oddsAway<=3.10 ? 1:0) : '',
      ind_under25:       h.under25 != null ? (h.under25 <= 1.55 ? 1 : 0) : '',
      ind_btts:          ((h.bttsy!=null&&h.bttsy>=1.75&&h.bttsy<=1.90)||(h.bttsn!=null&&h.bttsn>=1.39&&h.bttsn<=1.71)) ? 1 : (h.bttsy==null&&h.bttsn==null ? '' : 0),
      ind_cgcLow:        cgc != null ? (cgc <= 2.0 ? 1 : 0) : '',
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
      'ind_cgc_low':        n(flags.ind_cgcLow),
      'ind_league_rate':    n(flags.ind_leagueDrawRate),
      'base_score':         n(h.baseScore),

      // ── Form pattern flags (1/0, blank if form not entered)
      'fp_mixed_form':      h.fp_mixedForm     !== undefined ? n(h.fp_mixedForm)     : '',
      'fp_streak_control':  h.fp_streakControl !== undefined ? n(h.fp_streakControl) : '',
      'neg_strong_vs_weak': h.neg_strongVsWeak !== undefined ? n(h.neg_strongVsWeak) : '',
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

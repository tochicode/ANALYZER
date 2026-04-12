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

/* ─── Live name sync ──────────────────────────────────────── */
document.getElementById('teamA').addEventListener('input', function () {
  document.getElementById('lbl-teamA').textContent = this.value.trim() || 'Home Team';
});
document.getElementById('teamB').addEventListener('input', function () {
  document.getElementById('lbl-teamB').textContent = this.value.trim() || 'Away Team';
});

/* ─── Gauge animation ─────────────────────────────────────── */
function animateGauge(prob, tier) {
  const path = document.getElementById('gauge-fill');
  const text = document.getElementById('gauge-pct-text');

  // Arc length for a 180-degree semicircle with r=60 = π*60 ≈ 188.5
  const arcLen = Math.PI * 60;
  const fill = (prob / 100) * arcLen;

  path.setAttribute('stroke-dasharray', `${fill} ${arcLen}`);
  path.className = `gauge-fill tier-${tier}`;

  // Count-up animation
  let current = 0;
  const target = prob;
  const duration = 700;
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(eased * target);
    text.textContent = current + '%';
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ─── Main analysis ───────────────────────────────────────── */
function analyze() {
  const filterEl  = document.getElementById('filter-fail');
  const filterMsg = document.getElementById('filter-reasons');
  const resultEl  = document.getElementById('result-card');

  filterEl.style.display = 'none';
  resultEl.style.display = 'none';

  const posA = val('posA'), posB = val('posB');
  const gdA  = val('gdA'),  gdB  = val('gdB');
  const gsA  = val('gsA'),  gsB  = val('gsB');
  const gcA  = val('gcA'),  gcB  = val('gcB');
  const wsA  = val('wsA'),  wsB  = val('wsB');
  const drawRate = val('drawRate');
  const oddsHome = val('oddsHome'), oddsDraw = val('oddsDraw'), oddsAway = val('oddsAway');
  const bttsy = val('bttsy'), bttsn = val('bttsn'), under25 = val('under25');

  const tA = str('teamA') || 'Home Team';
  const tB = str('teamB') || 'Away Team';
  const leagueSel  = document.getElementById('league');
  const leagueTier = leagueSel.value;
  const leagueLabel = leagueSel.options[leagueSel.selectedIndex]?.text || '';

  /* ── Hard filters ───────────────────────────────────────── */
  const fails = [];

  if (posA !== null && posA > 10)
    fails.push(`${tA} position (${posA}) exceeds max of 10`);
  if (posB !== null && posB > 10)
    fails.push(`${tB} position (${posB}) exceeds max of 10`);
  if (gdA !== null && Math.abs(gdA) > 11)
    fails.push(`${tA} goal difference (${gdA}) exceeds ±11`);
  if (gdB !== null && Math.abs(gdB) > 11)
    fails.push(`${tB} goal difference (${gdB}) exceeds ±11`);
  if (wsA !== null && wsA > 3)
    fails.push(`${tA} win streak of ${wsA} exceeds max of 3`);
  if (wsB !== null && wsB > 3)
    fails.push(`${tB} win streak of ${wsB} exceeds max of 3`);

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

  /* ── Indicators ─────────────────────────────────────────── */
  const indicators = [
    {
      label: 'Balanced league positions',
      detail: 'Gap ≤ 6',
      pass: posA !== null && posB !== null && Math.abs(posA - posB) <= 6
    },
    {
      label: 'Similar goal difference',
      detail: 'Gap ≤ 8',
      pass: gdA !== null && gdB !== null && Math.abs(gdA - gdB) <= 8
    },
    {
      label: 'Draw odds in signal range',
      detail: '> 2.45',
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
      detail: 'Yes 1.75–1.90 or No 1.39–1.71',
      pass: (bttsy !== null && bttsy >= 1.75 && bttsy <= 1.90) ||
            (bttsn !== null && bttsn >= 1.39 && bttsn <= 1.71)
    },
    {
      label: 'Low scoring league',
      detail: 'Avg draw rate ≥ 29%',
      pass: drawRate !== null && drawRate >= 29
    }
  ];

  const met = indicators.filter(i => i.pass).length;

  let prob, tier;
  if (met <= 2)      { prob = 25 + met * 5; tier = 'low'; }
  else if (met === 3) { prob = 44;           tier = 'low'; }
  else if (met === 4) { prob = 55;           tier = 'medium'; }
  else if (met === 5) { prob = 65;           tier = 'medium'; }
  else if (met === 6) { prob = 74;           tier = 'high'; }
  else               { prob = 82;           tier = 'high'; }

  /* ── Render ─────────────────────────────────────────────── */
  document.getElementById('res-match').textContent = `${tA} vs ${tB}`;

  const tierLabel = { high: 'High Draw League', medium: 'Medium Draw League', african: 'African Draw League', youth: 'Youth Competition', other: '' };
  document.getElementById('res-league-tag').textContent =
    leagueLabel ? leagueLabel + (tierLabel[leagueTier] ? '  ·  ' + tierLabel[leagueTier] : '') : 'League not specified';

  document.getElementById('kpi-ind').textContent = `${met} / 7`;
  document.getElementById('kpi-cgs').textContent = cgs !== null ? cgs.toFixed(2) : '—';
  document.getElementById('kpi-cgc').textContent = cgc !== null ? cgc.toFixed(2) : '—';

  document.getElementById('ind-list').innerHTML = indicators.map((ind, i) => `
    <div class="ind-item">
      <div class="ind-left">
        <span class="ind-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="ind-dot ${ind.pass ? 'dot-pass' : 'dot-fail'}"></div>
        <div>
          <div class="ind-label ${ind.pass ? 'ind-pass' : 'ind-fail'}">${ind.label}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--t4);margin-top:1px">${ind.detail}</div>
        </div>
      </div>
      <span class="ind-status ${ind.pass ? 'status-pass' : 'status-fail'}">${ind.pass ? 'Met' : 'Not met'}</span>
    </div>
  `).join('');

  resultEl.style.display = 'block';

  // Reset gauge then animate
  const gaugePath = document.getElementById('gauge-fill');
  gaugePath.setAttribute('stroke-dasharray', '0 189');
  document.getElementById('gauge-pct-text').textContent = '0%';

  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setTimeout(() => animateGauge(prob, tier), 200);
}

/* ─── Reset ───────────────────────────────────────────────── */
function resetForm() {
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('filter-fail').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

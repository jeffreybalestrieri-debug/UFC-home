// ═══════════════════════════════════════════
// OJ SCRAPER TAB
// ═══════════════════════════════════════════

var ojFighters = [];

// ── init / server check ────────────────────────────────────────────────────

function initOjTab() {
  const proto = window.location.protocol;
  const host  = window.location.hostname;
  // On any https host (Netlify etc.) the proxy function handles it — no local server needed
  if (proto === 'https:') { document.getElementById('oj-server-warn').style.display = 'none'; return; }
  // On localhost: check if Python proxy server is running
  if (host === 'localhost' || host === '127.0.0.1') {
    fetch('/api/status')
      .then(r  => { document.getElementById('oj-server-warn').style.display = r.ok ? 'none' : 'block'; })
      .catch(() => { document.getElementById('oj-server-warn').style.display = 'block'; });
    return;
  }
  // file:// or anything else
  document.getElementById('oj-server-warn').style.display = 'block';
}

// ── date helpers ───────────────────────────────────────────────────────────

function onOjDateChange() {
  const d1 = document.getElementById('oj-date').value;
  document.getElementById('oj-date-2-display').textContent = d1 ? '+ ' + ojNextDay(d1) : '';
}

function ojNextDay(date1) {
  const d = new Date(date1 + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── appearance CSV upload ──────────────────────────────────────────────────

function handleOjAppearFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    const list = loadFighters(text);
    if (!list) {
      // Show the actual column names found to help diagnose
      const rows = parseCSV(text.replace(/^﻿/, ''));
      const found = rows.length ? rows[0].join(', ') : '(empty file)';
      setMsg('oj-appear-msg', 'error',
        'Could not find <code>player_name</code> and <code>appearance_id</code> columns.<br>' +
        '<span style="color:#666;font-size:0.75rem">Columns found: ' + escHtml(found) + '</span>');
      return;
    }
    if (!list.length) { setMsg('oj-appear-msg', 'error', 'No fighter rows found.'); return; }
    ojFighters = list;
    setMsg('oj-appear-msg', 'success', '✅ Loaded ' + ojFighters.length + ' fighters.');
  };
  reader.readAsText(file);
}

// ── API proxy helper ───────────────────────────────────────────────────────

async function ojApiGet(path, params) {
  const url = new URL('/api/odds-proxy', window.location.origin);
  url.searchParams.set('_path', path);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error('API ' + path + ' returned ' + r.status);
  return r.json();
}

async function ojSafePull(fixtureId, sportsbook, market) {
  try {
    const data = await ojApiGet('fixtures/odds', { sportsbook, fixture_id: fixtureId, market, sport: 'MMA' });
    return (data.data && data.data.length) ? data.data[0] : null;
  } catch (e) {
    console.warn('No data — fixture:', fixtureId, 'market:', market, e.message);
    return null;
  }
}

// ── devig math ─────────────────────────────────────────────────────────────

function ojAmerToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function ojProbToDec(p) {
  return Math.round(1 / p * 100) / 100;
}

function ojProbToAmer(p) {
  if (p <= 0 || p >= 1) return null;
  return p >= 0.5 ? -Math.round(p / (1 - p) * 100) : Math.round((1 - p) / p * 100);
}

function ojToDec(ml) {
  return ml > 0 ? ml / 100 + 1 : 1 - 100 / ml;
}

// Devig a group of mutually exclusive outcomes. entries = [{col, price}, ...]
function ojDevigGroup(entries) {
  const valid = entries.filter(e => e.price != null && !isNaN(e.price));
  if (!valid.length) return {};
  const total = valid.reduce((s, e) => s + ojAmerToProb(e.price), 0);
  const out = {};
  valid.forEach(e => { out[e.col] = ojProbToAmer(ojAmerToProb(e.price) / total); });
  return out;
}

// Devig an over/under pair, returns decimal odds { over, under }
function ojDevigLine(overP, underP) {
  const pO = 1 / ojToDec(overP), pU = 1 / ojToDec(underP), tot = pO + pU;
  return { over: Math.round(1 / (pO / tot) * 100) / 100, under: Math.round(1 / (pU / tot) * 100) / 100 };
}

// Build a standard long-format row from a fair-odds American price
function ojOddsRow(fixtureId, fighter, oddsName, statValue, fairAmer, isAlt) {
  const prob   = ojAmerToProb(fairAmer);
  const overDec = ojProbToDec(prob);
  return {
    fixture_id:         fixtureId,
    fighter,
    odds_name:          oddsName,
    stat_value:         statValue,
    over_decimal_odds:  overDec,
    under_decimal_odds: (overDec >= 1.25 && overDec <= 5) ? Math.round(1 / (1 - prob) * 100) / 100 : null,
    is_alt:             isAlt,
  };
}

// ── fixtures ───────────────────────────────────────────────────────────────

async function ojGetFixtures(date1, date2) {
  const data  = await ojApiGet('fixtures/active', { sport: 'MMA', league: 'UFC' });
  const dates = new Set([date1, date2]);
  return (data.data || [])
    .filter(f => dates.has((f.start_date || '').slice(0, 10)))
    .map(f => ({ fixture_id: f.id, home: f.home_team_display, away: f.away_team_display }));
}

// ── per-fixture odds pull ──────────────────────────────────────────────────

async function ojPullFightOdds(fixtureId, sportsbook, markets) {
  const rows = [];

  // Moneyline always first — gives us fighter names
  const pMl = await ojSafePull(fixtureId, sportsbook, 'moneyline');
  if (!pMl) return rows;

  const f1 = pMl.home_team_display;
  const f2 = pMl.away_team_display;

  const mlPrices = {};
  for (const o of (pMl.odds || [])) {
    if (o.market_id !== 'moneyline') continue;
    if (o.name.includes(f1)) mlPrices.f1 = parseFloat(o.price);
    else if (o.name.includes(f2)) mlPrices.f2 = parseFloat(o.price);
  }
  const mlDv = ojDevigGroup([{ col: 'f1', price: mlPrices.f1 }, { col: 'f2', price: mlPrices.f2 }]);
  const fav  = (mlDv.f1 != null && mlDv.f2 != null && mlDv.f1 <= mlDv.f2) ? f1 : f2;

  // Push moneyline rows (filtered out later)
  for (const [col, name] of [['f1', f1], ['f2', f2]]) {
    const p = mlDv[col]; if (p == null) continue;
    rows.push(ojOddsRow(pMl.id, name, 'ml', 0.5, p, false));
  }

  // Parallel pulls for the remaining markets
  const [pMov, pRound, pTotalRounds, pGtd] = await Promise.all([
    markets.includes('mov')        ? ojSafePull(fixtureId, sportsbook, 'method_of_victory') : Promise.resolve(null),
    ojSafePull(fixtureId, sportsbook, 'round_betting'),        // always — needed for 5-round detection
    markets.includes('fight_time') ? ojSafePull(fixtureId, sportsbook, 'total_rounds')      : Promise.resolve(null),
    markets.includes('fight_time') ? ojSafePull(fixtureId, sportsbook, 'go_the_distance')   : Promise.resolve(null),
  ]);

  const isFiveRound = pRound
    ? (pRound.odds || []).some(o => /4th round|5th round/i.test(o.name))
    : false;

  // ── Method of Victory ──────────────────────────────────────────────────
  if (pMov) {
    const movPrices = {};
    for (const o of (pMov.odds || [])) {
      if (o.market_id !== 'method_of_victory') continue;
      let fighter = null, outcome = null;
      if (o.name.includes(f1 + ' - ')) fighter = 'f1';
      else if (o.name.includes(f2 + ' - ')) fighter = 'f2';
      const nl = o.name.toLowerCase();
      if (nl.includes('ko/tko/dq'))    outcome = 'ko';
      else if (nl.includes('submission')) outcome = 'sub';
      else if (nl.includes('decision'))   outcome = 'points';
      if (fighter && outcome) movPrices[fighter + '_' + outcome] = parseFloat(o.price);
    }

    const movCols = ['f1_ko', 'f1_sub', 'f1_points', 'f2_ko', 'f2_sub', 'f2_points', 'draw'];
    const movDv   = ojDevigGroup(movCols.map(c => ({ col: c, price: movPrices[c] })));

    for (const col of movCols) {
      const p = movDv[col]; if (p == null) continue;
      const fighter = col.startsWith('f1') ? f1 : col.startsWith('f2') ? f2 : 'draw';
      const outcome = col.replace(/^f[12]_/, '');
      rows.push(ojOddsRow(pMov.id, fighter, outcome, 0.5, p, false));
    }

    // Finishes = ko + sub combined probability per fighter
    for (const [name, prefix] of [[f1, 'f1'], [f2, 'f2']]) {
      const probs = [movDv[prefix + '_ko'], movDv[prefix + '_sub']]
        .filter(p => p != null).map(ojAmerToProb);
      if (!probs.length) continue;
      const finishProb = probs.reduce((s, p) => s + p, 0);
      const overDec    = Math.round(1 / finishProb * 100) / 100;
      rows.push({
        fixture_id: pMov.id, fighter: name, odds_name: 'finishes', stat_value: 0.5,
        over_decimal_odds:  overDec,
        under_decimal_odds: (overDec >= 1.25 && overDec <= 5) ? Math.round(1 / (1 - finishProb) * 100) / 100 : null,
        is_alt: false,
      });
    }
  }

  // ── Round Betting ──────────────────────────────────────────────────────
  if (markets.includes('rounds') && pRound) {
    const roundPrices = {};
    let drawPrice = null;
    for (const o of (pRound.odds || [])) {
      if (o.market_id !== 'round_betting') continue;
      let fighter = null, outcome = null;
      if (o.name.includes(f1)) fighter = 'f1'; else if (o.name.includes(f2)) fighter = 'f2';
      const nl = o.name.toLowerCase();
      if      (nl.includes('1st round')) outcome = 'r1';
      else if (nl.includes('2nd round')) outcome = 'r2';
      else if (nl.includes('3rd round')) outcome = 'r3';
      else if (nl.includes('4th round')) outcome = 'r4';
      else if (nl.includes('5th round')) outcome = 'r5';
      else if (nl.includes('decision'))  outcome = 'dec';
      else if (nl === 'draw') { drawPrice = parseFloat(o.price); continue; }
      if (fighter && outcome) roundPrices[fighter + '_' + outcome] = parseFloat(o.price);
    }

    const allCols = isFiveRound
      ? ['f1_r1','f1_r2','f1_r3','f1_r4','f1_r5','f1_dec','f2_r1','f2_r2','f2_r3','f2_r4','f2_r5','f2_dec']
      : ['f1_r1','f1_r2','f1_r3','f1_dec','f2_r1','f2_r2','f2_r3','f2_dec'];
    if (drawPrice != null) { allCols.push('draw'); roundPrices.draw = drawPrice; }

    const roundDv = ojDevigGroup(allCols.map(c => ({ col: c, price: roundPrices[c] })));

    const outCols = isFiveRound
      ? ['f1_r1','f1_r2','f1_r3','f1_r4','f1_r5','f2_r1','f2_r2','f2_r3','f2_r4','f2_r5']
      : ['f1_r1','f1_r2','f1_r3','f2_r1','f2_r2','f2_r3'];

    for (const col of outCols) {
      const p = roundDv[col]; if (p == null) continue;
      const fighter = col.startsWith('f1') ? f1 : f2;
      const outcome = col.replace(/^f[12]_/, '');
      rows.push(ojOddsRow(pRound.id, fighter, outcome, 0.5, p, false));
    }
  }

  // ── Fight Time ─────────────────────────────────────────────────────────
  let hasShort12 = false;

  if (pTotalRounds) {
    const lineMap = {};
    for (const o of (pTotalRounds.odds || [])) {
      if (o.market_id !== 'total_rounds') continue;
      const pts = String(parseFloat(o.points));
      if (!lineMap[pts]) lineMap[pts] = {};
      lineMap[pts][o.selection_line] = parseFloat(o.price);
    }

    const ptToStat = { '0.5': 2.5, '1.5': 7.5, '2.5': 12.5, '3.5': 17.5, '4.5': 22.5 };
    let roundsData = Object.entries(lineMap).map(([pts, prices]) => {
      const statValue = ptToStat[pts];
      if (statValue == null || prices.over == null || prices.under == null) return null;
      const dv = ojDevigLine(prices.over, prices.under);
      return { stat_value: statValue, over_dec: dv.over, under_dec: dv.under };
    }).filter(Boolean);

    hasShort12  = roundsData.some(r => r.stat_value === 12.5 && r.over_dec <= 1.5);
    roundsData  = roundsData.filter(r => !(r.stat_value === 12.5 && r.over_dec <= 1.5));

    const mainLine = roundsData.reduce((best, r) => {
      return !best || Math.abs(r.over_dec - 2) < Math.abs(best.over_dec - 2) ? r : best;
    }, null)?.stat_value;

    for (const r of roundsData) {
      rows.push({
        fixture_id: pTotalRounds.id, fighter: fav, odds_name: 'fight_time',
        stat_value: r.stat_value, over_decimal_odds: r.over_dec, under_decimal_odds: r.under_dec,
        is_alt: r.stat_value !== mainLine,
      });
    }
  }

  if (pGtd) {
    let overPrice = null, underPrice = null;
    for (const o of (pGtd.odds || [])) {
      if (o.market_id !== 'go_the_distance') continue;
      let side = o.selection_line;
      if (!side) {
        const nl = o.name.toLowerCase();
        if (/yes|over|goes the distance/.test(nl)) side = 'over';
        else if (/no|under|does not go/.test(nl))  side = 'under';
      }
      if (side === 'over')  overPrice  = parseFloat(o.price);
      if (side === 'under') underPrice = parseFloat(o.price);
    }
    if (overPrice != null && underPrice != null) {
      const dv = ojDevigLine(overPrice, underPrice);
      rows.push({
        fixture_id: pGtd.id, fighter: fav, odds_name: 'fight_time',
        stat_value: isFiveRound ? 24.99 : 14.99,
        over_decimal_odds: dv.over, under_decimal_odds: dv.under,
        is_alt: !hasShort12,
      });
    }
  }

  return rows;
}

// ── rename + filter ────────────────────────────────────────────────────────

const OJ_RENAME = {
  r1: '1st_round_finish', r2: '2nd_round_finish', r3: '3rd_round_finish',
  r4: '4th_round_finish', r5: '5th_round_finish',
  ko: 'knockouts', sub: 'submissions', points: 'decision',
  ml: 'moneyline', draw: 'draw',
};

// ── main entry point ───────────────────────────────────────────────────────

async function ojGetAllOdds(date1, date2, sportsbook, markets) {
  const fixtures = await ojGetFixtures(date1, date2);
  if (!fixtures.length) throw new Error('No fixtures found for ' + date1 + ' / ' + date2 + '. Check the date.');

  const allRows = [];
  for (const fix of fixtures) {
    try {
      const rows = await ojPullFightOdds(fix.fixture_id, sportsbook, markets);
      allRows.push(...rows);
    } catch (e) {
      console.warn('Skipping fixture', fix.fixture_id, e.message);
    }
  }

  return allRows
    .map(r => ({ ...r, odds_name: OJ_RENAME[r.odds_name] || r.odds_name }))
    .filter(r => r.odds_name !== 'moneyline' && r.odds_name !== 'decision')
    .map(r => ({ ...r, is_alt: !!r.is_alt }));
}

// ── join with appearances + build output ───────────────────────────────────

function ojBuildOutput(results, fighters) {
  const fighterMap = {};
  fighters.forEach(f => { if (f.name) fighterMap[f.name.toLowerCase()] = f; });

  return results.map(r => {
    const f    = fighterMap[r.fighter.toLowerCase()] || {};
    let over   = r.over_decimal_odds;
    let under  = r.under_decimal_odds;

    // Mirror scraper_runner.r logic exactly
    if (under == null) under = '';
    if (over > 4)      under = '';
    if (under !== '' && under <= 1.25) under = '';
    if (over  != null  && over  <= 1.25) over  = '';

    return {
      player_name:        f.name          || '',
      appearance_id:      f.appearance_id || '',
      stat_name:          r.odds_name,
      is_alt:             r.is_alt ? 'TRUE' : '',
      stat_value:         r.stat_value,
      over_decimal_odds:  over  !== '' && over  != null ? over  : '',
      under_decimal_odds: under !== ''               ? under : '',
      line_replacement:   'TRUE',
    };
  });
}

// ── CSV builder ────────────────────────────────────────────────────────────

function ojBuildCsv(rows) {
  const headers = ['player_name','appearance_id','stat_name','is_alt','stat_value','over_decimal_odds','under_decimal_odds','line_replacement'];
  const lines   = [headers.join(',')];
  rows.forEach(r => {
    lines.push(headers.map(h => csvEsc(r[h] != null ? String(r[h]) : '')).join(','));
  });
  return lines.join('\n');
}

// ── run scraper ────────────────────────────────────────────────────────────

async function runOjScraper() {
  const date1      = document.getElementById('oj-date').value;
  const date2      = date1 ? ojNextDay(date1) : '';
  const sportsbook = document.getElementById('oj-sportsbook').value;
  const markets    = Array.from(document.querySelectorAll('.oj-market:checked')).map(el => el.value);

  if (!date1)           { setMsg('oj-run-msg', 'error', 'Please select a fight date.'); return; }
  if (!sportsbook)      { setMsg('oj-run-msg', 'error', 'Please select a sportsbook.'); return; }
  if (!markets.length)  { setMsg('oj-run-msg', 'error', 'Select at least one market.'); return; }
  if (!ojFighters.length){ setMsg('oj-run-msg', 'error', 'Upload an appearance CSV first.'); return; }

  document.getElementById('oj-run-btn').disabled = true;
  document.getElementById('oj-spinner').style.display = 'block';
  document.getElementById('oj-results-card').style.display = 'none';
  setMsg('oj-run-msg', 'success', '⏳ Fetching odds… may take 30–60 seconds.');

  try {
    const results = await ojGetAllOdds(date1, date2, sportsbook, markets);
    const output  = ojBuildOutput(results, ojFighters);
    window._ojCsv = ojBuildCsv(output);
    renderOjResults(output);
    const uniqueFighters = new Set(results.map(r => r.fighter)).size;
    setMsg('oj-run-msg', 'success', '✅ Done — ' + results.length + ' rows across ' + uniqueFighters + ' fighters.');
  } catch (err) {
    setMsg('oj-run-msg', 'error', '❌ ' + escHtml(err.message));
  } finally {
    document.getElementById('oj-run-btn').disabled = false;
    document.getElementById('oj-spinner').style.display = 'none';
  }
}

// ── render results ─────────────────────────────────────────────────────────

function renderOjResults(output) {
  const colLabels = { player_name: 'Fighter', appearance_id: 'App ID', stat_name: 'Stat',
    is_alt: 'Alt', stat_value: 'Value', over_decimal_odds: 'Over', under_decimal_odds: 'Under', line_replacement: 'Upload' };
  const headers = Object.keys(colLabels);

  document.getElementById('oj-result-thead').innerHTML =
    '<tr>' + headers.map(h => '<th style="color:#2dd4bf">' + colLabels[h] + '</th>').join('') + '</tr>';

  const tbody = document.getElementById('oj-result-tbody');
  tbody.innerHTML = '';
  const limit = Math.min(output.length, 100);
  for (let i = 0; i < limit; i++) {
    const r  = output[i];
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">'                                                  + escHtml(r.player_name || '—') + '</td>' +
      '<td style="font-family:monospace;font-size:0.72rem;color:#555">'           + (r.appearance_id ? escHtml(r.appearance_id.substring(0,8)) + '…' : '<span class="uuid-miss">—</span>') + '</td>' +
      '<td style="color:#2dd4bf">'                                                + escHtml(r.stat_name) + '</td>' +
      '<td style="color:#888">'                                                   + escHtml(String(r.is_alt)) + '</td>' +
      '<td style="color:#e8c04a">'                                                + r.stat_value + '</td>' +
      '<td style="color:#4ddb7a">'                                                + (r.over_decimal_odds  || '—') + '</td>' +
      '<td style="color:#4ddb7a">'                                                + (r.under_decimal_odds || '—') + '</td>' +
      '<td style="color:#555">'                                                   + escHtml(String(r.line_replacement)) + '</td>';
    tbody.appendChild(tr);
  }
  if (output.length > limit) {
    const more = document.createElement('tr');
    more.innerHTML = '<td colspan="8" style="color:#555;text-align:center;padding:10px">… ' + (output.length - limit) + ' more rows</td>';
    tbody.appendChild(more);
  }

  const matchedCount   = output.filter(r => r.appearance_id).length;
  const unmatchedCount = output.length - matchedCount;
  const uniqueFighters = new Set(output.map(r => r.player_name).filter(Boolean)).size;
  document.getElementById('oj-summary').innerHTML =
    '<div class="sum-box"><span style="color:#2dd4bf">' + output.length   + '</span>Total Rows</div>'  +
    '<div class="sum-box"><span style="color:#2dd4bf">' + uniqueFighters  + '</span>Fighters</div>'    +
    '<div class="sum-box"><span style="color:#4ddb7a">' + matchedCount    + '</span>Matched</div>'     +
    (unmatchedCount ? '<div class="sum-box"><span style="color:#f97316">' + unmatchedCount + '</span>Unmatched</div>' : '');

  document.getElementById('oj-results-card').style.display = 'block';
}

// ── export ─────────────────────────────────────────────────────────────────

function exportOjCSV() {
  if (!window._ojCsv) return;
  dlCSV(window._ojCsv, 'ufc_bulk_upload.csv');
}

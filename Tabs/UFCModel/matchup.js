// ═══════════════════════════════════════════
// MATCHUP BUILDER TAB
// ═══════════════════════════════════════════

var mbFighterStats = null;
var mbLoadStarted = false;

async function mbLoad() {
  if (mbLoadStarted) return;
  mbLoadStarted = true;
  document.getElementById('mb-status').innerHTML =
    '<span style="color:#22d3ee">⏳ Loading fighter database…</span>';
  try {
    mbFighterStats = await loadModelSheet(MODEL_GIDS.fighter_stats);
    var fighters = mbFighterStats
      .map(function (r) {
        return r['Fighter'];
      })
      .filter(Boolean)
      .sort();
    var dl = document.getElementById('mb-fighters-list');
    dl.innerHTML = fighters
      .map(function (f) {
        return '<option value="' + escHtml(f) + '">';
      })
      .join('');
    document.getElementById('mb-status').innerHTML =
      '<span style="color:#4ddb7a">✓ ' + fighters.length + ' fighters loaded</span>';
  } catch (e) {
    mbLoadStarted = false;
    document.getElementById('mb-status').innerHTML =
      '<div class="error">Failed to load fighters: ' + escHtml(e.message) + '</div>';
  }
}

function mbCalculate() {
  var fA = document.getElementById('mb-fighter-a').value.trim();
  var fB = document.getElementById('mb-fighter-b').value.trim();
  var wc = document.getElementById('mb-weight-class').value;

  if (!fA || !fB) {
    document.getElementById('mb-results').innerHTML =
      '<div class="error">Enter both fighter names.</div>';
    return;
  }
  if (fA === fB) {
    document.getElementById('mb-results').innerHTML =
      '<div class="error">Fighters must be different.</div>';
    return;
  }

  var stats = mbFighterStats || [];
  var mlA = document.getElementById('mb-ml-a').value.trim();
  var mlB = document.getElementById('mb-ml-b').value.trim();
  var winProbA;
  var noMarket = false;

  if (mlA && mlB) {
    var implA = oddsToImplied(mlA);
    var implB = oddsToImplied(mlB);
    if (!isNaN(implA) && !isNaN(implB)) {
      winProbA = implA / (implA + implB);
    } else {
      winProbA = 0.5;
      noMarket = true;
    }
  } else {
    winProbA = 0.5;
    noMarket = true;
  }

  var roundTotal = document.getElementById('mb-round-total').value.trim() || null;
  var overOdds = document.getElementById('mb-over-odds').value.trim() || null;
  var underOdds = document.getElementById('mb-under-odds').value.trim() || null;

  var sim = runMatchupSim(fA, fB, wc, winProbA, stats, roundTotal, overOdds, underOdds);

  var sA =
    stats.find(function (r) {
      return r['Fighter'] === fA;
    }) || {};
  var sB =
    stats.find(function (r) {
      return r['Fighter'] === fB;
    }) || {};

  var strMinA = getStat(sA, 'Str/Min', getFinishBaseline(wc).avg_str_min);
  var strMinB = getStat(sB, 'Str/Min', getFinishBaseline(wc).avg_str_min);
  var tdMinA = getStat(sA, 'TD/Min');
  var tdMinB = getStat(sB, 'TD/Min');

  var overrideEl = document.getElementById('mb-exp-mins');
  var overrideVal = overrideEl ? parseFloat(overrideEl.value) : NaN;
  var expMins = !isNaN(overrideVal) && overrideVal > 0 ? overrideVal : estimateExpMins(sim, 3);

  var suppSym = Math.max(0.55, 1 - 0.4 * (tdMinA + tdMinB));
  var muA = strMinA * expMins * suppSym;
  var muB = strMinB * expMins * suppSym;

  var lineA = parseFloat(document.getElementById('mb-line-a').value);
  var lineB = parseFloat(document.getElementById('mb-line-b').value);
  var phi = parseFloat(document.getElementById('mb-phi').value) || 1.8;
  var sigFloor = parseFloat(document.getElementById('mb-sigma-floor').value) || 10;
  var rho = parseFloat(document.getElementById('mb-rho').value) || -0.35;
  var kOwn = parseFloat(document.getElementById('mb-k-grap-own').value) || 0.2;
  var kOpp = parseFloat(document.getElementById('mb-k-grap-opp').value) || 0.5;

  var ssSim = null;
  if (!isNaN(lineA) && !isNaN(lineB)) {
    ssSim = simSigStrikes(
      muA,
      muB,
      lineA,
      lineB,
      tdMinA,
      tdMinB,
      phi,
      sigFloor,
      rho,
      kOwn,
      kOpp,
      10000,
    );
  }

  renderMbResults(fA, fB, wc, sim, ssSim, expMins, lineA, lineB, sA, sB, winProbA, noMarket);
}

function renderMbResults(
  fA,
  fB,
  wc,
  sim,
  ssSim,
  expMins,
  lineA,
  lineB,
  sA,
  sB,
  winProbA,
  noMarket,
) {
  var winProbB = 1 - winProbA;
  var html = '';

  if (noMarket) {
    html +=
      '<div class="warn" style="margin-bottom:12px">No ML odds entered — using 50/50. Enter ML odds for market-tethered win probability.</div>';
  }

  // Win prob banner
  html +=
    '<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-bottom:16px">' +
    '<div class="mb-win-box">' +
    '<div class="mb-win-name">' +
    escHtml(fA) +
    '</div>' +
    '<div class="mb-win-pct">' +
    (winProbA * 100).toFixed(1) +
    '%</div>' +
    '<div class="mb-win-odds">' +
    fmtAmerican(winProbA) +
    '</div>' +
    '</div>' +
    '<div style="color:#333;font-size:0.82rem">vs</div>' +
    '<div class="mb-win-box">' +
    '<div class="mb-win-name">' +
    escHtml(fB) +
    '</div>' +
    '<div class="mb-win-pct">' +
    (winProbB * 100).toFixed(1) +
    '%</div>' +
    '<div class="mb-win-odds">' +
    fmtAmerican(winProbB) +
    '</div>' +
    '</div>' +
    '</div>';

  // Finish / totals summary
  html +=
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
    '<div class="card" style="padding:12px">' +
    '<div class="mb-card-lbl">Finish / Decision</div>' +
    mbStatRow('Finish', fmtPct(sim.p_finish), fmtAmerican(sim.p_finish)) +
    mbStatRow('Decision', fmtPct(sim.p_decision), fmtAmerican(sim.p_decision)) +
    '</div>' +
    '<div class="card" style="padding:12px">' +
    '<div class="mb-card-lbl">Round Totals</div>' +
    mbStatRow('Under 2.5', fmtPct(sim.under25), fmtAmerican(sim.under25)) +
    mbStatRow('Over 2.5', fmtPct(sim.over25), fmtAmerican(sim.over25)) +
    '</div>' +
    '</div>';

  // Method props table
  html +=
    '<div class="card" style="padding:12px;margin-bottom:16px">' +
    '<div class="mb-card-lbl">Method Props</div>' +
    '<div class="tbl-wrap"><table>' +
    '<thead><tr>' +
    '<th style="color:#aaa">Fighter</th>' +
    '<th style="color:#22d3ee">Win</th>' +
    '<th style="color:#22d3ee">KO/TKO</th>' +
    '<th style="color:#22d3ee">Sub</th>' +
    '<th style="color:#22d3ee">Decision</th>' +
    '</tr></thead>' +
    '<tbody>' +
    '<tr><td>' +
    escHtml(fA) +
    '</td><td>' +
    fmtAmerican(sim.win_a) +
    '</td><td>' +
    fmtAmerican(sim.ko_a) +
    '</td><td>' +
    fmtAmerican(sim.sub_a) +
    '</td><td>' +
    fmtAmerican(sim.dec_a) +
    '</td></tr>' +
    '<tr><td>' +
    escHtml(fB) +
    '</td><td>' +
    fmtAmerican(sim.win_b) +
    '</td><td>' +
    fmtAmerican(sim.ko_b) +
    '</td><td>' +
    fmtAmerican(sim.sub_b) +
    '</td><td>' +
    fmtAmerican(sim.dec_b) +
    '</td></tr>' +
    '</tbody>' +
    '</table></div>' +
    '</div>';

  // Round props table
  html +=
    '<div class="card" style="padding:12px;margin-bottom:16px">' +
    '<div class="mb-card-lbl">Round Props</div>' +
    '<div class="tbl-wrap"><table>' +
    '<thead><tr>' +
    '<th style="color:#aaa">Fighter</th>' +
    '<th style="color:#22d3ee">R1</th>' +
    '<th style="color:#22d3ee">R2</th>' +
    '<th style="color:#22d3ee">R3+</th>' +
    '</tr></thead>' +
    '<tbody>' +
    '<tr><td>' +
    escHtml(fA) +
    '</td><td>' +
    fmtAmerican(sim.win_a_r1) +
    '</td><td>' +
    fmtAmerican(sim.win_a_r2) +
    '</td><td>' +
    fmtAmerican(sim.win_a_r3) +
    '</td></tr>' +
    '<tr><td>' +
    escHtml(fB) +
    '</td><td>' +
    fmtAmerican(sim.win_b_r1) +
    '</td><td>' +
    fmtAmerican(sim.win_b_r2) +
    '</td><td>' +
    fmtAmerican(sim.win_b_r3) +
    '</td></tr>' +
    '</tbody>' +
    '</table></div>' +
    '</div>';

  // H2H stats
  html +=
    '<div class="card" style="padding:12px;margin-bottom:16px">' +
    '<div class="mb-card-lbl">Fighter Stats</div>' +
    '<div class="tbl-wrap"><table>' +
    '<thead><tr>' +
    '<th style="color:#aaa">Stat</th>' +
    '<th style="color:#22d3ee">' +
    escHtml(fA) +
    '</th>' +
    '<th style="color:#22d3ee">' +
    escHtml(fB) +
    '</th>' +
    '</tr></thead>' +
    '<tbody>' +
    mbH2HRow('Str/Min', sA, sB) +
    mbH2HRow('TD/Min', sA, sB) +
    mbH2HRow('Sub/Min', sA, sB) +
    mbH2HRow('KD/Min', sA, sB) +
    mbH2HRow('Wins', sA, sB, 0) +
    mbH2HRow('Losses', sA, sB, 0) +
    mbH2HRow('Finish_For_Bias', sA, sB, 1.0, 'Finish Bias') +
    mbH2HRow('Composite_Adjustment', sA, sB, 0.49, 'Comp Adj') +
    mbH2HRow('Sub_Defense_Rating', sA, sB, 1.0, 'Sub Def') +
    '</tbody>' +
    '</table></div>' +
    '</div>';

  // Sig strikes
  html +=
    '<div class="card" style="padding:12px;margin-bottom:16px"><div class="mb-card-lbl">Sig Strikes <span style="color:#555;font-weight:normal">(exp ' +
    expMins +
    ' min)</span></div>';
  if (ssSim) {
    html +=
      '<div class="tbl-wrap"><table>' +
      '<thead><tr>' +
      '<th style="color:#aaa">Fighter</th>' +
      '<th style="color:#aaa">Proj</th>' +
      '<th style="color:#aaa">Line</th>' +
      '<th style="color:#22d3ee">Over %</th>' +
      '<th style="color:#22d3ee">Under %</th>' +
      '<th style="color:#22d3ee">Over</th>' +
      '<th style="color:#22d3ee">Under</th>' +
      '</tr></thead>' +
      '<tbody>' +
      '<tr><td>' +
      escHtml(fA) +
      '</td><td>' +
      ssSim.adjMuA.toFixed(1) +
      '</td><td>' +
      (isNaN(lineA) ? '—' : lineA) +
      '</td><td>' +
      fmtPct(ssSim.overA) +
      '</td><td>' +
      fmtPct(ssSim.underA) +
      '</td><td>' +
      fmtAmerican(ssSim.overA) +
      '</td><td>' +
      fmtAmerican(ssSim.underA) +
      '</td></tr>' +
      '<tr><td>' +
      escHtml(fB) +
      '</td><td>' +
      ssSim.adjMuB.toFixed(1) +
      '</td><td>' +
      (isNaN(lineB) ? '—' : lineB) +
      '</td><td>' +
      fmtPct(ssSim.overB) +
      '</td><td>' +
      fmtPct(ssSim.underB) +
      '</td><td>' +
      fmtAmerican(ssSim.overB) +
      '</td><td>' +
      fmtAmerican(ssSim.underB) +
      '</td></tr>' +
      '</tbody>' +
      '</table></div>';
  } else {
    html +=
      '<div style="color:#555;font-size:0.82rem">Enter sig strike lines (right panel) to see projections.</div>';
  }
  html += '</div>';

  document.getElementById('mb-results').innerHTML = html;
}

function mbStatRow(label, pct, odds) {
  return (
    '<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:3px 0">' +
    '<span style="color:#aaa">' +
    label +
    '</span>' +
    '<span style="color:#f0f0f0">' +
    pct +
    ' <span style="color:#666;font-size:0.75rem">' +
    odds +
    '</span></span>' +
    '</div>'
  );
}

function mbH2HRow(col, sA, sB, def, label) {
  var vA = parseFloat(sA[col]);
  var vB = parseFloat(sB[col]);
  var fmt = function (v) {
    if (isNaN(v)) return '—';
    return v % 1 === 0 ? String(v) : v.toFixed(3);
  };
  return (
    '<tr><td style="color:#888">' +
    escHtml(label || col) +
    '</td><td>' +
    fmt(vA) +
    '</td><td>' +
    fmt(vB) +
    '</td></tr>'
  );
}

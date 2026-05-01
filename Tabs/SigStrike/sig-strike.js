// ═══════════════════════════════════════════
// SIG STRIKE ALTS TAB
// ═══════════════════════════════════════════

var ssMarkets = [];
var ssResults = [];

const SS_K = 1.718644;

// ── Gamma math (port of R's pgamma / qgamma) ──────────────────────────────

function ssLnGamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
             771.32342877765313, -176.61502916214059, 12.507343278686905,
             -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - ssLnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i <= 8; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function ssGammaP(a, x) {
  // Regularized lower incomplete gamma P(a, x)
  if (x <= 0) return 0;
  const FPMIN = 1e-300;
  if (x < a + 1) {
    // Series expansion
    let ap = a, sum = 1 / a, del = 1 / a;
    for (let i = 0; i < 200; i++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - ssLnGamma(a));
  } else {
    // Continued fraction (Lentz's method)
    let b = x + 1 - a, c2 = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c2 = b + an / c2; if (Math.abs(c2) < FPMIN) c2 = FPMIN;
      d = 1 / d;
      const del2 = d * c2; h *= del2;
      if (Math.abs(del2 - 1) < 3e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - ssLnGamma(a)) * h;
  }
}

function ssPGamma(x, shape, scale) {
  return ssGammaP(shape, x / scale);
}

function ssQGamma(p, shape, scale) {
  // Bisection mirroring R's uniroot approach
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0, hi = shape * scale * 4;
  while (ssPGamma(hi, shape, scale) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (ssPGamma(mid, shape, scale) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}

// ── get_mu_adjusted (port of R's uniroot) ─────────────────────────────────

function ssMuAdjusted(line) {
  // Find mu such that median of Gamma(SS_K, mu/SS_K) = line
  const f = function(mu) { return ssQGamma(0.5, SS_K, mu / SS_K) - line; };
  let lo = line * 0.5, hi = line * 2;
  while (f(hi) < 0) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}

// ── generate_alts (port of R's generate_alts) ─────────────────────────────

function ssGenerateAlts(playerName, appearanceId, line) {
  const mu   = ssMuAdjusted(line);
  const beta = mu / SS_K;

  // alt thresholds: 9.5, 19.5, 29.5, ... up to line + 60; exclude within 8 of main line
  var thresholds = [];
  for (var t = 9.5; t <= line + 60; t += 10) {
    if (Math.abs(t - line) > 8) thresholds.push(t);
  }

  var rows = [{
    player_name:        playerName,
    appearance_id:      appearanceId,
    stat_name:          'significant_strikes',
    is_alt:             '',
    line_replacement:   'TRUE',
    stat_value:         line,
    over_decimal_odds:  2,
    under_decimal_odds: 2,
  }];

  for (var i = 0; i < thresholds.length; i++) {
    var thresh    = thresholds[i];
    var probOver  = 1 - ssPGamma(thresh, SS_K, beta);
    rows.push({
      player_name:        playerName,
      appearance_id:      appearanceId,
      stat_name:          'significant_strikes',
      is_alt:             'TRUE',
      line_replacement:   '',
      stat_value:         thresh,
      over_decimal_odds:  Math.round(1 / probOver * 100) / 100,
      under_decimal_odds: '',
    });
  }

  return rows;
}

// ── markets CSV parse ─────────────────────────────────────────────────────

function ssNormKey(s) {
  return String(s).toLowerCase().replace(/[\s._-]/g, '');
}

function ssColIdx(headers, candidates) {
  var norms = headers.map(ssNormKey);
  for (var i = 0; i < candidates.length; i++) {
    var idx = norms.indexOf(ssNormKey(candidates[i]));
    if (idx >= 0) return idx;
  }
  return -1;
}

function loadSsMarkets(text) {
  text = text.replace(/^﻿/, '');
  var rows = parseCSV(text);
  if (rows.length < 2) return null;
  var hdr = rows[0];

  var iName   = ssColIdx(hdr, ['Player.Name',  'Player Name',  'player_name',  'PlayerName']);
  var iId     = ssColIdx(hdr, ['Appearance.Id','Appearance Id','appearance_id','AppearanceId']);
  var iStat   = ssColIdx(hdr, ['Stat.name',    'Stat name',    'stat_name',    'StatName',   'Stat.Name']);
  var iStatus = ssColIdx(hdr, ['Line.status',  'Line status',  'line_status',  'LineStatus', 'Line.Status']);
  var iType   = ssColIdx(hdr, ['Line.type',    'Line type',    'line_type',    'LineType',   'Line.Type']);
  var iValue  = ssColIdx(hdr, ['Line.value',   'Line value',   'line_value',   'LineValue',  'Line.Value']);

  if (iName < 0 || iId < 0 || iValue < 0) return { missing: hdr };

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r      = rows[i];
    var stat   = iStat   >= 0 ? (r[iStat]   || '').trim() : '';
    var status = iStatus >= 0 ? (r[iStatus] || '').trim() : '';
    var type   = iType   >= 0 ? (r[iType]   || '').trim() : '';

    if (iStat   >= 0 && stat.toLowerCase()   !== 'significant strikes') continue;
    if (iStatus >= 0 && status.toLowerCase() !== 'active')              continue;
    if (iType   >= 0 && type.toLowerCase()   !== 'balanced')            continue;

    var name  = (r[iName] || '').trim();
    var id    = (r[iId]   || '').trim();
    var value = parseFloat(r[iValue]);
    if (!name || !id || isNaN(value)) continue;

    out.push({ player_name: name, appearance_id: id, line_value: value });
  }
  return out;
}

// ── file upload ───────────────────────────────────────────────────────────

function handleSsMarketsFile(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var result = loadSsMarkets(ev.target.result);
    if (!result) {
      setMsg('ss-upload-msg', 'error', 'Could not parse markets CSV — file appears empty.');
      return;
    }
    if (!Array.isArray(result)) {
      var found = result.missing.join(', ');
      setMsg('ss-upload-msg', 'error',
        'Could not find required columns (<code>Player.Name</code>, <code>Appearance.Id</code>, <code>Line.value</code>).<br>' +
        '<span style="color:#666;font-size:0.75rem">Columns found: ' + escHtml(found) + '</span>');
      return;
    }
    if (!result.length) {
      setMsg('ss-upload-msg', 'error', 'No rows matched filters: Stat = Significant Strikes, Status = active, Type = balanced.');
      return;
    }
    ssMarkets = result;
    setMsg('ss-upload-msg', 'success',
      '&#10003; Loaded ' + ssMarkets.length + ' sig strike line' + (ssMarkets.length !== 1 ? 's' : '') + '.');
  };
  reader.readAsText(file);
}

// ── run ───────────────────────────────────────────────────────────────────

function runSigStrike() {
  if (!ssMarkets.length) {
    setMsg('ss-run-msg', 'error', 'Upload a markets CSV first.');
    return;
  }
  setMsg('ss-run-msg', '', '');

  ssResults = [];
  for (var i = 0; i < ssMarkets.length; i++) {
    var alts = ssGenerateAlts(ssMarkets[i].player_name, ssMarkets[i].appearance_id, ssMarkets[i].line_value);
    ssResults = ssResults.concat(alts);
  }

  renderSsResults();
}

// ── render ────────────────────────────────────────────────────────────────

function renderSsResults() {
  var card = document.getElementById('ss-results-card');
  card.style.display = 'block';

  var fighters = {};
  for (var i = 0; i < ssResults.length; i++) fighters[ssResults[i].player_name] = 1;
  var fCount = Object.keys(fighters).length;

  document.getElementById('ss-summary').textContent =
    ssResults.length + ' rows · ' + fCount + ' fighter' + (fCount !== 1 ? 's' : '');

  var html = '';
  for (var i = 0; i < ssResults.length; i++) {
    var r = ssResults[i];
    html +=
      '<tr>' +
      '<td>' + escHtml(r.player_name) + '</td>' +
      '<td>' + escHtml(r.appearance_id) + '</td>' +
      '<td>' + escHtml(r.stat_value) + '</td>' +
      '<td style="text-align:center">' + (r.is_alt === 'TRUE' ? '&#10003;' : '') + '</td>' +
      '<td style="text-align:center">' + (r.line_replacement === 'TRUE' ? '&#10003;' : '') + '</td>' +
      '<td>' + escHtml(r.over_decimal_odds) + '</td>' +
      '<td>' + escHtml(r.under_decimal_odds) + '</td>' +
      '</tr>';
  }
  document.getElementById('ss-result-tbody').innerHTML = html;
}

// ── export ────────────────────────────────────────────────────────────────

function exportSsCSV() {
  if (!ssResults.length) return;
  var cols = ['player_name','appearance_id','stat_name','is_alt','line_replacement','stat_value','over_decimal_odds','under_decimal_odds'];
  var lines = [cols.join(',')];
  for (var i = 0; i < ssResults.length; i++) {
    var r = ssResults[i];
    lines.push(cols.map(function(c) { return csvEsc(r[c] != null ? r[c] : ''); }).join(','));
  }
  dlCSV(lines.join('\n'), 'ss_alt_upload.csv');
}

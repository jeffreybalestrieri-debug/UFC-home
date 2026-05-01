// ═══════════════════════════════════════════
// METHOD & ROUND TAB
// ═══════════════════════════════════════════

var mrFighters = [];
var mrResults  = [];
var MR_VIG     = 0.10;

function mrStatName(method, round) {
  var m = method.toUpperCase();
  var prefix = (m.indexOf('KO') >= 0 || m.indexOf('TKO') >= 0) ? 'ko' : 'sub';
  return prefix + '_round_' + round;
}

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(p) {
  if (p <= 0 || p >= 1) return null;
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round((100 / p) - 100);
}

function singleSideDevig(odds) {
  var implied = americanToProb(odds);
  var fair = implied / (1 + MR_VIG);
  return { fairPct: fair, fairOdds: probToAmerican(fair) };
}

function findAppearanceId(fighterName) {
  for (var i = 0; i < mrFighters.length; i++) {
    if (fuzzyMatch(mrFighters[i].name, fighterName)) return mrFighters[i].appearance_id;
  }
  return null;
}

// Step 1 — parse pasted odds
function parseMR() {
  var raw = document.getElementById('mr-paste').value.trim();
  if (!raw) { setMsg('mr-parse-msg','error','Nothing pasted.'); return; }

  var lines = raw.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l; });

  var entries = [];
  var i = 0;
  while (i < lines.length) {
    var label = lines[i];
    var oddsMatch = (lines[i+1] || '').match(/^([+\-]?\d+)/);
    if (!oddsMatch) { i++; continue; }
    var oddsVal = parseInt(oddsMatch[1]);

    var m = label.match(/^(.+?)\s+(KO\/TKO|Submission)\s*[&+]\s*Round\s*(\d+)$/i);
    if (m) {
      entries.push({ fighter: m[1].trim(), method: m[2].trim(), round: parseInt(m[3]), odds: oddsVal });
    }
    i += 2;
  }

  if (!entries.length) {
    setMsg('mr-parse-msg','error','Could not parse any lines. Expected: "Fighter KO/TKO & Round 1" then "+2700".');
    return;
  }

  var groups = {};
  entries.forEach(function(e) {
    if (!groups[e.fighter]) groups[e.fighter] = [];
    groups[e.fighter].push(e);
  });

  mrResults = [];
  Object.keys(groups).forEach(function(fighter) {
    groups[fighter].forEach(function(e) {
      var dv = singleSideDevig(e.odds);
      mrResults.push({
        fighter:       e.fighter,
        method:        e.method,
        round:         e.round,
        statName:      mrStatName(e.method, e.round),
        odds:          e.odds,
        impliedPct:    americanToProb(e.odds),
        fairPct:       dv.fairPct,
        fairOdds:      dv.fairOdds,
        vig:           MR_VIG,
        appearance_id: findAppearanceId(e.fighter)
      });
    });
  });

  renderMRTable();
  setMsg('mr-parse-msg','success','✅ Parsed ' + mrResults.length + ' combos across ' + Object.keys(groups).length + ' fighter(s).');
  document.getElementById('mr-appear-card').style.display = 'block';
  document.getElementById('mr-results-card').style.display = 'block';
}

// Step 2 — load appearance CSV
function handleMRAppearFile(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var list = loadFighters(ev.target.result);
    if (!list || !list.length) { setMsg('mr-appear-msg','error','Could not load fighters from CSV.'); return; }
    mrFighters = list;
    mrResults.forEach(function(r) {
      r.appearance_id = findAppearanceId(r.fighter);
    });
    var matched = mrResults.filter(function(r){ return r.appearance_id; }).length;
    var total   = mrResults.length;
    setMsg('mr-appear-msg','success','✅ Loaded ' + list.length + ' fighters. Matched ' + matched + '/' + total + ' combos.');
    renderMRTable();
  };
  reader.readAsText(file);
}

function renderMRTable() {
  var tbody = document.getElementById('mr-tbody');
  tbody.innerHTML = '';
  var lastFighter = null;
  var noId = [];

  mrResults.forEach(function(r) {
    if (r.fighter !== lastFighter) {
      lastFighter = r.fighter;
      var sep = document.createElement('tr');
      sep.innerHTML = '<td colspan="8" class="bout-sep" style="color:#f97316">🎯 ' + escHtml(r.fighter) + '</td>';
      tbody.appendChild(sep);
    }
    if (!r.appearance_id) noId.push(r.fighter);
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">' + escHtml(r.fighter) + '</td>' +
      '<td style="color:#f97316;font-family:monospace;font-size:0.75rem">' + r.statName + '</td>' +
      '<td style="color:#aaa">R' + r.round + '</td>' +
      '<td style="color:#888">' + fmtOdds(r.odds) + '</td>' +
      '<td style="color:#888">' + (r.impliedPct*100).toFixed(2) + '%</td>' +
      '<td class="fair-odds">' + (r.fairPct*100).toFixed(2) + '%</td>' +
      '<td class="fair-odds">' + (r.fairOdds !== null ? fmtOdds(r.fairOdds) : '—') + '</td>' +
      '<td>' + (r.appearance_id
        ? '<span class="uuid-ok">✓ ' + escHtml(r.appearance_id.substring(0,8)) + '…</span>'
        : '<span class="uuid-miss">—</span>') + '</td>';
    tbody.appendChild(tr);
  });

  var seen = {}, vigSummary = [];
  mrResults.forEach(function(r){
    if (!seen[r.fighter]) { seen[r.fighter]=true; vigSummary.push(r); }
  });
  document.getElementById('mr-summary').innerHTML =
    '<div class="sum-box"><span style="color:#f97316">' + mrResults.length + '</span>Combos</div>' +
    '<div class="sum-box"><span style="color:#f97316">' + vigSummary.length + '</span>Fighters</div>' +
    '<div class="sum-box"><span style="color:#888">' + (MR_VIG*100).toFixed(0) + '%</span>Vig Assumed</div>';

  var uniqueNoId = noId.filter(function(v,i,a){return a.indexOf(v)===i;});
  document.getElementById('mr-no-id-warn').innerHTML = uniqueNoId.length
    ? '<div class="warn" style="margin-top:8px">⚠ No appearance_id matched for: ' + uniqueNoId.join(', ') + '. Upload an Appearance CSV above to match.</div>'
    : '';
}

// Export: reference devig CSV
function exportMRDevig() {
  if (!mrResults.length) return;
  var lines = ['fighter,method,round,stat_name,market_odds,implied_pct,fair_pct,fair_odds,appearance_id'];
  mrResults.forEach(function(r) {
    lines.push([
      csvEsc(r.fighter), csvEsc(r.method), r.round, r.statName,
      r.odds,
      (r.impliedPct*100).toFixed(4),
      (r.fairPct*100).toFixed(4),
      r.fairOdds !== null ? r.fairOdds : '',
      csvEsc(r.appearance_id || '')
    ].join(','));
  });
  dlCSV(lines.join('\n'), 'ufc_method_round_devig.csv');
}

// Export: upload-ready CSV
function exportMRUpload() {
  var uploadRows = mrResults.filter(function(r){ return r.appearance_id && r.fairOdds !== null; });
  if (!uploadRows.length) {
    alert('No rows with both appearance_id and valid fair odds. Upload an Appearance CSV first.');
    return;
  }
  var skipped = mrResults.length - uploadRows.length;
  var lines = ['appearance_id,stat_name,stat_value,over_american_odds'];
  uploadRows.forEach(function(r) {
    lines.push([
      csvEsc(r.appearance_id),
      r.statName,
      0.5,
      r.fairOdds !== null ? r.fairOdds : ''
    ].join(','));
  });
  if (skipped > 0) alert(skipped + ' row(s) skipped (missing appearance_id or fair odds).');
  dlCSV(lines.join('\n'), 'ufc_method_round_upload.csv');
}

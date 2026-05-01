// ═══════════════════════════════════════════
// FANTASY POINTS TAB
// ═══════════════════════════════════════════

var fpFighters = [];

// Step 1 — load appearance CSV
function handleFpAppearFile(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var list = loadFighters(ev.target.result);
    if (!list) { setMsg('fp-appear-msg','error','Could not find player_name or appearance_id columns.'); return; }
    if (!list.length) { setMsg('fp-appear-msg','error','No fighter rows found.'); return; }
    fpFighters = list;
    setMsg('fp-appear-msg','success','✅ Loaded ' + fpFighters.length + ' fighters.');
    buildFpTable();
    document.getElementById('fp-entry-card').style.display = 'block';
    document.getElementById('fp-preview-card').style.display = 'none';
  };
  reader.readAsText(file);
}

// Step 2 — build entry table
function buildFpTable() {
  var tbody = document.getElementById('fp-tbody');
  tbody.innerHTML = '';
  var lastMatch = null;
  fpFighters.forEach(function(f, idx) {
    if (f.match_name && f.match_name !== lastMatch) {
      lastMatch = f.match_name;
      var sep = document.createElement('tr');
      sep.innerHTML = '<td colspan="5" class="bout-sep bout-sep-fp">🥊 ' + escHtml(f.match_name) + '</td>';
      tbody.appendChild(sep);
    }
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">' + escHtml(f.name) + '</td>' +
      '<td>' + (f.appearance_id ? '<span class="uuid-ok">✓ ' + escHtml(f.appearance_id.substring(0,8)) + '…</span>' : '<span class="uuid-miss">—</span>') + '</td>' +
      '<td><input type="number" step="0.01" class="inp-fp lbl-fp" id="fp-'+idx+'" placeholder="e.g. 32.5" oninput="markFp(this)"></td>' +
      '<td><input type="number" step="1" class="inp-fp lbl-fp" id="fp-u-'+idx+'" placeholder="-130" oninput="markFpOdds(this)"></td>' +
      '<td><input type="number" step="1" class="inp-fp lbl-fp" id="fp-o-'+idx+'" placeholder="110" oninput="markFpOdds(this)"></td>';
    tbody.appendChild(tr);
  });
}

function markFp(el) {
  var v = parseFloat(el.value);
  el.classList.remove('set','invalid');
  if (el.value === '') return;
  (!isNaN(v) && v >= 0) ? el.classList.add('set') : el.classList.add('invalid');
}

function markFpOdds(el) {
  var v = parseInt(el.value);
  el.classList.remove('set','invalid');
  if (el.value === '') return;
  (!isNaN(v) && v !== 0) ? el.classList.add('set') : el.classList.add('invalid');
}

function fillFpAll(val) {
  fpFighters.forEach(function(_, idx) {
    var el = document.getElementById('fp-' + idx);
    if (!el) return;
    el.value = val;
    if (val === '') { el.classList.remove('set','invalid'); } else { markFp(el); }
  });
}

// Step 3 — build preview
function buildFpPreview() {
  var exportRows = [], skipped = [], noId = [];
  fpFighters.forEach(function(f, idx) {
    if (!f.appearance_id) { noId.push(f.name); return; }
    var el = document.getElementById('fp-' + idx);
    var elU = document.getElementById('fp-u-' + idx);
    var elO = document.getElementById('fp-o-' + idx);
    if (!el || el.value === '') { skipped.push(f.name); return; }
    var v  = parseFloat(el.value);
    var vU = parseInt(elU.value);
    var vO = parseInt(elO.value);
    if (isNaN(v) || v < 0) { skipped.push(f.name + ' (invalid points)'); return; }
    if (!elU.value || !elO.value || isNaN(vU) || isNaN(vO)) { skipped.push(f.name + ' (missing odds)'); return; }
    exportRows.push({ name: f.name, appearance_id: f.appearance_id, points: v, under: vU, over: vO });
  });

  var msg = '';
  if (skipped.length) msg += '<div class="warn">⚠ Skipped (no points entered): ' + skipped.join(', ') + '</div>';
  if (noId.length)    msg += '<div class="warn">⚠ Skipped (no appearance_id): ' + noId.join(', ') + '</div>';
  document.getElementById('fp-entry-msg').innerHTML = msg;

  if (!exportRows.length) { document.getElementById('fp-entry-msg').innerHTML += '<div class="error">No valid rows to preview.</div>'; return; }

  var tbody = document.getElementById('fp-preview-tbody');
  tbody.innerHTML = '';
  exportRows.forEach(function(r) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">' + escHtml(r.name) + '</td>' +
      '<td style="font-family:monospace;font-size:0.75rem;color:#666">' + escHtml(r.appearance_id) + '</td>' +
      '<td style="color:#c084fc;font-weight:bold">fantasy_points</td>' +
      '<td style="color:#e8c04a;font-weight:bold">' + r.points + '</td>' +
      '<td style="color:#4ddb7a">' + fmtOdds(r.under) + '</td>' +
      '<td style="color:#4ddb7a">' + fmtOdds(r.over) + '</td>';
    tbody.appendChild(tr);
  });

  document.getElementById('fp-preview-summary').innerHTML =
    '<div class="sum-box"><span style="color:#c084fc">'+exportRows.length+'</span>Fighters</div>'+
    '<div class="sum-box"><span style="color:#888">'+skipped.length+'</span>Skipped</div>'+
    '<div class="sum-box"><span style="color:#e8c04a">'+(exportRows.reduce(function(a,r){return a+r.points;},0)/exportRows.length).toFixed(1)+'</span>Avg Pts</div>';

  window._fpExportRows = exportRows;
  document.getElementById('fp-preview-card').style.display = 'block';
}

function exportFpCSV() {
  var rows = window._fpExportRows || []; if (!rows.length) return;
  var lines = ['appearance_id,stat_name,stat_value,under_american_odds,over_american_odds'];
  rows.forEach(function(r){ lines.push([csvEsc(r.appearance_id), 'fantasy_points', r.points, r.under, r.over].join(',')); });
  dlCSV(lines.join('\n'), 'ufc_fantasy_points_upload.csv');
}

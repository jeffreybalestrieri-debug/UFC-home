// ═══════════════════════════════════════════
// PROP LINES TAB
// ═══════════════════════════════════════════

var fighters = [];

// Step 1 — load appearance CSV
function handleAppearFile(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var list = loadFighters(ev.target.result);
    if (!list) { setMsg('appear-msg','error','Could not find player_name or appearance_id columns.'); return; }
    if (!list.length) { setMsg('appear-msg','error','No fighter rows found.'); return; }
    fighters = list;
    setMsg('appear-msg','success','✅ Loaded ' + fighters.length + ' fighters.');
    buildLinesTable();
    document.getElementById('model-paste-card').style.display = 'block';
    document.getElementById('lines-card').style.display = 'block';
    document.getElementById('preview-card').style.display = 'none';
  };
  reader.readAsText(file);
}

// Step 2 — build entry table
function buildLinesTable() {
  var tbody = document.getElementById('lines-tbody');
  tbody.innerHTML = '';
  var lastMatch = null;
  fighters.forEach(function(f, idx) {
    if (f.match_name && f.match_name !== lastMatch) {
      lastMatch = f.match_name;
      var sep = document.createElement('tr');
      sep.innerHTML = '<td colspan="9" class="bout-sep bout-sep-props">🥊 ' + escHtml(f.match_name) + '</td>';
      tbody.appendChild(sep);
    }
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">' + escHtml(f.name) + '</td>' +
      '<td>' + (f.appearance_id ? '<span class="uuid-ok">✓ ' + escHtml(f.appearance_id.substring(0,8)) + '…</span>' : '<span class="uuid-miss">—</span>') + '</td>' +
      '<td><input type="number" step="0.5" min="0.5" class="inp lbl-ss" id="ss-'+idx+'" placeholder="line" oninput="markLine(this)"></td>' +
      '<td><input type="number" step="0.5" min="0.5" class="inp lbl-ft" id="ft-'+idx+'" placeholder="line" oninput="markLine(this)"></td>' +
      '<td><input type="number" step="1" class="inp inp-odds lbl-ft" id="ft-u-'+idx+'" placeholder="-130" oninput="markOdds(this)"></td>' +
      '<td><input type="number" step="1" class="inp inp-odds lbl-ft" id="ft-o-'+idx+'" placeholder="110" oninput="markOdds(this)"></td>' +
      '<td><input type="number" step="0.5" min="0.5" class="inp lbl-td" id="td-'+idx+'" placeholder="line" oninput="markLine(this)"></td>' +
      '<td><input type="number" step="1" class="inp inp-odds lbl-td" id="td-u-'+idx+'" placeholder="-130" oninput="markOdds(this)"></td>' +
      '<td><input type="number" step="1" class="inp inp-odds lbl-td" id="td-o-'+idx+'" placeholder="110" oninput="markOdds(this)"></td>';
    tbody.appendChild(tr);
  });
}

function markLine(el) {
  var v = parseFloat(el.value);
  el.classList.remove('set','invalid');
  if (el.value === '') return;
  (!isNaN(v) && v > 0 && (v*2)%1===0) ? el.classList.add('set') : el.classList.add('invalid');
}

function markOdds(el) {
  var v = parseInt(el.value);
  el.classList.remove('set','invalid');
  if (el.value === '') return;
  (!isNaN(v) && v !== 0) ? el.classList.add('set') : el.classList.add('invalid');
}

function fillCol(col, val) {
  fighters.forEach(function(_, idx) {
    var el = document.getElementById(col + '-' + idx);
    if (!el) return;
    el.value = val;
    if (val === '') { el.classList.remove('set','invalid'); } else { markLine(el); }
  });
}

// Step 3 — build preview
function buildPreview() {
  var exportRows = [], warnings = [];
  fighters.forEach(function(f, idx) {
    if (!f.appearance_id) { warnings.push(f.name + ' (no appearance_id)'); return; }
    var ssRaw = document.getElementById('ss-'+idx).value;
    var ftRaw = document.getElementById('ft-'+idx).value;
    var tdRaw = document.getElementById('td-'+idx).value;
    var ss  = parseFloat(ssRaw),  ft  = parseFloat(ftRaw),  td  = parseFloat(tdRaw);
    var ftU = parseInt(document.getElementById('ft-u-'+idx).value);
    var ftO = parseInt(document.getElementById('ft-o-'+idx).value);
    var tdU = parseInt(document.getElementById('td-u-'+idx).value);
    var tdO = parseInt(document.getElementById('td-o-'+idx).value);

    if (ssRaw !== '' && !isNaN(ss) && ss > 0)
      exportRows.push({ name:f.name, appearance_id:f.appearance_id, stat:'significant_strikes', line:ss, under:100, over:100 });

    if (ftRaw !== '') {
      if (isNaN(ft)||ft<=0) warnings.push(f.name+' fight_time: invalid line');
      else if (!document.getElementById('ft-u-'+idx).value||!document.getElementById('ft-o-'+idx).value||isNaN(ftU)||isNaN(ftO)) warnings.push(f.name+' fight_time: missing odds');
      else exportRows.push({ name:f.name, appearance_id:f.appearance_id, stat:'fight_time', line:ft, under:ftU, over:ftO });
    }
    if (tdRaw !== '') {
      if (isNaN(td)||td<=0) warnings.push(f.name+' takedowns: invalid line');
      else if (!document.getElementById('td-u-'+idx).value||!document.getElementById('td-o-'+idx).value||isNaN(tdU)||isNaN(tdO)) warnings.push(f.name+' takedowns: missing odds');
      else exportRows.push({ name:f.name, appearance_id:f.appearance_id, stat:'takedowns', line:td, under:tdU, over:tdO });
    }
  });

  document.getElementById('lines-msg').innerHTML = warnings.length
    ? '<div class="warn">⚠ Issues: ' + warnings.join(' | ') + '</div>' : '';
  if (!exportRows.length) { document.getElementById('lines-msg').innerHTML += '<div class="error">No valid rows to preview.</div>'; return; }

  var statColor = { significant_strikes:'#e8c04a', fight_time:'#4a9eff', takedowns:'#4ddb7a' };
  var tbody = document.getElementById('preview-tbody');
  tbody.innerHTML = '';
  exportRows.forEach(function(r) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fighter-name">' + escHtml(r.name) + '</td>' +
      '<td style="color:'+(statColor[r.stat]||'#aaa')+';font-weight:bold">' + r.stat + '</td>' +
      '<td style="color:#e8c04a;font-weight:bold">' + r.line + '</td>' +
      '<td style="color:#4ddb7a">' + fmtOdds(r.under) + '</td>' +
      '<td style="color:#4ddb7a">' + fmtOdds(r.over) + '</td>';
    tbody.appendChild(tr);
  });

  var ssN = exportRows.filter(function(r){return r.stat==='significant_strikes';}).length;
  var ftN = exportRows.filter(function(r){return r.stat==='fight_time';}).length;
  var tdN = exportRows.filter(function(r){return r.stat==='takedowns';}).length;
  document.getElementById('preview-summary').innerHTML =
    '<div class="sum-box"><span style="color:#e8c04a">'+exportRows.length+'</span>Total Rows</div>'+
    '<div class="sum-box"><span style="color:#e8c04a">'+ssN+'</span>Sig Strikes</div>'+
    '<div class="sum-box"><span style="color:#4a9eff">'+ftN+'</span>Fight Time</div>'+
    '<div class="sum-box"><span style="color:#4ddb7a">'+tdN+'</span>Takedowns</div>';

  window._propsExportRows = exportRows;
  document.getElementById('preview-card').style.display = 'block';
}

function exportPropsCSV() {
  var rows = window._propsExportRows || []; if (!rows.length) return;
  var lines = ['appearance_id,stat_name,stat_value,under_american_odds,over_american_odds'];
  rows.forEach(function(r){ lines.push([csvEsc(r.appearance_id), r.stat, r.line, r.under, r.over].join(',')); });
  dlCSV(lines.join('\n'), 'ufc_props_upload.csv');
}

// Model paste → auto-fill sig strikes
function parseAndFillModel() {
  var raw = document.getElementById('model-paste').value.trim();
  if (!raw) { setMsg('model-parse-msg','error','Nothing pasted.'); return; }
  if (!fighters.length) { setMsg('model-parse-msg','error','Upload appearance CSV first.'); return; }

  var lines = raw.split('\n').map(function(l){ return l.trim(); });
  var results = [];

  var sigSection = false;
  var headers    = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (/vs.*\|.*ML:/i.test(line)) { sigSection = false; headers = []; continue; }
    if (/^Sig Strikes/i.test(line)) { sigSection = true; headers = []; continue; }
    if (/^Method Props|^Round Props/i.test(line)) { sigSection = false; continue; }
    if (!sigSection) continue;

    if (/\(O\/U\)/i.test(line) || /^Prop\s/i.test(line)) {
      var stripped = line.replace(/^Prop\s*/i, '');
      var nameMatches = stripped.match(/([^\t(]+)\s*\(O\/U\)/gi);
      if (nameMatches) {
        headers = nameMatches.map(function(m){ return m.replace(/\s*\(O\/U\)/i,'').trim(); });
      } else {
        var parts = stripped.split(/\t|\s{2,}/).map(function(p){ return p.replace(/\s*\(O\/U\)/i,'').trim(); }).filter(Boolean);
        headers = parts;
      }
      continue;
    }

    if (/^Proj Strikes/i.test(line)) {
      var rest = line.replace(/^Proj Strikes\s*/i, '').trim();
      var vals = rest.split(/\s+/).map(function(p){ return p.trim(); }).filter(Boolean);
      vals.forEach(function(v, idx) {
        var num = parseFloat(v);
        if (isNaN(num) || v === '—') return;
        var name = headers[idx] || '';
        if (name) results.push({ fighter: name, proj: num });
      });
      sigSection = false;
      continue;
    }
  }

  if (!results.length) {
    setMsg('model-parse-msg','error','No Proj Strikes found. Make sure the model has loaded data for the fights.');
    return;
  }

  var filled = 0, skipped = [];
  results.forEach(function(r) {
    var idx = -1;
    for (var i = 0; i < fighters.length; i++) {
      if (fuzzyMatch(fighters[i].name, r.fighter)) { idx = i; break; }
    }
    if (idx < 0) { skipped.push(r.fighter); return; }
    var el = document.getElementById('ss-' + idx);
    if (el) { el.value = r.proj; markLine(el); filled++; }
  });

  var msg = '✅ Filled ' + filled + ' sig strike lines.';
  if (skipped.length) msg += ' Could not match: ' + skipped.join(', ');
  setMsg('model-parse-msg', filled > 0 ? 'success' : 'error', msg);
}

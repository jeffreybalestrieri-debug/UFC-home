// ═══════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════

function parseCSV(text) {
  var rows = [];
  var lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var cols = [], cur = '', inQ = false;
    for (var j = 0; j < line.length; j++) {
      var c = line[j];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function colIndex(headers, candidates) {
  for (var i = 0; i < candidates.length; i++)
    for (var j = 0; j < headers.length; j++)
      if (headers[j].toLowerCase().trim() === candidates[i].toLowerCase()) return j;
  return -1;
}

function loadFighters(text) {
  var rows = parseCSV(text);
  if (rows.length < 2) return null;
  var hdr    = rows[0];
  var iName  = colIndex(hdr, ['player_name','name','fighter','fighter_name','player']);
  var iId    = colIndex(hdr, ['appearance_id','uuid','id','appearanceid']);
  var iMatch = colIndex(hdr, ['match_name','event_name','bout','event','match']);
  if (iName < 0 || iId < 0) return null;
  var list = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var nm = r[iName]||'', id = r[iId]||'', match = iMatch>=0?(r[iMatch]||''):'';
    if (!nm && !id) continue;
    list.push({ name: nm, appearance_id: id, match_name: match });
  }
  return list;
}

function fuzzyMatch(a, b) {
  var na = a.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  var nb = b.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  return na === nb || na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0;
}

function fmtOdds(n) { return n > 0 ? '+' + n : String(n); }

function dlCSV(content, filename) {
  var blob = new Blob([content], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function setMsg(id, type, text) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = '<div class="'+(type==='error'?'error':'success')+'">'+text+'</div>';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function csvEsc(s) {
  s = String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

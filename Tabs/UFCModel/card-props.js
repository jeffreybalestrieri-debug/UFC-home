// ═══════════════════════════════════════════
// CARD PROPS TAB
// ═══════════════════════════════════════════

var cpLoaded = false;
var cpSheets = null;

async function cpLoad() {
  var el = document.getElementById('cp-status');
  el.innerHTML = '<span style="color:#22d3ee">⏳ Loading fight card data…</span>';
  document.getElementById('cp-content').innerHTML = '';
  cpLoaded = false;
  try {
    var results = await Promise.all([
      loadModelSheet(MODEL_GIDS.matchups),
      loadModelSheet(MODEL_GIDS.betting),
      loadModelSheet(MODEL_GIDS.sig_strikes),
    ]);
    cpSheets = { matchups: results[0], betting: results[1], sigStrikes: results[2] };
    cpLoaded = true;
    el.innerHTML = '';
    renderCardProps();
  } catch (e) {
    el.innerHTML = '<div class="error">Failed to load: ' + escHtml(e.message) + '</div>';
  }
}

function cpFindSS(sigStrikes, fA, fB) {
  return sigStrikes.find(function (r) {
    return (
      (r['Fighter A'] === fA && r['Fighter B'] === fB) ||
      (r['Fighter A'] === fB && r['Fighter B'] === fA)
    );
  });
}

function renderCardProps() {
  var el = document.getElementById('cp-content');
  var matchups = cpSheets.matchups;
  var betting = cpSheets.betting;
  var sigStrikes = cpSheets.sigStrikes;
  var html = '';

  matchups.forEach(function (m, idx) {
    var fA = m['Fighter_A'],
      fB = m['Fighter_B'];
    if (!fA || !fB) return;

    var bet =
      betting.find(function (b) {
        return b['Fighter A'] === fA && b['Fighter B'] === fB;
      }) || {};
    var ss = cpFindSS(sigStrikes, fA, fB);

    var ssFlipped = ss && ss['Fighter A'] === fB;
    var ssA = ss
      ? parseFloat(ssFlipped ? ss['Proj Sig Strikes B'] : ss['Proj Sig Strikes A'])
      : NaN;
    var ssB = ss
      ? parseFloat(ssFlipped ? ss['Proj Sig Strikes A'] : ss['Proj Sig Strikes B'])
      : NaN;
    var ssLineA = ss ? parseFloat(ssFlipped ? ss['Line B'] : ss['Line A']) : NaN;
    var ssLineB = ss ? parseFloat(ssFlipped ? ss['Line A'] : ss['Line B']) : NaN;
    var ssExpMins = ss ? parseFloat(ss['Exp Mins']) : NaN;

    var mktA = m['Market Odds A'];
    var mktB = m['Market Odds B'];
    var wc = m['Weight Class'] || '';

    html +=
      '<div class="cp-fight">' +
      '<div class="cp-fight-hdr" onclick="cpToggle(' +
      idx +
      ')">' +
      '<div>' +
      '<span class="cp-fname">' +
      escHtml(fA) +
      '</span>' +
      '<span class="cp-vs"> vs </span>' +
      '<span class="cp-fname">' +
      escHtml(fB) +
      '</span>' +
      '</div>' +
      '<div style="display:flex;gap:12px;align-items:center">' +
      '<span class="cp-wc">' +
      escHtml(wc) +
      '</span>' +
      (mktA
        ? '<span style="color:#aaa;font-size:0.8rem">' +
          fmtRawOdds(mktA) +
          ' / ' +
          fmtRawOdds(mktB) +
          '</span>'
        : '') +
      '<span id="cp-chev-' +
      idx +
      '" style="color:#444">▼</span>' +
      '</div>' +
      '</div>' +
      '<div id="cp-body-' +
      idx +
      '" class="cp-fight-body" style="display:none">' +
      cpFightBody(fA, fB, mktA, mktB, bet, ssA, ssB, ssLineA, ssLineB, ssExpMins) +
      '</div>' +
      '</div>';
  });

  el.innerHTML = html || '<div style="color:#555;padding:20px">No fight data available.</div>';
}

function cpFightBody(fA, fB, mktA, mktB, bet, ssA, ssB, ssLineA, ssLineB, ssExpMins) {
  var html = '';

  // Moneyline
  html += cpSection(
    'Moneyline',
    '<table class="cp-tbl"><thead><tr>' +
      '<th>Fighter</th><th>Market</th><th>Fair Odds</th>' +
      '</tr></thead><tbody>' +
      '<tr><td>' +
      escHtml(fA) +
      '</td><td>' +
      fmtRawOdds(mktA) +
      '</td><td class="cp-fair">' +
      fmtRawOdds(bet['True Fighter A']) +
      '</td></tr>' +
      '<tr><td>' +
      escHtml(fB) +
      '</td><td>' +
      fmtRawOdds(mktB) +
      '</td><td class="cp-fair">' +
      fmtRawOdds(bet['True Fighter B']) +
      '</td></tr>' +
      '</tbody></table>',
  );

  // Method props
  html += cpSection(
    'Method Props',
    '<table class="cp-tbl"><thead><tr>' +
      '<th>Fighter</th><th>KO/TKO</th><th>Sub</th><th>Decision</th>' +
      '</tr></thead><tbody>' +
      '<tr><td>' +
      escHtml(fA) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['KO A']) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['Sub A']) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['Dec A']) +
      '</td></tr>' +
      '<tr><td>' +
      escHtml(fB) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['KO B']) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['Sub B']) +
      '</td>' +
      '<td class="cp-fair">' +
      fmtRawOdds(bet['Dec B']) +
      '</td></tr>' +
      '</tbody></table>',
  );

  // Round props (only if data present)
  if (bet['R1 A'] || bet['R1 B']) {
    html += cpSection(
      'Round Props',
      '<table class="cp-tbl"><thead><tr>' +
        '<th>Fighter</th><th>R1</th><th>R2</th><th>R3+</th>' +
        '</tr></thead><tbody>' +
        '<tr><td>' +
        escHtml(fA) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R1 A']) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R2 A']) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R3+ A']) +
        '</td></tr>' +
        '<tr><td>' +
        escHtml(fB) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R1 B']) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R2 B']) +
        '</td>' +
        '<td class="cp-fair">' +
        fmtRawOdds(bet['R3+ B']) +
        '</td></tr>' +
        '</tbody></table>',
    );
  }

  // Sig strikes
  if (!isNaN(ssA) && !isNaN(ssB)) {
    var expStr = !isNaN(ssExpMins)
      ? ' <span style="color:#555;font-size:0.72rem;font-weight:normal">(Exp ' +
        ssExpMins +
        ' min)</span>'
      : '';
    html += cpSection(
      'Sig Strikes' + expStr,
      '<table class="cp-tbl"><thead><tr>' +
        '<th>Fighter</th><th>Projected</th><th>SB Line</th>' +
        '</tr></thead><tbody>' +
        '<tr><td>' +
        escHtml(fA) +
        '</td>' +
        '<td class="cp-fair">' +
        ssA.toFixed(1) +
        '</td>' +
        '<td>' +
        (isNaN(ssLineA) ? '—' : ssLineA) +
        '</td></tr>' +
        '<tr><td>' +
        escHtml(fB) +
        '</td>' +
        '<td class="cp-fair">' +
        ssB.toFixed(1) +
        '</td>' +
        '<td>' +
        (isNaN(ssLineB) ? '—' : ssLineB) +
        '</td></tr>' +
        '</tbody></table>',
    );
  }

  return html;
}

function cpSection(title, content) {
  return (
    '<div class="cp-section"><div class="cp-section-title">' + title + '</div>' + content + '</div>'
  );
}

function cpToggle(idx) {
  var body = document.getElementById('cp-body-' + idx);
  var chev = document.getElementById('cp-chev-' + idx);
  var open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  chev.textContent = open ? '▼' : '▲';
  chev.style.color = open ? '#444' : '#22d3ee';
}

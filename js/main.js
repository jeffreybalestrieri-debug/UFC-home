// ═══════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-props').className = 'tab' + (tab==='props' ? ' active-props' : '');
  document.getElementById('tab-fp').className    = 'tab' + (tab==='fp'    ? ' active-fp'    : '');
  document.getElementById('tab-mr').className    = 'tab' + (tab==='mr'    ? ' active-mr'    : '');
  document.getElementById('tab-oj').className    = 'tab' + (tab==='oj'    ? ' active-oj'    : '');
  document.getElementById('tab-ss').className    = 'tab' + (tab==='ss'    ? ' active-ss'    : '');
  if (tab === 'oj') initOjTab();
}

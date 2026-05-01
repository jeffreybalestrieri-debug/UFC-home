// ═══════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(function (p) {
    p.classList.remove('active');
  });
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-props').className = 'tab' + (tab === 'props' ? ' active-props' : '');
  document.getElementById('tab-fp').className = 'tab' + (tab === 'fp' ? ' active-fp' : '');
  document.getElementById('tab-mr').className = 'tab' + (tab === 'mr' ? ' active-mr' : '');
  document.getElementById('tab-oj').className = 'tab' + (tab === 'oj' ? ' active-oj' : '');
  document.getElementById('tab-ss').className = 'tab' + (tab === 'ss' ? ' active-ss' : '');
  document.getElementById('tab-model').className = 'tab' + (tab === 'model' ? ' active-model' : '');
  if (tab === 'oj') initOjTab();
  if (tab === 'model') initModelTab();
}

function initModelTab() {
  if (!cpSheets) cpLoad();
  mbLoad();
}

function switchModelTab(sub) {
  document.getElementById('model-panel-cp').style.display = sub === 'cp' ? 'block' : 'none';
  document.getElementById('model-panel-mb').style.display = sub === 'mb' ? 'block' : 'none';
  document.getElementById('msub-cp').className = 'model-sub-tab' + (sub === 'cp' ? ' active' : '');
  document.getElementById('msub-mb').className = 'model-sub-tab' + (sub === 'mb' ? ' active' : '');
}

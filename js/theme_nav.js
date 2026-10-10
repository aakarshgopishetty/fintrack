// ══════════════ THEME ══════════════
const darkModeMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function effectiveTheme(){
  if(state.theme==='auto') return (darkModeMediaQuery && darkModeMediaQuery.matches) ? 'dark' : 'light';
  return state.theme==='dark' ? 'dark' : 'light';
}
function applyTheme(){
  const eff = effectiveTheme();
  document.documentElement.setAttribute('data-theme', eff);
  const icon = document.getElementById('theme-icon');
  if(icon){
    icon.innerHTML = eff==='dark'
      ? '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
      : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4l-.7-.7M6.3 6.3l-.7-.7m12.8 0l-.7.7M6.3 17.7l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z"/>';
  }
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
  const seg = document.getElementById('seg-'+state.theme);
  if(seg) seg.classList.add('active');
  if(catChart || trendChart) renderAnalytics();
}
async function toggleTheme(){
  state.theme = state.theme==='light' ? 'dark' : state.theme==='dark' ? 'auto' : 'light';
  await persist('theme');
  applyTheme();
}
async function setThemeMode(mode){
  state.theme = mode;
  await persist('theme');
  applyTheme();
}
if(darkModeMediaQuery){
  darkModeMediaQuery.addEventListener('change', ()=>{ if(state.theme==='auto') applyTheme(); });
}


// ══════════════ NAVIGATION ══════════════
function switchScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='expense') renderExpenses();
  if(name==='reminder'){ renderReminders(); renderUpcomingRecurring(); }
  if(name==='profile') renderProfile();
  if(name==='analytics'){
    // Always land on Overview so the charts initialize while their container
    // is visible — Chart.js sizes to 0 if built inside a display:none parent.
    analyticsTab = 'overview';
    document.getElementById('an-tab-overview').style.display = '';
    document.getElementById('an-tab-planning').style.display = 'none';
    document.getElementById('tab-an-overview').classList.add('active');
    document.getElementById('tab-an-planning').classList.remove('active');
    renderAnalytics();
  }
  if(name==='settings'){
    updateDataUsage();
    renderBackupTimestamps();
    updatePinStatusUI();
    updateNotifStatusUI();
    renderImportHistory();
  }
}

let analyticsTab = 'overview';
function switchAnalyticsTab(tab){
  analyticsTab = tab;
  document.getElementById('tab-an-overview').classList.toggle('active', tab==='overview');
  document.getElementById('tab-an-planning').classList.toggle('active', tab==='planning');
  document.getElementById('an-tab-overview').style.display = tab==='overview' ? '' : 'none';
  document.getElementById('an-tab-planning').style.display = tab==='planning' ? '' : 'none';
  // Charts don't auto-recalculate size while their container was hidden —
  // nudge them once their card becomes visible again.
  if(tab==='overview'){
    requestAnimationFrame(()=>{
      if(catChart) catChart.resize();
      if(trendChart) trendChart.resize();
      if(nwChart) nwChart.resize();
    });
  }
}


// ══════════════ GLOBAL SEARCH ══════════════
// Searches across every data type in the app — not just the Expenses/Income
// list search, which only covers those two. Results jump you to the right
// screen/tab; exact scroll-to-item isn't attempted, just the right area.
function openGlobalSearch(){
  document.getElementById('search-modal').classList.add('open');
  const input = document.getElementById('global-search-input');
  input.value = '';
  renderGlobalSearchResults();
  setTimeout(()=>input.focus(), 80);
}
function closeGlobalSearch(e){
  if(!e||e.target===document.getElementById('search-modal'))
    document.getElementById('search-modal').classList.remove('open');
}
function globalSearchResultHtml(kind, d){
  let title, sub, amt='', amtColor='', badge;
  switch(kind){
    case 'expense':
      title = d.desc; sub = fmtDate(d.date)+' · '+d.cat; amt = '-₹'+fmtNum(d.amt); amtColor='var(--danger)'; badge='Expense'; break;
    case 'income':
      title = d.desc; sub = fmtDate(d.date)+' · '+(d.type==='fixed'?'Fixed income':'Variable income'); amt = '+₹'+fmtNum(d.amt); amtColor='var(--accent2)'; badge='Income'; break;
    case 'reminder':
      title = d.title; sub = d.due ? ('Due '+fmtDate(d.due)) : 'No due date'; badge='Reminder'; break;
    case 'goal':
      title = d.name; sub = '₹'+fmtNum(d.current)+' saved of ₹'+fmtNum(d.target); badge='Goal'; break;
    case 'loan':
      title = d.name; sub = '₹'+fmtNum(d.outstanding)+' outstanding'; badge='Loan'; break;
  }
  return `
    <div class="exp-item" style="cursor:pointer;" onclick="jumpToSearchResult('${kind}')">
      <div class="exp-icon" style="background:var(--paper);"><span style="font-size:12px;font-weight:700;color:var(--accent);">${badge[0]}</span></div>
      <div class="exp-info">
        <div class="title">${escapeHtml(title||'')} <span class="tag tag-cash" style="margin-left:4px;">${badge}</span></div>
        <div class="sub">${escapeHtml(sub||'')}</div>
      </div>
      ${amt ? `<span class="exp-amount" style="color:${amtColor};">${amt}</span>` : ''}
    </div>`;
}
function renderGlobalSearchResults(){
  const q = document.getElementById('global-search-input').value.trim().toLowerCase();
  const el = document.getElementById('global-search-results');
  if(!q){
    el.innerHTML = '<div class="empty"><p>Start typing to search</p><span>Searches expenses, income, reminders, goals and loans</span></div>';
    return;
  }
  const results = [];
  state.expenses.forEach(d=>{ if((d.desc||'').toLowerCase().includes(q) || (d.note||'').toLowerCase().includes(q)) results.push(['expense',d]); });
  state.incomes.forEach(d=>{ if((d.desc||'').toLowerCase().includes(q) || (d.note||'').toLowerCase().includes(q)) results.push(['income',d]); });
  state.reminders.forEach(d=>{ if((d.title||'').toLowerCase().includes(q) || (d.remark||'').toLowerCase().includes(q)) results.push(['reminder',d]); });
  state.savingsGoals.forEach(d=>{ if((d.name||'').toLowerCase().includes(q)) results.push(['goal',d]); });
  state.loans.forEach(d=>{ if((d.name||'').toLowerCase().includes(q)) results.push(['loan',d]); });

  if(!results.length){
    el.innerHTML = '<div class="empty"><p>No matches</p><span>Try a different search term</span></div>';
    return;
  }
  el.innerHTML = results.slice(0,100).map(([kind,d])=>globalSearchResultHtml(kind,d)).join('');
}
function jumpToSearchResult(kind){
  closeGlobalSearch();
  if(kind==='expense'){ switchScreen('expense'); if(moneyTab!=='expense') switchMoneyTab('expense'); }
  else if(kind==='income'){ switchScreen('expense'); if(moneyTab!=='income') switchMoneyTab('income'); }
  else if(kind==='reminder'){ switchScreen('reminder'); }
  else if(kind==='goal' || kind==='loan'){ switchScreen('analytics'); switchAnalyticsTab('planning'); }
}


// ══════════════ ONBOARDING ══════════════
let onboardingDismissed = false;
function maybeShowOnboarding(){
  const el = document.getElementById('onboarding-tip');
  if(!el) return;
  const isNewUser = !state.profile && !state.banks.length && !state.expenses.length && !state.incomes.length;
  el.style.display = (isNewUser && !onboardingDismissed) ? 'block' : 'none';
}
function dismissOnboarding(){
  onboardingDismissed = true;
  const el = document.getElementById('onboarding-tip');
  if(el) el.style.display = 'none';
}



// ══════════════ MONEY TABS ══════════════
let editingTransferId = null;
function openTransferModal(){
  editingTransferId = null;
  document.getElementById('transfer-modal-title').textContent = 'Add Transfer';
  document.getElementById('transfer-save-btn').textContent = 'Save Transfer';
  const today = toLocalDateStr();
  document.getElementById('tr-amt').value='';
  document.getElementById('tr-date').value = today;
  document.getElementById('tr-from').value = 'Savings Account';
  document.getElementById('tr-to').value = 'Cash';
  document.getElementById('tr-note').value='';
  document.getElementById('transfer-modal').classList.add('open');
}
function closeTransferModal(e){
  if(!e||e.target===document.getElementById('transfer-modal'))
    document.getElementById('transfer-modal').classList.remove('open');
}
async function saveTransfer(){
  const amt = parseFloat(document.getElementById('tr-amt').value);
  const date = document.getElementById('tr-date').value;
  const fromAcc = document.getElementById('tr-from').value;
  const toAcc = document.getElementById('tr-to').value;
  const note = document.getElementById('tr-note').value.trim();
  
  if (!(amt > 0)) { toast('Enter an amount above 0', 'warn'); return; }
  if (fromAcc === toAcc) { toast('Accounts must be different', 'warn'); return; }
  
  const rec = { id: uid(), amt, date, fromAcc, toAcc, note };
  state.transfers.unshift(rec);
  await persist('transfers');
  closeTransferModal();
  renderExpenses();
  renderBanks();
  toast('Transfer saved ✓');
}

function renderTransferSections(dateFilter, searchQ) {
  let list = state.transfers || [];
  if(dateFilter) list = list.filter(e=>e.date===dateFilter);
  if(searchQ) list = list.filter(e=>(e.note||'').toLowerCase().includes(searchQ));
  
  const el = document.getElementById('expense-list');
  if(!list.length){
    el.innerHTML = '<div class="empty"><p>No transfers yet</p></div>';
    return;
  }
  
  el.innerHTML = list.map(tr => `
    <div class="exp-item">
      <div class="exp-icon" style="background:var(--paper);">🔄</div>
      <div class="exp-info">
        <div class="title">${tr.fromAcc} → ${tr.toAcc}</div>
        <div class="sub">${fmtDate(tr.date)} ${tr.note ? '· '+escapeHtml(tr.note) : ''}</div>
      </div>
      <div style="text-align:right;">
        <span class="exp-amount" style="color:var(--muted);">₹${fmtNum(tr.amt)}</span>
      </div>
    </div>
  `).join('');
}

function switchMoneyTab(tab){
  moneyTab = tab;
  resetListPaging();
  document.getElementById('tab-expense').classList.toggle('active', tab==='expense');
  document.getElementById('tab-income').classList.toggle('active', tab==='income');
  document.getElementById('exp-screen-title').textContent = tab==='expense' ? 'Daily Expenses' : 'Income';
  document.getElementById('stat1-label').textContent = tab==='expense' ? "Today's Spend" : "Today's Income";
  document.getElementById('stat-week-label').textContent = tab==='expense' ? 'This Week' : 'This Week (Income)';
  document.getElementById('stat2-label').textContent = 'This Month';
  document.getElementById('list-title').textContent = tab==='expense' ? 'Transactions' : 'Income Entries';
  document.getElementById('add-money-btn').textContent = tab==='expense' ? '+ Add Expense' : (tab==='income' ? '+ Add Income' : '+ Add Transfer');
  document.getElementById('add-money-btn').setAttribute('onclick', tab==='expense' ? 'openExpModal()' : (tab==='income' ? 'openIncModal()' : 'openTransferModal()'));
  document.getElementById('add-money-btn').className = tab==='expense' ? 'btn btn-success btn-full' : 'btn btn-primary btn-full';
  populateCatFilter();
  clearExpFilters();
}
function populateCatFilter(){
  const catSel = document.getElementById('exp-filter-cat');
  const typeSel = document.getElementById('exp-filter-type');
  if(moneyTab==='income'){
    catSel.style.display='none';
    typeSel.innerHTML = '<option value="">All types</option><option value="fixed">Fixed Income</option><option value="variable">Variable Income</option>';
    return;
  }
  catSel.style.display='';
  catSel.innerHTML = '<option value="">All categories</option>' + CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  typeSel.innerHTML = '<option value="">All types</option><option value="fixed">Fixed Expense</option><option value="variable">Variable Expense</option>';
}
function clearExpFilters(){
  resetListPaging();
  document.getElementById('exp-filter-date').value='';
  document.getElementById('exp-search').value='';
  document.getElementById('exp-filter-cat').value='';
  document.getElementById('exp-filter-type').value='';
  renderExpenses();
}
function filterExpensesByCategory(cat){
  switchScreen('expense');
  if(moneyTab!=='expense') switchMoneyTab('expense');
  resetListPaging();
  document.getElementById('exp-filter-date').value='';
  document.getElementById('exp-search').value='';
  document.getElementById('exp-filter-type').value='';
  document.getElementById('exp-filter-cat').value = cat;
  renderExpenses();
  toast('Filtered to '+cat);
}


// ══════════════ RECURRING ══════════════
function nextDateFrom(dateStr, freq){
  const d = new Date(dateStr+'T00:00:00');
  if(freq==='weekly') d.setDate(d.getDate()+7);
  else d.setMonth(d.getMonth()+1);
  return toLocalDateStr(d);
}
async function applyRecurring(){
  const today = toLocalDateStr();
  let changed = false;
  ['expenses','incomes'].forEach(key=>{
    const newItems = [];
    state[key].forEach(item=>{
      if(!item.recur) return;
      let guard = 0;
      while(item.recur.nextDate && item.recur.nextDate <= today && guard < 24){
        newItems.push({...item, id: uid(), date: item.recur.nextDate, recur: null});
        item.recur.nextDate = nextDateFrom(item.recur.nextDate, item.recur.freq);
        changed = true;
        guard++;
      }
    });
    if (newItems.length) state[key].unshift(...newItems);
  });
  if(changed){ await persist('expenses'); await persist('incomes'); }
}
function renderUpcomingRecurring(){
  const el = document.getElementById('upcoming-recur-list');
  if(!el) return;
  const today = toLocalDateStr();
  const horizon = new Date(); horizon.setDate(horizon.getDate()+30);
  const horizonStr = horizon.toISOString().split('T')[0];
  const items = [];
  state.expenses.forEach(e=>{ if(e.recur && e.recur.nextDate && e.recur.nextDate<=horizonStr) items.push({...e, kind:'expense'}); });
  state.incomes.forEach(e=>{ if(e.recur && e.recur.nextDate && e.recur.nextDate<=horizonStr) items.push({...e, kind:'income'}); });
  items.sort((a,b)=> a.recur.nextDate.localeCompare(b.recur.nextDate));
  if(!items.length){
    el.innerHTML = '<div class="empty"><p>No recurring transactions set up</p><span>Mark an expense or income as repeating to see it here</span></div>';
    return;
  }
  el.innerHTML = items.map(it=>{
    const days = Math.round((new Date(it.recur.nextDate)-new Date(today))/86400000);
    const dueLabel = days<=0 ? 'Due today' : days===1 ? 'Due tomorrow' : `In ${days} days`;
    const dueClass = days<=0 ? 'due-today' : days<=3 ? 'due-soon' : 'due-ok';
    const isExp = it.kind==='expense';
    return `
    <div class="rem-item">
      <div class="exp-icon" style="background:var(--paper);width:36px;height:36px;flex-shrink:0;">${isExp?catBadge(it.cat):incomeTypeBadge(it.type)}</div>
      <div class="rem-info">
        <div class="title">${escapeHtml(it.desc)}<span class="recur-badge">↻ ${it.recur.freq}</span></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap;">
          <span class="due ${dueClass}">${dueLabel} · ${fmtDate(it.recur.nextDate)}</span>
        </div>
      </div>
      <span class="exp-amount" style="${isExp?'':'color:var(--accent2);'}">${isExp?'-':'+'}₹${fmtNum(it.amt)}</span>
    </div>`;
  }).join('');
}


// ══════════════ EXPENSES ══════════════
function openExpModal(){
  editingExpenseId = null;
  document.getElementById('exp-modal-title').textContent = 'Add Expense';
  document.getElementById('exp-save-btn').textContent = 'Save Expense';
  const today = toLocalDateStr();
  document.getElementById('e-desc').value='';
  document.getElementById('e-amt').value='';
  document.getElementById('e-note').value='';
  document.getElementById('e-date').value = today;
  document.getElementById('e-cat').value = CATEGORIES[0];
  document.getElementById('e-type').value = 'variable';
  document.getElementById('e-acc').value = 'Savings Account';
  document.getElementById('e-recur').checked = false;
  document.getElementById('e-recur-freq').value = 'monthly';
  document.getElementById('e-recur-freq-wrap').style.display = 'none';
  ['fld-e-desc','fld-e-amt','fld-e-date'].forEach(id=>markInvalid(id,false));
  document.getElementById('exp-modal').classList.add('open');
}
function editExpense(id){
  const e = state.expenses.find(x=>x.id===id);
  if(!e) return;
  editingExpenseId = id;
  document.getElementById('exp-modal-title').textContent = 'Edit Expense';
  document.getElementById('exp-save-btn').textContent = 'Save Changes';
  document.getElementById('e-desc').value = e.desc;
  document.getElementById('e-amt').value  = e.amt;
  document.getElementById('e-date').value = e.date;
  document.getElementById('e-cat').value  = e.cat;
  document.getElementById('e-type').value = e.type || 'variable';
  document.getElementById('e-acc').value  = e.acc;
  document.getElementById('e-note').value = e.note || '';
  document.getElementById('e-recur').checked = !!e.recur;
  document.getElementById('e-recur-freq').value = e.recur ? e.recur.freq : 'monthly';
  document.getElementById('e-recur-freq-wrap').style.display = e.recur ? 'block' : 'none';
  document.getElementById('exp-modal').classList.add('open');
}
function closeExpModal(e){
  if(!e||e.target===document.getElementById('exp-modal'))
    document.getElementById('exp-modal').classList.remove('open');
}
async function saveExpense(){
  const desc = document.getElementById('e-desc').value.trim();
  const amt  = parseFloat(document.getElementById('e-amt').value);
  const date = document.getElementById('e-date').value;
  let ok = true;
  markInvalid('fld-e-desc', !desc); if(!desc) ok=false;
  markInvalid('fld-e-amt', !(amt>0)); if(!(amt>0)) ok=false;
  markInvalid('fld-e-date', !date); if(!date) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  const cat = document.getElementById('e-cat').value;
  const doesRecur = document.getElementById('e-recur').checked;
  const freq = document.getElementById('e-recur-freq').value;
  const rec = {
    id: editingExpenseId!==null ? editingExpenseId : uid(),
    desc, amt, date, cat,
    type : document.getElementById('e-type').value,
    acc  : document.getElementById('e-acc').value,
    note : document.getElementById('e-note').value.trim(),
    recur: doesRecur ? { freq, nextDate: nextDateFrom(date, freq) } : null,
  };
  if(editingExpenseId!==null){
    const idx = state.expenses.findIndex(x=>x.id===editingExpenseId);
    if(idx>-1) state.expenses[idx] = rec;
  } else {
    state.expenses.unshift(rec);
  }
  await persist('expenses');
  closeExpModal();
  renderExpenses();
  checkBudgetAlert(cat, date);
  toast(editingExpenseId!==null?'Expense updated ✓':'Expense saved ✓');
}
function deleteExpense(id){
  const item = state.expenses.find(e=>e.id===id);
  if(!item) return;
  const idx = state.expenses.indexOf(item);
  undoDelete(item.desc||'Expense',
    async ()=>{ state.expenses.splice(idx,1); await persist('expenses'); renderExpenses(); },
    async ()=>{ state.expenses.splice(idx,0,item); await persist('expenses'); renderExpenses(); }
  );
}


// ══════════════ INCOME ══════════════
function openIncModal(){
  editingIncomeId = null;
  document.getElementById('inc-modal-title').textContent = 'Add Income';
  document.getElementById('inc-save-btn').textContent = 'Save Income';
  const today = toLocalDateStr();
  document.getElementById('i-desc').value='';
  document.getElementById('i-amt').value='';
  document.getElementById('i-note').value='';
  document.getElementById('i-date').value = today;
  document.getElementById('i-type').value = 'fixed';
  document.getElementById('i-acc').value = 'Savings Account';
  document.getElementById('i-recur').checked = false;
  document.getElementById('i-recur-freq').value = 'monthly';
  document.getElementById('i-recur-freq-wrap').style.display = 'none';
  ['fld-i-desc','fld-i-amt','fld-i-date'].forEach(id=>markInvalid(id,false));
  document.getElementById('inc-modal').classList.add('open');
}
function editIncome(id){
  const e = state.incomes.find(x=>x.id===id);
  if(!e) return;
  editingIncomeId = id;
  document.getElementById('inc-modal-title').textContent = 'Edit Income';
  document.getElementById('inc-save-btn').textContent = 'Save Changes';
  document.getElementById('i-desc').value = e.desc;
  document.getElementById('i-amt').value  = e.amt;
  document.getElementById('i-date').value = e.date;
  document.getElementById('i-type').value = e.type || 'variable';
  document.getElementById('i-acc').value  = e.acc;
  document.getElementById('i-note').value = e.note || '';
  document.getElementById('i-recur').checked = !!e.recur;
  document.getElementById('i-recur-freq').value = e.recur ? e.recur.freq : 'monthly';
  document.getElementById('i-recur-freq-wrap').style.display = e.recur ? 'block' : 'none';
  document.getElementById('inc-modal').classList.add('open');
}
function closeIncModal(e){
  if(!e||e.target===document.getElementById('inc-modal'))
    document.getElementById('inc-modal').classList.remove('open');
}
async function saveIncome(){
  const desc = document.getElementById('i-desc').value.trim();
  const amt  = parseFloat(document.getElementById('i-amt').value);
  const date = document.getElementById('i-date').value;
  let ok = true;
  markInvalid('fld-i-desc', !desc); if(!desc) ok=false;
  markInvalid('fld-i-amt', !(amt>0)); if(!(amt>0)) ok=false;
  markInvalid('fld-i-date', !date); if(!date) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  const doesRecur = document.getElementById('i-recur').checked;
  const freq = document.getElementById('i-recur-freq').value;
  const rec = {
    id: editingIncomeId!==null ? editingIncomeId : uid(),
    desc, amt, date,
    type : document.getElementById('i-type').value,
    acc  : document.getElementById('i-acc').value,
    note : document.getElementById('i-note').value.trim(),
    recur: doesRecur ? { freq, nextDate: nextDateFrom(date, freq) } : null,
  };
  if(editingIncomeId!==null){
    const idx = state.incomes.findIndex(x=>x.id===editingIncomeId);
    if(idx>-1) state.incomes[idx] = rec;
  } else {
    state.incomes.unshift(rec);
  }
  await persist('incomes');
  closeIncModal();
  renderExpenses();
  toast(editingIncomeId!==null?'Income updated ✓':'Income saved ✓');
}
function deleteIncome(id){
  const item = state.incomes.find(e=>e.id===id);
  if(!item) return;
  const idx = state.incomes.indexOf(item);
  undoDelete(item.desc||'Income',
    async ()=>{ state.incomes.splice(idx,1); await persist('incomes'); renderExpenses(); },
    async ()=>{ state.incomes.splice(idx,0,item); await persist('incomes'); renderExpenses(); }
  );
}


// ══════════════ RENDER EXPENSE/INCOME LIST ══════════════
function renderExpenses(){
  const today = toLocalDateStr();
  const dateFilter = document.getElementById('exp-filter-date').value;
  const searchQ = (document.getElementById('exp-search').value||'').trim().toLowerCase();
  const catFilter = document.getElementById('exp-filter-cat').value;
  const typeFilter = document.getElementById('exp-filter-type').value;

  const d = new Date(); const opts={weekday:'long',month:'long',day:'numeric'};
  document.getElementById('exp-date-label').textContent = d.toLocaleDateString('en-IN',opts);

  const source = moneyTab==='income' ? state.incomes : state.expenses;

  const todayTotal = source.filter(e=>e.date===today).reduce((s,e)=>s+e.amt,0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate()-6);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekTotal = source.filter(e=>e.date && e.date>=weekStartStr && e.date<=today).reduce((s,e)=>s+e.amt,0);
  const monthTotal = source.filter(e=>e.date&&e.date.startsWith(today.slice(0,7))).reduce((s,e)=>s+e.amt,0);
  document.getElementById('today-spend').textContent = '₹'+fmtNum(todayTotal);
  document.getElementById('week-spend').textContent = '₹'+fmtNum(weekTotal);
  document.getElementById('month-spend').textContent = '₹'+fmtNum(monthTotal);

  const monthIncome = state.incomes.filter(e=>e.date&&e.date.startsWith(today.slice(0,7))).reduce((s,e)=>s+e.amt,0);
  const monthExpense = state.expenses.filter(e=>e.date&&e.date.startsWith(today.slice(0,7))).reduce((s,e)=>s+e.amt,0);
  const net = monthIncome - monthExpense;
  const netEl = document.getElementById('month-net');
  netEl.textContent = (net<0?'-':'')+'₹'+fmtNum(Math.abs(net));
  netEl.style.color = net<0 ? 'var(--danger)' : 'var(--accent2)';

  if(moneyTab==='income'){ renderIncomeSections(dateFilter, searchQ, typeFilter); return; }
  if(moneyTab==='transfer'){ renderTransferSections(dateFilter, searchQ); return; }
  renderExpenseSections(dateFilter, searchQ, catFilter, typeFilter);
}

function expenseItemHtml(e){
  return `
    <div class="exp-item">
      <div class="exp-icon" style="background:var(--paper);">${catBadge(e.cat)}</div>
      <div class="exp-info">
        <div class="title">${escapeHtml(e.desc)}${e.recur?`<span class="recur-badge">↻ ${e.recur.freq}</span>`:''}</div>
        <div class="sub">
          <span class="tag ${bankTypeTag[e.acc]||'tag-cash'}">${e.acc}</span>
          · ${fmtDate(e.date)}
          ${e.note?'· '+escapeHtml(e.note):''}
        </div>
      </div>
      <div style="text-align:right;display:flex;align-items:center;gap:2px;">
        <span class="exp-amount">₹${fmtNum(e.amt)}</span>
        <div class="item-actions">
          <button class="btn-dup" onclick="duplicateExpense(${e.id})" title="Duplicate as today's expense"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-3M8 8H5a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M8 8h6a2 2 0 012 2v6"/></svg></button>
          <button class="btn-edit" onclick="editExpense(${e.id})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-danger" onclick="deleteExpense(${e.id})">✕</button>
        </div>
      </div>
    </div>`;
}
async function duplicateExpense(id){
  const src = state.expenses.find(x=>x.id===id);
  if(!src) return;
  const today = toLocalDateStr();
  const clone = {...src, id: uid(), date: today, recur: null};
  state.expenses.unshift(clone);
  await persist('expenses');
  renderExpenses();
  checkBudgetAlert(clone.cat, clone.date);
  toast('Duplicated as today\'s expense ✓');
}


// ══════════════ LIST PAGINATION ("Show more") ══════════════
// Avoids rendering unbounded DOM for accounts with thousands of entries —
// each section renders a capped page and grows on demand instead of dumping
// the full list into innerHTML every time.
let listPageSizes = { 'exp-fixed':20, 'exp-variable':20, 'inc-fixed':20, 'inc-variable':20 };
function resetListPaging(){
  Object.keys(listPageSizes).forEach(k=>listPageSizes[k]=20);
}
function showMoreList(key){
  listPageSizes[key] = (listPageSizes[key]||20) + 20;
  renderExpenses();
}
function renderPagedGroup(sectionKey, fullList, mapFn){
  const pageSize = listPageSizes[sectionKey] || 20;
  const visible = fullList.slice(0, pageSize);
  const itemsHtml = visible.map(mapFn).join('');
  const remaining = fullList.length - pageSize;
  const moreHtml = remaining > 0
    ? `<div class="show-more-row"><button class="btn btn-outline" onclick="showMoreList('${sectionKey}')">Show ${Math.min(20,remaining)} more (${remaining} left)</button></div>`
    : '';
  return itemsHtml + moreHtml;
}

function renderExpenseSections(dateFilter, searchQ, catFilter, typeFilter){
  let list = state.expenses;
  if(dateFilter) list = list.filter(e=>e.date===dateFilter);
  if(catFilter) list = list.filter(e=>e.cat===catFilter);
  if(typeFilter) list = list.filter(e=>(e.type||'variable')===typeFilter);
  if(searchQ) list = list.filter(e=>(e.desc||'').toLowerCase().includes(searchQ) || (e.note||'').toLowerCase().includes(searchQ));

  const el = document.getElementById('expense-list');
  const filtering = !!(dateFilter||catFilter||typeFilter||searchQ);
  if(!list.length){
    el.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path stroke-linecap="round" d="M2 10h20"/></svg><p>'+(filtering?'No expenses match':'No expenses yet')+'</p><span>'+(filtering?'Try different filters':'Tap "+ Add" to log your first one')+'</span></div>';
    return;
  }

  const fixedList = list.filter(e=>(e.type||'variable')==='fixed');
  const variableList = list.filter(e=>(e.type||'variable')==='variable');
  const fixedTotal = fixedList.reduce((s,e)=>s+e.amt,0);
  const variableTotal = variableList.reduce((s,e)=>s+e.amt,0);

  let html = '';
  html += `<div class="income-group">
    <div class="income-subhead">
      <span class="name"><span class="dot" style="background:${EXPENSE_TYPE_COLOR.fixed};"></span>Fixed Expenses <span class="tag tag-fixed">${fixedList.length}</span></span>
      <span class="total" style="color:var(--danger);">₹${fmtNum(fixedTotal)}</span>
    </div>
    ${fixedList.length ? renderPagedGroup('exp-fixed', fixedList, expenseItemHtml) : '<div class="empty" style="padding:20px 0;"><span>No fixed expenses in this view</span></div>'}
  </div>`;
  html += `<div class="income-group">
    <div class="income-subhead">
      <span class="name"><span class="dot" style="background:${EXPENSE_TYPE_COLOR.variable};"></span>Variable Expenses <span class="tag tag-variable">${variableList.length}</span></span>
      <span class="total" style="color:var(--danger);">₹${fmtNum(variableTotal)}</span>
    </div>
    ${variableList.length ? renderPagedGroup('exp-variable', variableList, expenseItemHtml) : '<div class="empty" style="padding:20px 0;"><span>No variable expenses in this view</span></div>'}
  </div>`;
  el.innerHTML = html;
}

function incomeItemHtml(e){
  return `
    <div class="exp-item">
      <div class="exp-icon" style="background:var(--paper);">${incomeTypeBadge(e.type)}</div>
      <div class="exp-info">
        <div class="title">${escapeHtml(e.desc)}${e.recur?`<span class="recur-badge">↻ ${e.recur.freq}</span>`:''}</div>
        <div class="sub">
          <span class="tag ${bankTypeTag[e.acc]||'tag-cash'}">${e.acc}</span>
          · ${fmtDate(e.date)}
          ${e.note?'· '+escapeHtml(e.note):''}
        </div>
      </div>
      <div style="text-align:right;display:flex;align-items:center;gap:2px;">
        <span class="exp-amount" style="color:var(--accent2);">+₹${fmtNum(e.amt)}</span>
        <div class="item-actions">
          <button class="btn-dup" onclick="duplicateIncome(${e.id})" title="Duplicate as today's income"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-3M8 8H5a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M8 8h6a2 2 0 012 2v6"/></svg></button>
          <button class="btn-edit" onclick="editIncome(${e.id})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-danger" onclick="deleteIncome(${e.id})">✕</button>
        </div>
      </div>
    </div>`;
}
async function duplicateIncome(id){
  const src = state.incomes.find(x=>x.id===id);
  if(!src) return;
  const today = toLocalDateStr();
  const clone = {...src, id: uid(), date: today, recur: null};
  state.incomes.unshift(clone);
  await persist('incomes');
  renderExpenses();
  toast('Duplicated as today\'s income ✓');
}

function renderIncomeSections(dateFilter, searchQ, typeFilter){
  let list = state.incomes;
  if(dateFilter) list = list.filter(e=>e.date===dateFilter);
  if(typeFilter) list = list.filter(e=>(e.type||'variable')===typeFilter);
  if(searchQ) list = list.filter(e=>(e.desc||'').toLowerCase().includes(searchQ) || (e.note||'').toLowerCase().includes(searchQ));

  const el = document.getElementById('expense-list');
  const filtering = !!(dateFilter||typeFilter||searchQ);
  if(!list.length){
    el.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path stroke-linecap="round" d="M2 10h20"/></svg><p>'+(filtering?'No income entries match':'No income entries yet')+'</p><span>'+(filtering?'Try different filters':'Tap "+ Add" to log your first one')+'</span></div>';
    return;
  }

  const fixedList = list.filter(e=>(e.type||'variable')==='fixed');
  const variableList = list.filter(e=>(e.type||'variable')==='variable');
  const fixedTotal = fixedList.reduce((s,e)=>s+e.amt,0);
  const variableTotal = variableList.reduce((s,e)=>s+e.amt,0);

  let html = '';

  html += `<div class="income-group">
    <div class="income-subhead">
      <span class="name"><span class="dot" style="background:${INCOME_TYPE_COLOR.fixed};"></span>Fixed Income <span class="tag tag-fixed">${fixedList.length}</span></span>
      <span class="total">₹${fmtNum(fixedTotal)}</span>
    </div>
    ${fixedList.length ? renderPagedGroup('inc-fixed', fixedList, incomeItemHtml) : '<div class="empty" style="padding:20px 0;"><span>No fixed income entries in this view</span></div>'}
  </div>`;

  html += `<div class="income-group">
    <div class="income-subhead">
      <span class="name"><span class="dot" style="background:${INCOME_TYPE_COLOR.variable};"></span>Variable Income <span class="tag tag-variable">${variableList.length}</span></span>
      <span class="total">₹${fmtNum(variableTotal)}</span>
    </div>
    ${variableList.length ? renderPagedGroup('inc-variable', variableList, incomeItemHtml) : '<div class="empty" style="padding:20px 0;"><span>No variable income entries in this view</span></div>'}
  </div>`;

  el.innerHTML = html;
}

function exportCSV(){
  const isIncome = moneyTab==='income';
  const source = isIncome ? state.incomes : state.expenses;
  if(!source.length){ toast('Nothing to export yet','warn'); return; }
  const rows = isIncome
    ? [['Date','Source','Type','Account','Amount','Note']]
    : [['Date','Description','Category','Type','Account','Amount','Note']];
  [...source].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{
    rows.push(isIncome
      ? [e.date, e.desc, e.type||'variable', e.acc, e.amt, e.note||'']
      : [e.date, e.desc, e.cat||'', e.type||'variable', e.acc, e.amt, e.note||'']);
  });
  const csv = rows.map(r=>r.map(v=>{
    const s = String(v??'');
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = isIncome ? 'fintrack-income.csv' : 'fintrack-expenses.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exported ✓');
}



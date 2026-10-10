// ══════════════ SAVINGS GOALS ══════════════
function openGoalModal(){
  editingGoalId = null;
  document.getElementById('goal-modal-title').textContent = 'Add Savings Goal';
  document.getElementById('goal-save-btn').textContent = 'Add Goal';
  document.getElementById('g-name').value='';
  document.getElementById('g-target').value='';
  document.getElementById('g-current').value='';
  document.getElementById('g-date').value='';
  markInvalid('fld-g-name', false);
  markInvalid('fld-g-target', false);
  document.getElementById('goal-modal').classList.add('open');
}
function editGoal(id){
  const g = state.savingsGoals.find(x=>x.id===id);
  if(!g) return;
  editingGoalId = id;
  document.getElementById('goal-modal-title').textContent = 'Edit Savings Goal';
  document.getElementById('goal-save-btn').textContent = 'Save Changes';
  document.getElementById('g-name').value = g.name;
  document.getElementById('g-target').value = g.target;
  document.getElementById('g-current').value = g.current;
  document.getElementById('g-date').value = g.date || '';
  document.getElementById('goal-modal').classList.add('open');
}
function closeGoalModal(e){
  if(!e||e.target===document.getElementById('goal-modal'))
    document.getElementById('goal-modal').classList.remove('open');
}
async function saveGoal(){
  const name = document.getElementById('g-name').value.trim();
  const target = parseFloat(document.getElementById('g-target').value);
  let ok = true;
  markInvalid('fld-g-name', !name); if(!name) ok=false;
  markInvalid('fld-g-target', !(target>0)); if(!(target>0)) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  const rec = {
    id: editingGoalId!==null ? editingGoalId : uid(),
    name, target,
    current: parseFloat(document.getElementById('g-current').value)||0,
    date: document.getElementById('g-date').value,
  };
  if(editingGoalId!==null){
    const idx = state.savingsGoals.findIndex(g=>g.id===editingGoalId);
    if(idx>-1) state.savingsGoals[idx] = rec;
  } else {
    state.savingsGoals.unshift(rec);
  }
  await persist('savingsGoals');
  closeGoalModal();
  renderGoals();
  toast(editingGoalId!==null?'Goal updated ✓':'Goal added ✓');
}
function deleteGoal(id){
  const item = state.savingsGoals.find(g=>g.id===id);
  if(!item) return;
  const idx = state.savingsGoals.indexOf(item);
  undoDelete(item.name||'Goal',
    async ()=>{ state.savingsGoals.splice(idx,1); await persist('savingsGoals'); renderGoals(); },
    async ()=>{ state.savingsGoals.splice(idx,0,item); await persist('savingsGoals'); renderGoals(); }
  );
}
async function addGoalContribution(id, inputId){
  const amt = parseFloat(document.getElementById(inputId).value);
  if(!(amt>0)){ toast('Enter an amount above 0','warn'); return; }
  const g = state.savingsGoals.find(x=>x.id===id);
  if(!g) return;
  g.current = (g.current||0) + amt;
  document.getElementById(inputId).value = '';
  await persist('savingsGoals');
  renderGoals();
  toast('Contribution added ✓');
}
function renderGoals(){
  const el = document.getElementById('goal-list');
  if(!state.savingsGoals.length){
    el.innerHTML = '<div class="empty"><p>No savings goals yet</p><span>Set a target and track your progress</span></div>';
    return;
  }
  el.innerHTML = state.savingsGoals.map(g=>{
    const pct = g.target>0 ? Math.min(100, (g.current/g.target)*100) : 0;
    const done = g.current >= g.target;
    const remaining = Math.max(0, g.target - g.current);
    return `
    <div class="goal-item">
      <div class="goal-head">
        <div>
          <div class="name">${escapeHtml(g.name)}</div>
          <div class="sub">${g.date ? 'Target: '+fmtDate(g.date) : 'No target date'}</div>
        </div>
        <div class="amts"><b>₹${fmtNum(g.current)}</b> / ₹${fmtNum(g.target)}</div>
      </div>
      <div class="goal-track"><div class="goal-fill ${done?'done':''}" style="width:${pct}%;"></div></div>
      <div class="goal-foot">
        <span class="goal-pct ${done?'done':''}">${done ? '🎉 Goal reached' : Math.round(pct)+'% · ₹'+fmtNum(remaining)+' to go'}</span>
        <div class="item-actions">
          <button class="btn-edit" onclick="editGoal(${g.id})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-danger" onclick="deleteGoal(${g.id})">✕</button>
        </div>
      </div>
      ${!done ? `
      <div class="goal-add-row" style="margin-top:10px;">
        <input type="number" min="0" placeholder="Add ₹" id="goal-add-${g.id}"/>
        <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="addGoalContribution(${g.id},'goal-add-${g.id}')">+ Contribute</button>
      </div>` : ''}
    </div>`;
  }).join('');
}


// ══════════════ LOANS ══════════════
function openLoanModal(){
  editingLoanId = null;
  document.getElementById('loan-modal-title').textContent = 'Add Loan';
  document.getElementById('loan-save-btn').textContent = 'Add Loan';
  document.getElementById('l-name').value='';
  document.getElementById('l-principal').value='';
  document.getElementById('l-rate').value='';
  document.getElementById('l-emi').value='';
  document.getElementById('l-tenure').value='';
  document.getElementById('l-outstanding').value='';
  document.getElementById('l-start').value = toLocalDateStr();
  markInvalid('fld-l-name', false);
  markInvalid('fld-l-principal', false);
  markInvalid('fld-l-emi', false);
  document.getElementById('loan-modal').classList.add('open');
}
function editLoan(id){
  const l = state.loans.find(x=>x.id===id);
  if(!l) return;
  editingLoanId = id;
  document.getElementById('loan-modal-title').textContent = 'Edit Loan';
  document.getElementById('loan-save-btn').textContent = 'Save Changes';
  document.getElementById('l-name').value = l.name;
  document.getElementById('l-principal').value = l.principal;
  document.getElementById('l-rate').value = l.rate || '';
  document.getElementById('l-emi').value = l.emi;
  document.getElementById('l-tenure').value = l.tenure || '';
  document.getElementById('l-outstanding').value = l.outstanding;
  document.getElementById('l-start').value = l.start || '';
  document.getElementById('loan-modal').classList.add('open');
}
function closeLoanModal(e){
  if(!e||e.target===document.getElementById('loan-modal'))
    document.getElementById('loan-modal').classList.remove('open');
}
async function saveLoan(){
  const name = document.getElementById('l-name').value.trim();
  const principal = parseFloat(document.getElementById('l-principal').value);
  const emi = parseFloat(document.getElementById('l-emi').value);
  let ok = true;
  markInvalid('fld-l-name', !name); if(!name) ok=false;
  markInvalid('fld-l-principal', !(principal>0)); if(!(principal>0)) ok=false;
  markInvalid('fld-l-emi', !(emi>0)); if(!(emi>0)) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  const outstandingInput = document.getElementById('l-outstanding').value;
  const rec = {
    id: editingLoanId!==null ? editingLoanId : uid(),
    name, principal, emi,
    rate: parseFloat(document.getElementById('l-rate').value)||0,
    tenure: parseInt(document.getElementById('l-tenure').value)||0,
    outstanding: outstandingInput!=='' ? parseFloat(outstandingInput) : (editingLoanId!==null ? (state.loans.find(l=>l.id===editingLoanId)?.outstanding ?? principal) : principal),
    start: document.getElementById('l-start').value,
  };
  if(editingLoanId!==null){
    const idx = state.loans.findIndex(l=>l.id===editingLoanId);
    if(idx>-1) state.loans[idx] = rec;
  } else {
    state.loans.unshift(rec);
  }
  await persist('loans');
  closeLoanModal();
  renderLoans();
  toast(editingLoanId!==null?'Loan updated ✓':'Loan added ✓');
}
function deleteLoan(id){
  const item = state.loans.find(l=>l.id===id);
  if(!item) return;
  const idx = state.loans.indexOf(item);
  undoDelete(item.name||'Loan',
    async ()=>{ state.loans.splice(idx,1); await persist('loans'); renderLoans(); },
    async ()=>{ state.loans.splice(idx,0,item); await persist('loans'); renderLoans(); }
  );
}
async function recordLoanPayment(id, inputId){
  const amt = parseFloat(document.getElementById(inputId).value);
  if(!(amt>0)){ toast('Enter an amount above 0','warn'); return; }
  const l = state.loans.find(x=>x.id===id);
  if(!l) return;
  l.outstanding = Math.max(0, (l.outstanding||0) - amt);
  document.getElementById(inputId).value = '';
  await persist('loans');
  renderLoans();
  toast('Payment recorded ✓');
}
function monthsRemaining(l){
  if(!(l.emi>0) || l.outstanding<=0) return 0;
  return Math.ceil(l.outstanding / l.emi);
}
function payoffDateLabel(l){
  const months = monthsRemaining(l);
  if(months<=0) return null;
  const d = new Date();
  d.setMonth(d.getMonth()+months);
  return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'});
}
function loanSparklineSvg(l){
  // Simple straight-line projection: outstanding balance falling by a fixed
  // EMI each month until paid off. Ignores interest/rate changes — it's a
  // rough payoff shape, not an amortization schedule.
  const months = monthsRemaining(l);
  if(months<=0 || !(l.emi>0)) return '';
  const points = [];
  const stepCount = Math.min(months, 24); // cap plotted points for readability
  for(let i=0;i<=stepCount;i++){
    const m = Math.round((i/stepCount)*months);
    const val = Math.max(0, l.outstanding - l.emi*m);
    points.push(val);
  }
  const w = 280, h = 40, pad = 3;
  const max = Math.max(...points, 1);
  const xs = points.map((_,i)=> pad + (i/(points.length-1))*(w-pad*2));
  const ys = points.map(v=> h-pad - (v/max)*(h-pad*2));
  const path = xs.map((x,i)=> (i===0?'M':'L')+x.toFixed(1)+','+ys[i].toFixed(1)).join(' ');
  const areaPath = path + ` L${xs[xs.length-1].toFixed(1)},${h} L${xs[0].toFixed(1)},${h} Z`;
  return `
    <div class="loan-spark">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${areaPath}" fill="var(--accent)" opacity="0.12"/>
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="spark-label"><span>Today</span><span>Projected payoff</span></div>
    </div>`;
}
function renderLoans(){
  const el = document.getElementById('loan-list');
  if(!state.loans.length){
    el.innerHTML = '<div class="empty"><p>No loans added yet</p><span>Track EMIs, interest rates and payoff progress</span></div>';
    return;
  }
  el.innerHTML = state.loans.map(l=>{
    const paidOff = l.principal - l.outstanding;
    const pct = l.principal>0 ? Math.min(100, (paidOff/l.principal)*100) : 0;
    const done = l.outstanding<=0;
    const months = monthsRemaining(l);
    const payoff = payoffDateLabel(l);
    return `
    <div class="loan-item">
      <div class="loan-head">
        <div>
          <div class="name">${escapeHtml(l.name)}</div>
          <div class="sub">${l.rate>0 ? l.rate+'% p.a.' : 'No interest rate set'}${l.tenure>0 ? ' · '+l.tenure+' mo tenure' : ''}</div>
        </div>
        <div class="amts"><b>₹${fmtNum(l.outstanding)}</b> / ₹${fmtNum(l.principal)}</div>
      </div>
      <div class="loan-track"><div class="loan-fill ${done?'done':''}" style="width:${pct}%;"></div></div>
      <div class="loan-meta">
        <span>EMI: <b>₹${fmtNum(l.emi)}</b></span>
        ${!done ? `<span>Months left: <b>${months}</b></span>` : ''}
        ${!done && payoff ? `<span>Payoff: <b>${payoff}</b></span>` : ''}
      </div>
      <div class="loan-foot">
        <span class="loan-pct ${done?'done':''}">${done ? '✓ Paid off' : Math.round(pct)+'% paid off'}</span>
        <div class="item-actions">
          <button class="btn-edit" onclick="editLoan(${l.id})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-danger" onclick="deleteLoan(${l.id})">✕</button>
        </div>
      </div>
      ${!done ? loanSparklineSvg(l) : ''}
      ${!done ? `
      <div class="loan-pay-row">
        <input type="number" min="0" placeholder="Pay ₹" id="loan-pay-${l.id}"/>
        <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="recordLoanPayment(${l.id},'loan-pay-${l.id}')">+ Record Payment</button>
      </div>` : ''}
    </div>`;
  }).join('');
}



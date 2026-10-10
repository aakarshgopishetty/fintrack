// ══════════════ BUDGETS + ANALYTICS ══════════════
function monthKeyFrom(date){ return date.slice(0,7); }
function prevMonthKey(mk){
  const [y,m] = mk.split('-').map(Number);
  const d = new Date(y, m-2, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
// goodWhenUp: true if an increase should read as positive (income, net) — false for spend
function renderStatDelta(elId, curr, prev, goodWhenUp){
  const el = document.getElementById(elId);
  if(!el) return;
  if(!prev && !curr){ el.innerHTML=''; return; }
  if(!prev){ el.innerHTML = '<span class="flat">New this month</span>'; el.className='stat-delta flat'; return; }
  const diff = curr - prev;
  const pct = Math.round((diff/Math.abs(prev))*100);
  if(diff===0){ el.className='stat-delta flat'; el.innerHTML='No change vs last month'; return; }
  const isGood = (diff>0)===goodWhenUp;
  el.className = 'stat-delta '+(isGood?'down':'up');
  const arrow = diff>0
    ? '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7"/></svg>'
    : '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  el.innerHTML = `${arrow}${Math.abs(pct)}% vs last month`;
}
function populateMonthSelect(){
  const sel = document.getElementById('an-month');
  const months = new Set();
  const now = toLocalDateStr().slice(0,7);
  months.add(now);
  state.expenses.forEach(e=>{ if(e.date) months.add(monthKeyFrom(e.date)); });
  state.incomes.forEach(e=>{ if(e.date) months.add(monthKeyFrom(e.date)); });
  const sorted = [...months].sort().reverse();
  const prevVal = sel.value;
  sel.innerHTML = sorted.map(m=>{
    const d = new Date(m+'-01T00:00:00');
    const label = d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    return `<option value="${m}">${label}</option>`;
  }).join('');
  sel.value = sorted.includes(prevVal) ? prevVal : now;
}

async function checkBudgetAlert(cat, date){
  const limit = state.budgets[cat];
  if(!limit) return;
  const mk = monthKeyFrom(date);
  const spent = state.expenses.filter(e=>e.cat===cat && monthKeyFrom(e.date)===mk).reduce((s,e)=>s+e.amt,0);
  if(spent > limit){
    toast(`Over budget on ${cat} — ₹${fmtNum(spent)} of ₹${fmtNum(limit)}`,'danger');
  } else if(spent > limit*0.9){
    toast(`Close to budget on ${cat} — ₹${fmtNum(spent)} of ₹${fmtNum(limit)}`,'warn');
  }
}

function renderAnalytics(){
  populateMonthSelect();
  const mk = document.getElementById('an-month').value || toLocalDateStr().slice(0,7);
  const monthExpenses = state.expenses.filter(e=>e.date && monthKeyFrom(e.date)===mk);
  const monthIncomes = state.incomes.filter(e=>e.date && monthKeyFrom(e.date)===mk);
  const total = monthExpenses.reduce((s,e)=>s+e.amt,0);
  const incomeTotal = monthIncomes.reduce((s,e)=>s+e.amt,0);

  const byCat = {};
  CATEGORIES.forEach(c=>byCat[c]=0);
  monthExpenses.forEach(e=>{ byCat[e.cat] = (byCat[e.cat]||0) + e.amt; });

  document.getElementById('an-income').textContent = '₹'+fmtNum(incomeTotal);
  document.getElementById('an-total').textContent = '₹'+fmtNum(total);
  const net = incomeTotal - total;
  const netEl = document.getElementById('an-net');
  netEl.textContent = (net<0?'-':'')+'₹'+fmtNum(Math.abs(net));
  netEl.style.color = net<0 ? 'var(--danger)' : 'var(--accent2)';

  // Month-over-month comparison
  const prevMk = prevMonthKey(mk);
  const prevExpTotal = state.expenses.filter(e=>e.date && monthKeyFrom(e.date)===prevMk).reduce((s,e)=>s+e.amt,0);
  const prevIncTotal = state.incomes.filter(e=>e.date && monthKeyFrom(e.date)===prevMk).reduce((s,e)=>s+e.amt,0);
  const prevNet = prevIncTotal - prevExpTotal;
  renderStatDelta('an-income-delta', incomeTotal, prevIncTotal, true);
  renderStatDelta('an-total-delta', total, prevExpTotal, false);
  renderStatDelta('an-net-delta', net, prevNet, true);

  const activeCats = CATEGORIES.filter(c=>byCat[c]>0);
  const catEl = document.getElementById('an-cat-wrap');
  const emptyEl = document.getElementById('an-cat-empty');
  const fixedExpTotal = monthExpenses.filter(e=>(e.type||'variable')==='fixed').reduce((s,e)=>s+e.amt,0);
  const variableExpTotal = monthExpenses.filter(e=>(e.type||'variable')==='variable').reduce((s,e)=>s+e.amt,0);
  if(!activeCats.length){
    catEl.style.display='none'; emptyEl.style.display='block';
  } else {
    catEl.style.display='block'; emptyEl.style.display='none';
    document.getElementById('cat-fixvar-strip').innerHTML = `
      <div class="stat-card" style="padding:12px;">
        <div class="label"><span class="legend-dot" style="background:${EXPENSE_TYPE_COLOR.fixed};margin-right:5px;"></span>Fixed</div>
        <div class="value" style="font-size:17px;color:${EXPENSE_TYPE_COLOR.fixed};">₹${fmtNum(fixedExpTotal)}</div>
      </div>
      <div class="stat-card" style="padding:12px;">
        <div class="label"><span class="legend-dot" style="background:${EXPENSE_TYPE_COLOR.variable};margin-right:5px;"></span>Variable</div>
        <div class="value" style="font-size:17px;color:${EXPENSE_TYPE_COLOR.variable};">₹${fmtNum(variableExpTotal)}</div>
      </div>`;
    const colors = activeCats.map(c=>CAT_COLORS[CATEGORIES.indexOf(c)]);
    const ctx = document.getElementById('cat-chart').getContext('2d');
    if(catChart) catChart.destroy();
    catChart = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:activeCats, datasets:[{ data:activeCats.map(c=>byCat[c]), backgroundColor:colors, borderWidth:2, borderColor:'#fff' }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'62%',
        onClick:(evt, elements)=>{
          if(!elements.length) return;
          const label = activeCats[elements[0].index];
          filterExpensesByCategory(label);
        },
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> ' ₹'+fmtNum(ctx.parsed) } } }
      }
    });
    document.getElementById('cat-legend').innerHTML = activeCats.map((c,i)=>
      `<span class="legend-item" style="cursor:pointer;" onclick="filterExpensesByCategory('${c.replace(/'/g,"\\'")}')"><span class="legend-dot" style="background:${colors[i]}"></span>${c} · ₹${fmtNum(byCat[c])}</span>`
    ).join('');
  }

  // income by source, split by fixed/variable
  const bySrc = {};
  monthIncomes.forEach(e=>{
    const key = e.desc;
    if(!bySrc[key]) bySrc[key] = { amt:0, type: e.type||'variable' };
    bySrc[key].amt += e.amt;
  });
  const srcNames = Object.keys(bySrc).sort((a,b)=>bySrc[b].amt-bySrc[a].amt);
  const fixedTotal = monthIncomes.filter(e=>(e.type||'variable')==='fixed').reduce((s,e)=>s+e.amt,0);
  const variableTotal = monthIncomes.filter(e=>(e.type||'variable')==='variable').reduce((s,e)=>s+e.amt,0);
  const incListEl = document.getElementById('an-inc-list');
  const incEmptyEl = document.getElementById('an-inc-empty');
  if(!srcNames.length){
    incListEl.style.display='none'; incEmptyEl.style.display='block';
  } else {
    incListEl.style.display='block'; incEmptyEl.style.display='none';
    let html = `<div class="summary-strip" style="margin-bottom:14px;">
      <div class="stat-card" style="padding:12px;">
        <div class="label"><span class="legend-dot" style="background:${INCOME_TYPE_COLOR.fixed};margin-right:5px;"></span>Fixed</div>
        <div class="value" style="font-size:17px;color:${INCOME_TYPE_COLOR.fixed};">₹${fmtNum(fixedTotal)}</div>
      </div>
      <div class="stat-card" style="padding:12px;">
        <div class="label"><span class="legend-dot" style="background:${INCOME_TYPE_COLOR.variable};margin-right:5px;"></span>Variable</div>
        <div class="value" style="font-size:17px;color:${INCOME_TYPE_COLOR.variable};">₹${fmtNum(variableTotal)}</div>
      </div>
    </div>`;
    html += srcNames.map(s=>{
      const row = bySrc[s];
      const pct = incomeTotal>0 ? Math.round((row.amt/incomeTotal)*100) : 0;
      const color = INCOME_TYPE_COLOR[row.type] || INCOME_TYPE_COLOR.variable;
      return `
      <div class="budget-item">
        <div class="budget-head">
          <span class="cat"><span class="legend-dot" style="background:${color};margin-right:6px;"></span>${escapeHtml(s)} <span class="tag ${row.type==='fixed'?'tag-fixed':'tag-variable'}" style="margin-left:4px;">${row.type==='fixed'?'Fixed':'Variable'}</span></span>
          <span class="amts"><b>₹${fmtNum(row.amt)}</b> · ${pct}%</span>
        </div>
        <div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${color};"></div></div>
      </div>`;
    }).join('');
    incListEl.innerHTML = html;
  }

  // trend chart: last 6 months including selected, income vs expense
  const months = [];
  const base = new Date(mk+'-01T00:00:00');
  for(let i=5;i>=0;i--){
    const d = new Date(base.getFullYear(), base.getMonth()-i, 1);
    months.push(toLocalDateStr(d).slice(0,7));
  }
  const trendExpense = months.map(m=> state.expenses.filter(e=>e.date && monthKeyFrom(e.date)===m).reduce((s,e)=>s+e.amt,0));
  const trendIncome = months.map(m=> state.incomes.filter(e=>e.date && monthKeyFrom(e.date)===m).reduce((s,e)=>s+e.amt,0));
  const trendLabels = months.map(m=> new Date(m+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short'}));
  const tctx = document.getElementById('trend-chart').getContext('2d');
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(tctx, {
    type:'bar',
    data:{ labels:trendLabels, datasets:[
      { label:'Income', data:trendIncome, backgroundColor:'#10B981', borderRadius:6, maxBarThickness:24 },
      { label:'Expense', data:trendExpense, backgroundColor:'#EF4444', borderRadius:6, maxBarThickness:24 }
    ] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick:(evt, elements)=>{
        if(!elements.length) return;
        const clickedMonth = months[elements[0].index];
        const sel = document.getElementById('an-month');
        if([...sel.options].some(o=>o.value===clickedMonth)){ sel.value = clickedMonth; renderAnalytics(); }
      },
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> ' '+ctx.dataset.label+': ₹'+fmtNum(ctx.parsed.y) } } },
      scales:{ y:{ beginAtZero:true, ticks:{ callback:(v)=> '₹'+fmtNum(v) }, grid:{color:'#F0F2F5'} }, x:{ grid:{display:false} } }
    }
  });

  renderBudgetList(mk, byCat);
  renderGoals();
  renderLoans();
  renderNetWorthChart();
}


// ══════════════ MONTHLY REPORT EXPORT ══════════════
// Builds a standalone, print-friendly HTML document for the selected month
// and opens it in a new tab — the user can then use the browser's own
// Print > Save as PDF to get a shareable file, without needing a PDF library.
function generateMonthlyReportHtml(mk){
  const monthLabel = new Date(mk+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const monthExpenses = state.expenses.filter(e=>e.date && monthKeyFrom(e.date)===mk);
  const monthIncomes = state.incomes.filter(e=>e.date && monthKeyFrom(e.date)===mk);
  const totalExp = monthExpenses.reduce((s,e)=>s+e.amt,0);
  const totalInc = monthIncomes.reduce((s,e)=>s+e.amt,0);
  const net = totalInc - totalExp;

  const byCat = {};
  CATEGORIES.forEach(c=>byCat[c]=0);
  monthExpenses.forEach(e=>{ byCat[e.cat] = (byCat[e.cat]||0) + e.amt; });
  const activeCats = CATEGORIES.filter(c=>byCat[c]>0).sort((a,b)=>byCat[b]-byCat[a]);

  const bySrc = {};
  monthIncomes.forEach(e=>{ bySrc[e.desc] = (bySrc[e.desc]||0) + e.amt; });
  const srcNames = Object.keys(bySrc).sort((a,b)=>bySrc[b]-bySrc[a]);

  const budgetRows = Object.keys(state.budgets).map(cat=>({
    cat, limit: state.budgets[cat], spent: byCat[cat]||0, over: (byCat[cat]||0) > state.budgets[cat]
  }));

  const profileName = state.profile && state.profile.name ? state.profile.name : '';
  const esc = (s)=> String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FinTrack Report — ${monthLabel}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0D1117;margin:0;padding:40px;}
  .wrap{max-width:760px;margin:0 auto;}
  h1{font-size:22px;margin-bottom:4px;}
  .sub{color:#666;font-size:13px;margin-bottom:28px;}
  .summary{display:flex;gap:16px;margin-bottom:32px;}
  .summary div{flex:1;border:1px solid #e4e7eb;border-radius:10px;padding:14px;}
  .summary .label{font-size:11px;text-transform:uppercase;color:#8A93A2;letter-spacing:.05em;}
  .summary .val{font-size:20px;font-weight:700;margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin-bottom:30px;font-size:13px;}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e4e7eb;}
  th{color:#8A93A2;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em;}
  h2{font-size:15px;margin:0 0 10px;border-bottom:2px solid #0D1117;padding-bottom:6px;}
  .over{color:#EF4444;font-weight:700;}
  .under{color:#10B981;}
  .footer{margin-top:36px;font-size:11px;color:#8A93A2;text-align:center;}
  .print-btn{margin-bottom:24px;padding:10px 18px;border-radius:8px;border:none;background:#2563EB;color:#fff;font-size:13px;font-weight:600;cursor:pointer;}
  @media print{ .print-btn{display:none;} body{padding:20px;} }
</style></head>
<body>
<div class="wrap">
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>Monthly Financial Report — ${monthLabel}</h1>
  <div class="sub">${profileName ? esc(profileName)+' · ' : ''}Generated ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>

  <div class="summary">
    <div><div class="label">Income</div><div class="val">₹${fmtNum(totalInc)}</div></div>
    <div><div class="label">Expenses</div><div class="val">₹${fmtNum(totalExp)}</div></div>
    <div><div class="label">Net</div><div class="val" style="color:${net<0?'#EF4444':'#10B981'};">${net<0?'-':''}₹${fmtNum(Math.abs(net))}</div></div>
  </div>

  <h2>Spending by Category</h2>
  <table>
    <tr><th>Category</th><th>Amount</th><th>% of spend</th></tr>
    ${activeCats.length ? activeCats.map(c=>`<tr><td>${esc(c)}</td><td>₹${fmtNum(byCat[c])}</td><td>${totalExp>0?Math.round((byCat[c]/totalExp)*100):0}%</td></tr>`).join('') : '<tr><td colspan="3">No expenses this month</td></tr>'}
  </table>

  <h2>Income by Source</h2>
  <table>
    <tr><th>Source</th><th>Amount</th></tr>
    ${srcNames.length ? srcNames.map(s=>`<tr><td>${esc(s)}</td><td>₹${fmtNum(bySrc[s])}</td></tr>`).join('') : '<tr><td colspan="2">No income this month</td></tr>'}
  </table>

  ${budgetRows.length ? `
  <h2>Budgets vs Actual</h2>
  <table>
    <tr><th>Category</th><th>Budget</th><th>Spent</th><th>Status</th></tr>
    ${budgetRows.map(b=>`<tr><td>${esc(b.cat)}</td><td>₹${fmtNum(b.limit)}</td><td>₹${fmtNum(b.spent)}</td><td class="${b.over?'over':'under'}">${b.over?'Over budget':'Within budget'}</td></tr>`).join('')}
  </table>` : ''}

  ${state.savingsGoals.length ? `
  <h2>Savings Goals</h2>
  <table>
    <tr><th>Goal</th><th>Saved</th><th>Target</th><th>Progress</th></tr>
    ${state.savingsGoals.map(g=>`<tr><td>${esc(g.name)}</td><td>₹${fmtNum(g.current)}</td><td>₹${fmtNum(g.target)}</td><td>${g.target>0?Math.round((g.current/g.target)*100):0}%</td></tr>`).join('')}
  </table>` : ''}

  ${state.loans.length ? `
  <h2>Loans &amp; Debts</h2>
  <table>
    <tr><th>Loan</th><th>Outstanding</th><th>Principal</th><th>EMI</th></tr>
    ${state.loans.map(l=>`<tr><td>${esc(l.name)}</td><td>₹${fmtNum(l.outstanding)}</td><td>₹${fmtNum(l.principal)}</td><td>₹${fmtNum(l.emi)}</td></tr>`).join('')}
  </table>` : ''}

  <div class="footer">Generated by FinTrack — for personal record-keeping only.</div>
</div>
</body></html>`;
}
function exportMonthlyReport(){
  const mk = document.getElementById('an-month').value || toLocalDateStr().slice(0,7);
  const html = generateMonthlyReportHtml(mk);
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if(!win){
    const a = document.createElement('a');
    a.href = url; a.download = 'fintrack-report-'+mk+'.html';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Popup blocked — report downloaded instead. Open it and print to PDF.','warn');
  } else {
    toast('Report opened in a new tab — use Print (Ctrl/Cmd+P) to save as PDF');
  }
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}

function renderNetWorthChart(){
  const keys = Object.keys(state.netWorthHistory).sort();
  const wrapEl = document.getElementById('nw-wrap');
  const emptyEl = document.getElementById('nw-empty');
  if(keys.length < 2){
    wrapEl.style.display='none'; emptyEl.style.display='block';
    return;
  }
  wrapEl.style.display='block'; emptyEl.style.display='none';
  const last = keys.slice(-6);
  const labels = last.map(m=> new Date(m+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'2-digit'}));
  const values = last.map(m=> state.netWorthHistory[m]);
  const nctx = document.getElementById('nw-chart').getContext('2d');
  if(nwChart) nwChart.destroy();
  nwChart = new Chart(nctx, {
    type:'line',
    data:{ labels, datasets:[{
      label:'Net Worth', data:values,
      borderColor:'#2563EB', backgroundColor:'rgba(37,99,235,.12)',
      fill:true, tension:.35, pointRadius:4, pointBackgroundColor:'#2563EB', pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5
    }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> ' ₹'+fmtNum(ctx.parsed.y) } } },
      scales:{ y:{ ticks:{ callback:(v)=> '₹'+fmtNum(v) }, grid:{color:'#F0F2F5'} }, x:{ grid:{display:false} } }
    }
  });
}

function renderBudgetList(mk, byCat){
  populateNewBudgetSelect();
  const el = document.getElementById('budget-list');
  const activeCats = Object.keys(state.budgets);
  if(!activeCats.length){
    el.innerHTML = '<div class="empty"><p>No budgets added yet</p><span>Pick a category above and set a limit</span></div>';
    return;
  }
  el.innerHTML = activeCats.map(c=>{
    const limit = state.budgets[c] || 0;
    const spent = byCat[c] || 0;
    const pct = limit>0 ? Math.min(100,(spent/limit)*100) : 0;
    const over = limit>0 && spent>limit;
    const color = over ? 'var(--danger)' : (pct>80 ? 'var(--warn)' : 'var(--accent2)');
    const catKey = c.replace(/[^a-zA-Z0-9]/g,'');
    return `
    <div class="budget-item">
      <div class="budget-head">
        <span class="cat"><span class="legend-dot" style="background:${catColor(c)};margin-right:6px;"></span>${escapeHtml(c)}</span>
        <span class="amts"><b>₹${fmtNum(spent)}</b> / ₹${fmtNum(limit)}</span>
      </div>
      <div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${color};"></div></div>
      <div class="budget-input-row">
        <span>Monthly limit ₹</span>
        <input type="number" min="0" placeholder="0" value="${limit||''}" id="bud-${catKey}" onchange="setBudget('${c.replace(/'/g,"\\'")}','bud-${catKey}')"/>
        <button class="btn-danger" style="margin-left:auto;" onclick="removeBudget('${c.replace(/'/g,"\\'")}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function populateNewBudgetSelect(){
  const sel = document.getElementById('new-budget-cat');
  if(!sel) return;
  const available = CATEGORIES.filter(c=>!(c in state.budgets));
  const prevVal = sel.value;
  sel.innerHTML = available.length
    ? available.map(c=>`<option value="${c}">${c}</option>`).join('')
    : '<option value="">All categories budgeted</option>';
  if(available.includes(prevVal)) sel.value = prevVal;
}

async function addBudget(){
  const cat = document.getElementById('new-budget-cat').value;
  const amt = parseFloat(document.getElementById('new-budget-amt').value);
  if(!cat){ toast('Pick a category first','warn'); return; }
  if(!(amt>0)){ toast('Enter a limit above 0','warn'); return; }
  state.budgets[cat] = amt;
  document.getElementById('new-budget-amt').value = '';
  await persist('budgets');
  renderAnalytics();
  toast('Budget added ✓');
}

async function removeBudget(cat){
  if(!confirm('Remove the budget for '+cat+'?')) return;
  delete state.budgets[cat];
  await persist('budgets');
  renderAnalytics();
}

async function setBudget(cat, inputId){
  const v = parseFloat(document.getElementById(inputId).value);
  if(v>0) state.budgets[cat] = v;
  else delete state.budgets[cat];
  await persist('budgets');
  renderAnalytics();
  toast('Budget updated ✓');
}



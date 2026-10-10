// ══════════════ PROFILE ══════════════
function renderProfile(){
  const p = state.profile;
  if(p){
    document.getElementById('p-name').value  = p.name  || '';
    document.getElementById('p-email').value = p.email || '';
    document.getElementById('p-phone').value = p.phone || '';
    document.getElementById('p-city').value  = p.city  || '';
    document.getElementById('p-occ').value   = p.occ   || '';
    document.getElementById('p-income').value= p.income|| '';
    document.getElementById('p-dob').value   = p.dob   || '';
    document.getElementById('p-gender').value= p.gender|| '';

    const hero = document.getElementById('profile-hero');
    hero.style.display = 'block';
    const names = (p.name||'?').trim().split(' ').filter(Boolean);
    document.getElementById('avatar-initials').textContent =
      names.length ? ((names[0][0]||'')+(names[1]?names[1][0]:'')).toUpperCase() : '?';
    document.getElementById('hero-name').textContent  = p.name || '–';
    document.getElementById('hero-email').textContent = p.email|| '–';
  } else {
    document.getElementById('profile-hero').style.display = 'none';
  }
  renderBanks();
  renderHeroBanks();
  maybeShowOnboarding();
}

async function saveProfile(){
  const name  = document.getElementById('p-name').value.trim();
  const email = document.getElementById('p-email').value.trim();
  let ok = true;
  markInvalid('fld-p-name', !name);  if(!name) ok=false;
  const emailBad = !email || !isValidEmail(email);
  markInvalid('fld-p-email', emailBad); if(emailBad) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  state.profile = {
    name, email,
    phone : document.getElementById('p-phone').value.trim(),
    city  : document.getElementById('p-city').value.trim(),
    occ   : document.getElementById('p-occ').value.trim(),
    income: document.getElementById('p-income').value,
    dob   : document.getElementById('p-dob').value,
    gender: document.getElementById('p-gender').value,
  };
  await persist('profile');
  renderProfile();
  toast('Profile saved ✓');
}


// ══════════════ BANKS ══════════════
const bankTypeTag = {
  'Savings Account':'tag-savings','Current Account':'tag-current',
  'Credit Card':'tag-credit','UPI/Wallet':'tag-upi','Cash':'tag-cash',
};
const bankTypeColor = { 'Savings Account':'#2563EB','Current Account':'#16A34A','Credit Card':'#EA580C','UPI/Wallet':'#9333EA','Cash':'#475569' };
function bankBadge(type){
  const letter = (type||'?').trim()[0] || '?';
  const color = bankTypeColor[type] || '#8A93A2';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:12px;background:${color}1a;color:${color};font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;">${letter}</span>`;
}


function recalculateBalances() {
  state.banks.forEach(b => {
    let bal = b.initialBal || b.bal || 0;
    
    // Add incomes
    state.incomes.forEach(inc => {
      if (inc.acc === b.type) bal += inc.amt; // Note: Acc is stored as type string for simplicity in original
    });
    
    // Subtract expenses
    state.expenses.forEach(exp => {
      if (exp.acc === b.type) bal -= exp.amt;
    });

    // Handle transfers
    if (state.transfers) {
      state.transfers.forEach(tr => {
        if (tr.fromAcc === b.type) bal -= tr.amt;
        if (tr.toAcc === b.type) bal += tr.amt;
      });
    }
    
    b.bal = bal;
  });
}

function renderBanks(){
  recalculateBalances();
  const el = document.getElementById('bank-list');
  if(!state.banks.length){
    el.innerHTML = '<div class="empty"><p>No accounts added yet</p><span>Add a bank, card, UPI or cash wallet</span></div>';
    document.getElementById('hero-networth').textContent = '₹0';
    return;
  }
  el.innerHTML = state.banks.map((b,i)=>`
    <div class="exp-item">
      <div class="exp-icon" style="background:var(--paper);">${bankBadge(b.type)}</div>
      <div class="exp-info">
        <div class="title">${escapeHtml(b.bank)} ${b.num?'••••'+escapeHtml(b.num):''}</div>
        <div class="sub"><span class="tag ${bankTypeTag[b.type]||''}">${b.type}</span> ${b.upi?'· '+escapeHtml(b.upi):''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:var(--accent2);">₹${fmtNum(b.bal)}</div>
        <div class="item-actions">
          <button class="btn-edit" onclick="editBank(${i})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-danger" onclick="removeBank(${i})">✕</button>
        </div>
      </div>
    </div>
  `).join('');
  const total = state.banks.reduce((s,b)=> s + (b.type==='Credit Card' ? -Math.abs(b.bal) : b.bal), 0);
  document.getElementById('hero-networth').textContent = '₹'+fmtNum(total);
  recordNetWorthSnapshot(total);
}
async function recordNetWorthSnapshot(total){
  const mk = toLocalDateStr().slice(0,7);
  if(state.netWorthHistory[mk] === total) return;
  state.netWorthHistory[mk] = total;
  await persist('netWorthHistory');
  if(document.getElementById('screen-analytics').classList.contains('active')) renderNetWorthChart();
}

function renderHeroBanks(){
  const el = document.getElementById('hero-banks');
  el.innerHTML = state.banks.slice(0,4).map(b=>
    `<span class="bank-chip"><span style="width:6px;height:6px;border-radius:50%;background:${bankTypeColor[b.type]||'#fff'};display:inline-block;"></span> ${escapeHtml(b.bank)}</span>`
  ).join('');
}

function openBankModal(){
  editingBankIdx = null;
  document.getElementById('bank-modal-title').textContent = 'Add Bank Account';
  document.getElementById('bank-save-btn').textContent = 'Add Account';
  ['b-bank','b-num','b-bal','b-upi'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('b-type').value='';
  ['fld-b-bank','fld-b-type'].forEach(id=>markInvalid(id,false));
  document.getElementById('bank-modal').classList.add('open');
}
function editBank(i){
  editingBankIdx = i;
  const b = state.banks[i];
  document.getElementById('bank-modal-title').textContent = 'Edit Bank Account';
  document.getElementById('bank-save-btn').textContent = 'Save Changes';
  document.getElementById('b-bank').value = b.bank;
  document.getElementById('b-type').value = b.type;
  document.getElementById('b-num').value  = b.num || '';
  document.getElementById('b-bal').value  = b.bal;
  document.getElementById('b-upi').value  = b.upi || '';
  document.getElementById('bank-modal').classList.add('open');
}
function closeBankModal(e){
  if(!e||e.target===document.getElementById('bank-modal'))
    document.getElementById('bank-modal').classList.remove('open');
}
async function saveBank(){
  const bank = document.getElementById('b-bank').value.trim();
  const type = document.getElementById('b-type').value;
  let ok = true;
  markInvalid('fld-b-bank', !bank); if(!bank) ok=false;
  markInvalid('fld-b-type', !type); if(!type) ok=false;
  if(!ok){ toast('Please fix the highlighted fields','warn'); return; }

  const rec = {
    id: editingBankIdx!==null ? state.banks[editingBankIdx].id : uid(),
    bank, type,
    num : document.getElementById('b-num').value.trim(),
    bal : parseFloat(document.getElementById('b-bal').value)||0,
    initialBal : editingBankIdx!==null ? (state.banks[editingBankIdx].initialBal !== undefined ? state.banks[editingBankIdx].initialBal : (parseFloat(document.getElementById('b-bal').value)||0)) : (parseFloat(document.getElementById('b-bal').value)||0),
    upi : document.getElementById('b-upi').value.trim(),
  };
  if(editingBankIdx!==null) state.banks[editingBankIdx] = rec;
  else state.banks.push(rec);
  await persist('banks');
  closeBankModal();
  renderBanks();
  renderHeroBanks();
  toast(editingBankIdx!==null?'Account updated ✓':'Account added ✓');
}
function removeBank(i){
  const item = state.banks[i];
  if(!item) return;
  undoDelete(item.bank||'Account',
    async ()=>{ state.banks.splice(i,1); await persist('banks'); renderBanks(); renderHeroBanks(); },
    async ()=>{ state.banks.splice(i,0,item); await persist('banks'); renderBanks(); renderHeroBanks(); }
  );
}



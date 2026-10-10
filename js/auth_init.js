// ══════════════ PIN LOCK ══════════════
let storedPinHash = null;
let lockInput = '';
let pinModalMode = 'set';

async function hashPin(pin){
  if(window.crypto && window.crypto.subtle){
    const enc = new TextEncoder().encode('fintrack-pin-v1-'+pin);
    const buf = await window.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  // Fallback for environments without SubtleCrypto — weaker, but this PIN is a
  // local speed-bump against casual snooping, not a cryptographic secret.
  let h=0; for(let i=0;i<pin.length;i++){ h = (h*31 + pin.charCodeAt(i))|0; }
  return 'fallback-'+h;
}
async function getPinHash(){
  if(indexedDbAvailable){ try{ return (await idbGetMeta('pinHash')) || null; }catch(e){ return null; } }
  if(storageAvailable){ try{ return window.localStorage.getItem('ft_pinHash'); }catch(e){ return null; } }
  return null;
}
async function setPinHashStorage(hash){
  if(indexedDbAvailable){
    try{ await idbSetMeta('pinHash', hash); }catch(e){}
  } else if(storageAvailable){
    try{ hash ? window.localStorage.setItem('ft_pinHash', hash) : window.localStorage.removeItem('ft_pinHash'); }catch(e){}
  }
}
function updateLockDots(hasError){
  document.querySelectorAll('#lock-dots .lock-dot').forEach((d,i)=>{
    d.classList.toggle('filled', i<lockInput.length && !hasError);
    d.classList.toggle('err', !!hasError);
  });
}
function lockKeyPress(d){
  if(lockInput.length>=4) return;
  lockInput += d;
  updateLockDots();
  if(lockInput.length===4) attemptUnlock();
}
function lockKeyBackspace(){
  lockInput = lockInput.slice(0,-1);
  updateLockDots();
}
async function attemptUnlock(){
  const hash = await hashPin(lockInput);
  if(hash===storedPinHash){
    document.getElementById('lock-overlay').classList.remove('show');
    lockInput = '';
  } else {
    updateLockDots(true);
    toast('Incorrect PIN','danger');
    setTimeout(()=>{ lockInput=''; updateLockDots(); }, 400);
  }
}
function showLockScreen(){
  lockInput = '';
  updateLockDots();
  document.getElementById('lock-overlay').classList.add('show');
}
function forgotPin(){
  const ans = prompt('To reset the PIN and wipe your local financial data, type "RESET".\n\n(If you just forgot it, your data cannot be recovered without the PIN or a backup file.)');
  if (ans !== 'RESET') return;
  
  // Wipe everything
  IDB_COLLECTIONS.forEach(k => { state[k] = []; persist(k); });
  state.profile = null; persist('profile');
  state.budgets = {}; persist('budgets');
  state.netWorthHistory = {}; persist('netWorthHistory');
  
  storedPinHash = null;
  setPinHashStorage(null);
  document.getElementById('lock-overlay').classList.remove('show');
  updatePinStatusUI();
  renderProfile(); renderExpenses(); renderBanks();
  toast('App reset and PIN removed');
}
function openPinModal(mode){
  pinModalMode = mode;
  document.getElementById('pin-modal-title').textContent = mode==='set' ? 'Set PIN' : 'Change PIN';
  document.getElementById('pin-save-btn').textContent = mode==='set' ? 'Save PIN' : 'Save New PIN';
  document.getElementById('fld-pin-current').style.display = mode==='change' ? '' : 'none';
  document.getElementById('pin-current').value = '';
  document.getElementById('pin-new').value = '';
  document.getElementById('pin-confirm').value = '';
  markInvalid('fld-pin-new', false);
  markInvalid('fld-pin-confirm', false);
  document.getElementById('pin-modal').classList.add('open');
}
function closePinModal(e){
  if(!e||e.target===document.getElementById('pin-modal'))
    document.getElementById('pin-modal').classList.remove('open');
}
async function savePin(){
  const current = document.getElementById('pin-current').value.trim();
  const newPin = document.getElementById('pin-new').value.trim();
  const confirmPin = document.getElementById('pin-confirm').value.trim();
  const validNew = /^\d{4}$/.test(newPin);
  markInvalid('fld-pin-new', !validNew);
  const matches = validNew && newPin===confirmPin;
  markInvalid('fld-pin-confirm', !matches);
  if(!validNew || !matches){ toast('Enter a matching 4-digit PIN','warn'); return; }
  if(pinModalMode==='change'){
    const currentHash = await hashPin(current);
    if(currentHash!==storedPinHash){ toast('Current PIN is incorrect','danger'); return; }
  }
  const newHash = await hashPin(newPin);
  storedPinHash = newHash;
  await setPinHashStorage(newHash);
  document.getElementById('pin-modal').classList.remove('open');
  updatePinStatusUI();
  toast(pinModalMode==='set' ? 'PIN set ✓' : 'PIN changed ✓');
}
async function removePin(){
  if(!confirm('Remove the PIN lock? Anyone with access to this device will be able to open the app.')) return;
  storedPinHash = null;
  await setPinHashStorage(null);
  updatePinStatusUI();
  toast('PIN removed');
}
function updatePinStatusUI(){
  const statusText = document.getElementById('pin-status-text');
  if(!statusText) return;
  const setBtn = document.getElementById('pin-set-btn');
  const changeBtn = document.getElementById('pin-change-btn');
  const removeBtn = document.getElementById('pin-remove-btn');
  if(storedPinHash){
    statusText.textContent = 'PIN lock is on — the app asks for your PIN every time it loads.';
    setBtn.style.display='none'; changeBtn.style.display=''; removeBtn.style.display='';
  } else {
    statusText.textContent = 'No PIN set — anyone opening this app can see your data.';
    setBtn.style.display=''; changeBtn.style.display='none'; removeBtn.style.display='none';
  }
}



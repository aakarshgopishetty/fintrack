// ══════════════ VALIDATION HELPERS ══════════════
function markInvalid(fieldId, invalid){
  const el = document.getElementById(fieldId);
  if(el) el.classList.toggle('invalid', invalid);
}
function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }


// ══════════════ UTILS ══════════════

function toLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtNum(n){ return Number(n||0).toLocaleString('en-IN', {maximumFractionDigits:2}); }
function fmtDate(d){
  if(!d) return '';
  const [y,m,day]=d.split('-');
  return `${day}/${m}/${y}`;
}
function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg, kind){
  const t=document.createElement('div');
  t.className='toast'+(kind?' '+kind:'');
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2500);
}
let uidCounter = 0;
function uid(){
  // Collision-safe id: timestamp + incrementing counter, unlike a bare Date.now()
  uidCounter = (uidCounter+1) % 1000;
  return Date.now()*1000 + uidCounter;
}


// ══════════════ UNDO-DELETE ══════════════
// Removes the item immediately (snappy UX, no blocking confirm() dialog) but
// keeps a copy for a few seconds so the action can be reversed with one tap.
let activeUndo = null;
function undoDelete(label, removeFn, restoreFn){
  if(activeUndo) activeUndo.commit();
  const el = document.createElement('div');
  el.className = 'undo-toast';
  el.innerHTML = `
    <span>${escapeHtml(label)} deleted</span>
    <button class="undo-btn" type="button">Undo</button>
    <div class="undo-timer"><svg viewBox="0 0 28 28">
      <circle class="bg" cx="14" cy="14" r="12"/>
      <circle class="fg" cx="14" cy="14" r="12"/>
    </svg></div>`;
  document.body.appendChild(el);

  removeFn();

  let done = false;
  const timer = setTimeout(()=>commit(), 5000);
  function commit(){
    if(done) return; done = true;
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(()=>el.remove(), 220);
    if(activeUndo && activeUndo.commit===commit) activeUndo = null;
  }
  el.querySelector('.undo-btn').onclick = ()=>{
    if(done) return; done = true;
    clearTimeout(timer);
    restoreFn();
    el.classList.add('leaving');
    setTimeout(()=>el.remove(), 220);
    if(activeUndo && activeUndo.commit===commit) activeUndo = null;
  };
  activeUndo = { commit };
}



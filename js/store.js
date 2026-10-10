// ══════════════ STATE ══════════════
let state = { profile:null, banks:[], expenses:[], incomes:[], transfers:[], reminders:[], budgets:{}, theme:'light', savingsGoals:[], loans:[], netWorthHistory:{}, importHistory:[] };
let editingBankIdx = null, editingExpenseId = null, editingReminderId = null, editingIncomeId = null, editingGoalId = null, editingLoanId = null;
let catChart = null, trendChart = null, nwChart = null;
let moneyTab = 'expense';

const CATEGORIES = ['Food & Dining','Groceries','Transport','Rent & Bills','Healthcare','Entertainment','Education','Shopping','Subscriptions','EMI / Loan','Gifts','Others'];
const CAT_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#9333EA','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#64748B'];
function catColor(cat){ const i = CATEGORIES.indexOf(cat); return i>-1 ? CAT_COLORS[i] : '#8A93A2'; }
function catBadge(cat){
  const letter = (cat||'?').trim()[0] || '?';
  const color = catColor(cat);
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:12px;background:${color}1a;color:${color};font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;">${letter}</span>`;
}
const INCOME_TYPE_COLOR = { fixed:'#2563EB', variable:'#B45309' };
function incomeTypeBadge(type){
  const color = INCOME_TYPE_COLOR[type] || INCOME_TYPE_COLOR.variable;
  const letter = type==='fixed' ? 'F' : 'V';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:12px;background:${color}1a;color:${color};font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;">${letter}</span>`;
}
const EXPENSE_TYPE_COLOR = { fixed:'#2563EB', variable:'#B45309' };


// ══════════════ LOCAL DATABASE (IndexedDB) ══════════════
// This is the app's real local database — a proper transactional, structured
// store on the device's disk (inside the browser's profile storage), not just
// a key-value cache. Each collection (expenses, incomes, banks, reminders,
// savingsGoals, loans) is its own object store keyed by record id; profile,
// budgets, theme, and net-worth history live in a small 'meta' store as
// single records. Falls back to localStorage automatically in environments
// that block IndexedDB (some sandboxed iframes, private-browsing modes).
const IDB_DB_NAME = 'FinTrackDB';
const IDB_DB_VERSION = 1;
const IDB_COLLECTIONS = ['expenses','incomes','transfers','banks','reminders','savingsGoals','loans'];
let indexedDbAvailable = typeof indexedDB !== 'undefined';
let appDbPromise = null;

function openAppDB(){
  if(appDbPromise) return appDbPromise;
  appDbPromise = new Promise((resolve,reject)=>{
    const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      IDB_COLLECTIONS.forEach(name=>{
        if(!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath:'id' });
      });
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'key' });
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
  return appDbPromise;
}
async function idbReplaceCollection(storeName, records){
  const db = await openAppDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName,'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    (records||[]).forEach(r=>store.put(r));
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function idbGetCollection(storeName){
  const db = await openAppDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName,'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = ()=>resolve(req.result||[]);
    req.onerror = ()=>reject(req.error);
  });
}
async function idbSetMeta(key, value){
  const db = await openAppDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('meta','readwrite');
    tx.objectStore('meta').put({ key, value });
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function idbGetMeta(key){
  const db = await openAppDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('meta','readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = ()=>resolve(req.result ? req.result.value : undefined);
    req.onerror = ()=>reject(req.error);
  });
}
// One-time migration for anyone who used the earlier localStorage-only version.
async function migrateLocalStorageToIDB(){
  try{
    const already = await idbGetMeta('__migrated__');
    if(already) return;
  }catch(e){ /* proceed with migration attempt anyway */ }
  if(storageAvailable){
    const keys = ['profile','banks','expenses','incomes','transfers','reminders','budgets','theme','savingsGoals','loans','netWorthHistory','importHistory'];
    for(const k of keys){
      try{
        const raw = window.localStorage.getItem('ft_'+k);
        if(raw==null) continue;
        const val = JSON.parse(raw);
        if(IDB_COLLECTIONS.includes(k)) await idbReplaceCollection(k, Array.isArray(val)?val:[]);
        else await idbSetMeta(k, val);
      }catch(e){ /* skip this key, keep going */ }
    }
  }
  try{ await idbSetMeta('__migrated__', true); }catch(e){}
}


// ══════════════ STORAGE (localStorage — fallback when IndexedDB is unavailable) ══════════════
let storageAvailable = false;
try{
  const testKey = '__fintrack_test__';
  window.localStorage.setItem(testKey, '1');
  window.localStorage.removeItem(testKey);
  storageAvailable = true;
}catch(e){ storageAvailable = false; }

function loadAllFromLocalStorage(){
  const keys = ['profile','banks','expenses','incomes','reminders','budgets','theme','savingsGoals','loans','netWorthHistory','importHistory'];
  keys.forEach(k=>{
    let val = null;
    if(storageAvailable){
      try{ const raw = window.localStorage.getItem('ft_'+k); if(raw) val = JSON.parse(raw); }catch(e){ val = null; }
    }
    const dflt = k==='profile'?null:((k==='budgets'||k==='netWorthHistory')?{}:(k==='theme'?'light':[]));
    state[k] = val !== null ? val : dflt;
  });
}
async function loadAll(){
  if(indexedDbAvailable){
    try{
      await openAppDB();
      await migrateLocalStorageToIDB();
      state.expenses = await idbGetCollection('expenses');
      state.transfers = await idbGetCollection('transfers');
      state.incomes = await idbGetCollection('incomes');
      state.banks = await idbGetCollection('banks');
      state.reminders = await idbGetCollection('reminders');
      state.savingsGoals = await idbGetCollection('savingsGoals');
      state.loans = await idbGetCollection('loans');
      const profileVal = await idbGetMeta('profile');
      state.profile = profileVal===undefined ? null : profileVal;
      const budgetsVal = await idbGetMeta('budgets');
      state.budgets = budgetsVal===undefined ? {} : budgetsVal;
      const themeVal = await idbGetMeta('theme');
      state.theme = themeVal===undefined ? 'light' : themeVal;
      const nwVal = await idbGetMeta('netWorthHistory');
      state.netWorthHistory = nwVal===undefined ? {} : nwVal;
      const importHistVal = await idbGetMeta('importHistory');
      state.importHistory = Array.isArray(importHistVal) ? importHistVal : [];
    }catch(e){
      indexedDbAvailable = false;
      loadAllFromLocalStorage();
    }
  } else {
    loadAllFromLocalStorage();
  }
  // Migration safety: older bank records (pre-database) had no id field.
  state.banks.forEach(b=>{ if(b.id==null) b.id = uid(); });
  state.incomes.forEach(inc=>{ if(inc.type!=='fixed' && inc.type!=='variable') inc.type='variable'; });
  state.expenses.forEach(exp=>{ if(exp.type!=='fixed' && exp.type!=='variable') exp.type='variable'; });
  await applyRecurring();
}
// Debounce the actual disk write so rapid successive edits to the same
// collection (e.g. several persist() calls in a tight loop) collapse into
// one write instead of hammering IndexedDB repeatedly. Safe because every
// read in this app comes from the in-memory `state` object, never from the
// database directly — the database is a durability layer, not a live cache.
const PERSIST_DEBOUNCE_MS = 350;
let persistTimers = {};
let pendingPersistKeys = new Set();
async function flushPersist(key){
  if(persistTimers[key]){ clearTimeout(persistTimers[key]); delete persistTimers[key]; }
  pendingPersistKeys.delete(key);
  if(indexedDbAvailable){
    try{
      if(IDB_COLLECTIONS.includes(key)) await idbReplaceCollection(key, state[key]);
      else await idbSetMeta(key, state[key]);
    }catch(e){
      toast('Database save failed: '+(e.message||'unknown error'),'danger');
    }
  } else if(storageAvailable){
    try{
      window.localStorage.setItem('ft_'+key, JSON.stringify(state[key]));
    }catch(e){
      toast('Local save failed: '+(e.message||'unknown error'),'danger');
    }
  }
}
function flushAllPersist(){
  [...pendingPersistKeys].forEach(k=>flushPersist(k));
}
async function persist(key){
  pendingPersistKeys.add(key);
  if(persistTimers[key]) clearTimeout(persistTimers[key]);
  persistTimers[key] = setTimeout(()=>flushPersist(key), PERSIST_DEBOUNCE_MS);
  // Also mirror the full dataset to a connected local file (if any), fire-and-forget.
  // Kept immediate (not debounced) since it's the "insurance" copy on disk.
  writeStateToLocalFile();
}
window.addEventListener('beforeunload', () => {
  // Synchronously backup to localStorage to prevent data loss on tab close
  pendingPersistKeys.forEach(k => {
    try { window.localStorage.setItem('ft_' + k, JSON.stringify(state[k])); } catch(e) {}
  });
});
function updateDbStatus(){
  const dot = document.getElementById('db-status-dot');
  const el = document.getElementById('db-status-text');
  if(!el) return;
  if(indexedDbAvailable){
    dot.className = 'sync-dot ok';
    el.textContent = 'Using a local IndexedDB database on this device — structured, disk-backed storage with no setup needed.';
  } else if(storageAvailable){
    dot.className = 'sync-dot warn';
    el.textContent = 'IndexedDB isn\'t available here — falling back to simpler browser storage. Local File Storage below still works.';
  } else {
    dot.className = 'sync-dot';
    el.textContent = 'No on-device storage available in this environment — use Local File Storage or Backup & Restore below.';
  }
}


// ══════════════ SHARED PAYLOAD BUILDER ══════════════
function buildDataPayload(){
  return {
    profile: state.profile, banks: state.banks, expenses: state.expenses, incomes: state.incomes, transfers: state.transfers,
    reminders: state.reminders, budgets: state.budgets, theme: state.theme,
    savingsGoals: state.savingsGoals, loans: state.loans, netWorthHistory: state.netWorthHistory,
    importHistory: state.importHistory,
    exportedAt: new Date().toISOString()
  };
}
async function applyImportedPayload(data){
  state.profile = (data.profile && typeof data.profile==='object') ? data.profile : null;
  state.banks = Array.isArray(data.banks) ? data.banks : [];
  state.banks.forEach(b=>{ if(b.id==null) b.id = uid(); });
  state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
  state.expenses.forEach(exp=>{ if(exp.type!=='fixed' && exp.type!=='variable') exp.type='variable'; });
  state.incomes = Array.isArray(data.incomes) ? data.incomes : [];
  state.transfers = Array.isArray(data.transfers) ? data.transfers : [];
  state.incomes.forEach(inc=>{ if(inc.type!=='fixed' && inc.type!=='variable') inc.type='variable'; });
  state.reminders = Array.isArray(data.reminders) ? data.reminders : [];
  state.budgets = (data.budgets && typeof data.budgets==='object' && !Array.isArray(data.budgets)) ? data.budgets : {};
  state.theme = ['light','dark','auto'].includes(data.theme) ? data.theme : 'light';
  state.savingsGoals = Array.isArray(data.savingsGoals) ? data.savingsGoals : [];
  state.loans = Array.isArray(data.loans) ? data.loans : [];
  state.netWorthHistory = (data.netWorthHistory && typeof data.netWorthHistory==='object' && !Array.isArray(data.netWorthHistory)) ? data.netWorthHistory : {};
  state.importHistory = Array.isArray(data.importHistory) ? data.importHistory : [];
  const allKeys = ['profile','banks','expenses','incomes','reminders','budgets','theme','savingsGoals','loans','netWorthHistory','importHistory'];
  for(const k of allKeys){ await persist(k); }
  flushAllPersist();
  applyTheme();
  renderProfile(); renderExpenses(); renderReminders(); renderUpcomingRecurring(); renderAnalytics();
  updateDataUsage();
  renderImportHistory();
}


// ══════════════ BACKUP & RESTORE (works everywhere, including Claude.ai) ══════════════
function exportBackup(){
  const payload = buildDataPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fintrack-backup.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  markBackupEvent('backupExport');
  toast('Backup downloaded ✓');
}
function triggerImport(){ document.getElementById('backup-file-input').click(); }
function importBackup(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(e){
    try{
      const data = JSON.parse(e.target.result);
      if(typeof data !== 'object' || data === null || Array.isArray(data)){
        throw new Error('not an object');
      }
      const looksValid = ('profile' in data) || ('banks' in data) || ('expenses' in data) || ('incomes' in data) || ('reminders' in data) || ('budgets' in data);
      if(!looksValid) throw new Error('missing expected keys');
      await applyImportedPayload(data);
      toast('Backup restored ✓');
    }catch(err){
      toast('Could not read that file — is it a valid FinTrack backup?','danger');
    }
    input.value = '';
  };
  reader.readAsText(file);
}


// ══════════════ LOCAL FILE STORAGE (File System Access API) ══════════════
// Lets the user connect an actual file on their device's disk. Every change
// (persist call) mirrors the full dataset to that file, so data lives on the
// local filesystem rather than only inside the browser's sandboxed storage.
// Falls back gracefully (status message) in browsers that don't support it —
// Export/Import backup covers those cases.
let localFileHandle = null;
const fsApiSupported = typeof window.showSaveFilePicker === 'function';

function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open('fintrack-fs', 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore('handles'); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
async function idbSetHandle(handle){
  try{
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('handles','readwrite');
      tx.objectStore('handles').put(handle,'fileHandle');
      tx.oncomplete = ()=>resolve();
      tx.onerror = ()=>reject(tx.error);
    });
  }catch(e){ /* ignore */ }
}
async function idbGetHandle(){
  try{
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('handles','readonly');
      const req = tx.objectStore('handles').get('fileHandle');
      req.onsuccess = ()=>resolve(req.result||null);
      req.onerror = ()=>reject(req.error);
    });
  }catch(e){ return null; }
}
async function idbClearHandle(){
  try{
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('handles','readwrite');
      tx.objectStore('handles').delete('fileHandle');
      tx.oncomplete = ()=>resolve();
      tx.onerror = ()=>reject(tx.error);
    });
  }catch(e){ /* ignore */ }
}

async function connectLocalFile(){
  if(!fsApiSupported){ toast('Local file access isn\'t supported in this browser','warn'); return; }
  try{
    const handle = await window.showSaveFilePicker({
      suggestedName: 'fintrack-data.json',
      types: [{ description:'FinTrack Data', accept:{'application/json':['.json']} }]
    });
    localFileHandle = handle;
    await idbSetHandle(handle);
    await writeStateToLocalFile(true);
    updateLocalFileStatus();
    toast('Connected to local file ✓');
  }catch(e){
    if(e && e.name!=='AbortError') toast('Could not connect to file','danger');
  }
}
async function disconnectLocalFile(){
  localFileHandle = null;
  await idbClearHandle();
  updateLocalFileStatus();
  toast('Disconnected from local file');
}
async function reconnectLocalFilePermission(){
  if(!localFileHandle) return;
  try{
    const perm = await localFileHandle.requestPermission({mode:'readwrite'});
    if(perm==='granted'){
      updateLocalFileStatus();
      await writeStateToLocalFile(true);
      toast('Reconnected ✓');
    } else {
      toast('Permission denied','warn');
    }
  }catch(e){ toast('Could not reconnect','danger'); }
}
async function tryReconnectLocalFile(){
  if(!fsApiSupported) return;
  const handle = await idbGetHandle();
  if(!handle) return;
  try{
    const perm = await handle.queryPermission({mode:'readwrite'});
    localFileHandle = handle;
    updateLocalFileStatus(perm==='granted' ? null : 'permission');
  }catch(e){ /* handle may be stale */ }
}
async function writeStateToLocalFile(showErrors){
  if(!localFileHandle) return;
  try{
    const perm = await localFileHandle.queryPermission({mode:'readwrite'});
    if(perm!=='granted'){ updateLocalFileStatus('permission'); return; }
    const writable = await localFileHandle.createWritable();
    await writable.write(JSON.stringify(buildDataPayload(), null, 2));
    await writable.close();
    markBackupEvent('fileWrite');
  }catch(e){
    if(showErrors) toast('Could not write to local file','danger');
  }
}
function updateLocalFileStatus(mode){
  const dot = document.getElementById('local-file-dot');
  const el = document.getElementById('local-file-status');
  const connectBtn = document.getElementById('local-file-connect-btn');
  const reconnectBtn = document.getElementById('local-file-reconnect-btn');
  const disconnectBtn = document.getElementById('local-file-disconnect-btn');
  if(!el) return;
  if(!fsApiSupported){
    dot.className = 'sync-dot';
    el.textContent = 'Not supported in this browser — use Export/Import below instead.';
    connectBtn.style.display='none'; reconnectBtn.style.display='none'; disconnectBtn.style.display='none';
    return;
  }
  if(!localFileHandle){
    dot.className = 'sync-dot';
    el.textContent = 'Not connected. Connect a local file to auto-save every change straight to disk.';
    connectBtn.style.display=''; reconnectBtn.style.display='none'; disconnectBtn.style.display='none';
    return;
  }
  if(mode==='permission'){
    dot.className = 'sync-dot warn';
    el.textContent = 'Connected to '+(localFileHandle.name||'a file')+', but permission needs to be renewed.';
    connectBtn.style.display='none'; reconnectBtn.style.display=''; disconnectBtn.style.display='';
    return;
  }
  dot.className = 'sync-dot ok';
  el.textContent = 'Auto-saving to '+(localFileHandle.name||'a file')+' on this device ✓';
  connectBtn.style.display='none'; reconnectBtn.style.display='none'; disconnectBtn.style.display='';
}


// ══════════════ DATA USAGE & BACKUP TIMESTAMPS ══════════════
let backupTimestamps = { fileWrite:null, backupExport:null, p2pSend:null, p2pReceive:null };
function timeAgo(iso){
  if(!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs/60000);
  if(mins<1) return 'Just now';
  if(mins<60) return mins+' min ago';
  const hrs = Math.round(mins/60);
  if(hrs<24) return hrs+' hr'+(hrs===1?'':'s')+' ago';
  const days = Math.round(hrs/24);
  return days+' day'+(days===1?'':'s')+' ago';
}
function markBackupEvent(kind){
  backupTimestamps[kind] = new Date().toISOString();
  renderBackupTimestamps();
}
function renderBackupTimestamps(){
  const el = document.getElementById('backup-timestamps');
  if(!el) return;
  el.innerHTML = `
    <div class="backup-ts-row"><span>Local file last saved</span><b>${localFileHandle ? timeAgo(backupTimestamps.fileWrite) : '—'}</b></div>
    <div class="backup-ts-row"><span>Last backup exported</span><b>${timeAgo(backupTimestamps.backupExport)}</b></div>
    <div class="backup-ts-row"><span>Last sent to a device</span><b>${timeAgo(backupTimestamps.p2pSend)}</b></div>
    <div class="backup-ts-row"><span>Last received from a device</span><b>${timeAgo(backupTimestamps.p2pReceive)}</b></div>
  `;
}
function fmtBytes(n){
  if(n<1024) return n+' B';
  if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
  return (n/(1024*1024)).toFixed(2)+' MB';
}
function updateDataUsage(){
  const el = document.getElementById('data-usage-list');
  if(!el) return;
  const payload = buildDataPayload();
  const size = new Blob([JSON.stringify(payload)]).size;
  const rows = [
    ['Expenses', state.expenses.length],
    ['Income entries', state.incomes.length],
    ['Bank accounts', state.banks.length],
    ['Reminders', state.reminders.length],
    ['Savings goals', state.savingsGoals.length],
    ['Loans', state.loans.length],
  ];
  el.innerHTML = rows.map(([label,count])=>
    `<div class="usage-row"><span class="n">${label}</span><b>${count}</b></div>`
  ).join('') + `<div class="usage-row"><span class="n">Total data size</span><b>${fmtBytes(size)}</b></div>`;
}



// ══════════════ STATE ══════════════
let state = { profile:null, banks:[], expenses:[], incomes:[], reminders:[], budgets:{}, theme:'light', savingsGoals:[], loans:[], netWorthHistory:{}, importHistory:[] };
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
const IDB_COLLECTIONS = ['expenses','incomes','banks','reminders','savingsGoals','loans'];
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
    const keys = ['profile','banks','expenses','incomes','reminders','budgets','theme','savingsGoals','loans','netWorthHistory','importHistory'];
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
window.addEventListener('beforeunload', flushAllPersist);
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
    profile: state.profile, banks: state.banks, expenses: state.expenses, incomes: state.incomes,
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

// ══════════════ NETWORK SHARING (WebRTC, peer-to-peer, no server) ══════════════
// Establishes a direct data channel between two devices using only a public
// STUN server for NAT traversal — no signaling backend exists in this
// environment, so the SDP offer/answer is exchanged manually as a copyable
// code. Once connected, either side can push its full dataset to the other.
let pc = null, dataChannel = null;

function waitIceComplete(peerConn){
  return new Promise(resolve=>{
    if(peerConn.iceGatheringState==='complete'){ resolve(); return; }
    function check(){
      if(peerConn.iceGatheringState==='complete'){
        peerConn.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    peerConn.addEventListener('icegatheringstatechange', check);
  });
}
function encodeSDP(type, desc){
  return btoa(JSON.stringify({ type, sdp: { type: desc.type, sdp: desc.sdp } }));
}
function decodeSDP(str){
  const obj = JSON.parse(atob(str.trim()));
  return { type: obj.type, sdp: obj.sdp };
}
function setupDataChannel(dc){
  dataChannel = dc;
  dataChannel.onopen = ()=> updateP2PStatus('connected');
  dataChannel.onclose = ()=> updateP2PStatus('idle');
  dataChannel.onerror = ()=> updateP2PStatus('idle');
  dataChannel.onmessage = (ev)=> handleIncomingSync(ev.data);
}
function updateP2PStatus(status){
  const dot = document.getElementById('p2p-dot');
  const el = document.getElementById('p2p-status');
  const sendBtn = document.getElementById('p2p-send-btn');
  if(!el) return;
  if(status==='connected'){
    dot.className='sync-dot ok'; el.textContent='Connected — you can send data now'; sendBtn.disabled=false;
  } else if(status==='connecting'){
    dot.className='sync-dot warn'; el.textContent='Connecting…'; sendBtn.disabled=true;
  } else {
    dot.className='sync-dot'; el.textContent='Not connected'; sendBtn.disabled=true;
  }
}
async function createShareOffer(){
  resetPeer(true);
  pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
  setupDataChannel(pc.createDataChannel('sync'));
  updateP2PStatus('connecting');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  document.getElementById('p2p-my-code').value = encodeSDP('offer', pc.localDescription);
  toast('Code generated — copy and send to the other device');
}
async function useIncomingCode(){
  const raw = document.getElementById('p2p-their-code').value.trim();
  if(!raw){ toast('Paste a code first','warn'); return; }
  let payload;
  try{ payload = decodeSDP(raw); }catch(e){ toast('That code doesn\'t look valid','danger'); return; }

  if(payload.type==='offer'){
    resetPeer(true);
    pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
    pc.ondatachannel = (ev)=> setupDataChannel(ev.channel);
    updateP2PStatus('connecting');
    await pc.setRemoteDescription(payload.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    document.getElementById('p2p-my-code').value = encodeSDP('answer', pc.localDescription);
    toast('Answer code generated — send it back to the other device');
  } else if(payload.type==='answer'){
    if(!pc){ toast('No pending connection to complete — create a code first','warn'); return; }
    await pc.setRemoteDescription(payload.sdp);
    toast('Finishing connection…');
  }
}
function copyP2PCode(){
  const box = document.getElementById('p2p-my-code');
  if(!box.value){ toast('No code to copy yet','warn'); return; }
  box.select();
  try{
    navigator.clipboard.writeText(box.value);
    toast('Code copied ✓');
  }catch(e){
    document.execCommand('copy');
    toast('Code copied ✓');
  }
}
function resetPeer(silent){
  if(pc){ try{ pc.close(); }catch(e){} }
  pc = null; dataChannel = null;
  updateP2PStatus('idle');
  const myCode = document.getElementById('p2p-my-code');
  const theirCode = document.getElementById('p2p-their-code');
  if(myCode) myCode.value = '';
  if(theirCode) theirCode.value = '';
  if(!silent) toast('Connection reset');
}
function sendMyDataToPeer(){
  if(!dataChannel || dataChannel.readyState!=='open'){ toast('Not connected to another device','warn'); return; }
  dataChannel.send(JSON.stringify(buildDataPayload()));
  markBackupEvent('p2pSend');
  toast('Data sent ✓');
}
async function handleIncomingSync(raw){
  let data;
  try{ data = JSON.parse(raw); }catch(e){ toast('Received invalid data','danger'); return; }
  const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-IN') : 'unknown time';
  const proceed = confirm('Received data from the connected device (exported '+when+'). Import it and overwrite what\'s on this device?');
  if(!proceed) return;
  await applyImportedPayload(data);
  markBackupEvent('p2pReceive');
  toast('Data received and imported ✓');
}

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

// ══════════════ VALIDATION HELPERS ══════════════
function markInvalid(fieldId, invalid){
  const el = document.getElementById(fieldId);
  if(el) el.classList.toggle('invalid', invalid);
}
function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

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

function renderBanks(){
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
  const mk = new Date().toISOString().slice(0,7);
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

// ══════════════ MONEY TABS ══════════════
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
  document.getElementById('add-money-btn').textContent = tab==='expense' ? '+ Add Expense' : '+ Add Income';
  document.getElementById('add-money-btn').setAttribute('onclick', tab==='expense' ? 'openExpModal()' : 'openIncModal()');
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
  return d.toISOString().split('T')[0];
}
async function applyRecurring(){
  const today = new Date().toISOString().split('T')[0];
  let changed = false;
  ['expenses','incomes'].forEach(key=>{
    state[key].forEach(item=>{
      if(!item.recur) return;
      let guard = 0;
      while(item.recur.nextDate && item.recur.nextDate <= today && guard < 24){
        const clone = {...item, id: uid(), date: item.recur.nextDate, recur: null};
        state[key].unshift(clone);
        item.recur.nextDate = nextDateFrom(item.recur.nextDate, item.recur.freq);
        changed = true;
        guard++;
      }
    });
  });
  if(changed){ await persist('expenses'); await persist('incomes'); }
}
function renderUpcomingRecurring(){
  const el = document.getElementById('upcoming-recur-list');
  if(!el) return;
  const today = new Date().toISOString().split('T')[0];
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

// ══════════════ EXPENSES ══════════════
function openExpModal(){
  editingExpenseId = null;
  document.getElementById('exp-modal-title').textContent = 'Add Expense';
  document.getElementById('exp-save-btn').textContent = 'Save Expense';
  const today = new Date().toISOString().split('T')[0];
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
  const today = new Date().toISOString().split('T')[0];
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
  const today = new Date().toISOString().split('T')[0];
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
  const today = new Date().toISOString().split('T')[0];
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
  const today = new Date().toISOString().split('T')[0];
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
  const now = new Date().toISOString().slice(0,7);
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
  const mk = document.getElementById('an-month').value || new Date().toISOString().slice(0,7);
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
    months.push(d.toISOString().slice(0,7));
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
  const mk = document.getElementById('an-month').value || new Date().toISOString().slice(0,7);
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
  document.getElementById('l-start').value = new Date().toISOString().split('T')[0];
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

// ══════════════ REMINDERS ══════════════
function openRemModal(){
  editingReminderId = null;
  document.getElementById('rem-modal-title').textContent = 'New Reminder';
  document.getElementById('rem-save-btn').textContent = 'Add Reminder';
  document.getElementById('r-title').value='';
  document.getElementById('r-remark').value='';
  document.getElementById('r-due').value='';
  document.getElementById('r-pri').value='medium';
  markInvalid('fld-r-title', false);
  document.getElementById('rem-modal').classList.add('open');
}
function editReminder(id){
  const r = state.reminders.find(x=>x.id===id);
  if(!r) return;
  editingReminderId = id;
  document.getElementById('rem-modal-title').textContent = 'Edit Reminder';
  document.getElementById('rem-save-btn').textContent = 'Save Changes';
  document.getElementById('r-title').value = r.title;
  document.getElementById('r-due').value = r.due || '';
  document.getElementById('r-pri').value = r.pri || 'medium';
  document.getElementById('r-remark').value = r.remark || '';
  document.getElementById('rem-modal').classList.add('open');
}
function closeRemModal(e){
  if(!e||e.target===document.getElementById('rem-modal'))
    document.getElementById('rem-modal').classList.remove('open');
}
async function saveReminder(){
  const title = document.getElementById('r-title').value.trim();
  markInvalid('fld-r-title', !title);
  if(!title){ toast('Task title is required','warn'); return; }

  const rec = {
    id: editingReminderId!==null ? editingReminderId : uid(),
    title,
    done: editingReminderId!==null ? (state.reminders.find(r=>r.id===editingReminderId)?.done||false) : false,
    due   : document.getElementById('r-due').value,
    pri   : document.getElementById('r-pri').value,
    remark: document.getElementById('r-remark').value.trim(),
  };
  if(editingReminderId!==null){
    const idx = state.reminders.findIndex(r=>r.id===editingReminderId);
    if(idx>-1) state.reminders[idx] = rec;
  } else {
    state.reminders.unshift(rec);
  }
  await persist('reminders');
  closeRemModal();
  renderReminders();
  toast(editingReminderId!==null?'Reminder updated ✓':'Reminder added ✓');
}
async function toggleDone(id){
  const r = state.reminders.find(r=>r.id===id);
  if(r){ r.done=!r.done; await persist('reminders'); renderReminders(); }
}
function deleteReminder(id){
  const item = state.reminders.find(r=>r.id===id);
  if(!item) return;
  const idx = state.reminders.indexOf(item);
  undoDelete(item.title||'Reminder',
    async ()=>{ state.reminders.splice(idx,1); await persist('reminders'); renderReminders(); },
    async ()=>{ state.reminders.splice(idx,0,item); await persist('reminders'); renderReminders(); }
  );
}
const priColor={'high':'var(--danger)','medium':'var(--warn)','low':'var(--accent2)'};
const priText={'high':'High','medium':'Medium','low':'Low'};
function getDueClass(due){
  if(!due) return '';
  const today = new Date().toISOString().split('T')[0];
  if(due <= today) return 'due-today';
  const diff = (new Date(due)-new Date(today))/(86400000);
  return diff<=3?'due-soon':'due-ok';
}
function renderReminders(){
  const pending  = state.reminders.filter(r=>!r.done).length;
  const done     = state.reminders.filter(r=>r.done).length;
  document.getElementById('rem-pending').textContent = pending;
  document.getElementById('rem-done').textContent    = done;
  const el = document.getElementById('reminder-list');
  if(!state.reminders.length){
    el.innerHTML='<div class="empty"><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg><p>No reminders added</p><span>Bills, EMIs, renewals — anything to track</span></div>';
    return;
  }
  const sorted = [...state.reminders].sort((a,b)=>{
    if(a.done!==b.done) return a.done?1:-1;
    if(a.due&&b.due) return a.due.localeCompare(b.due);
    if(a.due) return -1;
    if(b.due) return 1;
    return 0;
  });
  el.innerHTML = sorted.map(r=>`
    <div class="rem-item">
      <div class="rem-check ${r.done?'done':''}" onclick="toggleDone(${r.id})"></div>
      <div class="rem-info">
        <div class="title ${r.done?'done':''}">${escapeHtml(r.title)}</div>
        ${r.remark?`<div class="remark">${escapeHtml(r.remark)}</div>`:''}
        <div style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap;">
          ${r.due?`<span class="due ${getDueClass(r.due)}">${fmtDate(r.due)}</span>`:''}
          <span style="font-size:11px;color:var(--muted);"><span class="pri-dot" style="background:${priColor[r.pri]||'var(--muted)'};"></span>${priText[r.pri]||''}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-edit" onclick="editReminder(${r.id})"><svg class="icon-btn" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-danger" onclick="deleteReminder(${r.id})">✕</button>
      </div>
    </div>
  `).join('');
}

// ══════════════ UTILS ══════════════
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

// ══════════════ NOTIFICATIONS ══════════════
// Browser Notification API only — no service worker/push, so this can only
// alert while the app tab is actually open (checked on load, on an interval,
// and whenever the tab regains focus). A per-day log of already-notified
// item ids avoids re-firing the same alert repeatedly during one session.
let notificationsEnabled = false;
async function getNotifPref(){
  if(indexedDbAvailable){ try{ return !!(await idbGetMeta('notificationsEnabled')); }catch(e){ return false; } }
  if(storageAvailable){ try{ return window.localStorage.getItem('ft_notificationsEnabled')==='1'; }catch(e){ return false; } }
  return false;
}
async function setNotifPref(val){
  if(indexedDbAvailable){ try{ await idbSetMeta('notificationsEnabled', val); }catch(e){} }
  else if(storageAvailable){ try{ window.localStorage.setItem('ft_notificationsEnabled', val?'1':'0'); }catch(e){} }
}
async function getNotifiedLog(){
  const fallback = { date:'', ids:[] };
  if(indexedDbAvailable){ try{ return (await idbGetMeta('notifiedLog')) || fallback; }catch(e){ return fallback; } }
  if(storageAvailable){ try{ const raw = window.localStorage.getItem('ft_notifiedLog'); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
  return fallback;
}
async function setNotifiedLog(log){
  if(indexedDbAvailable){ try{ await idbSetMeta('notifiedLog', log); }catch(e){} }
  else if(storageAvailable){ try{ window.localStorage.setItem('ft_notifiedLog', JSON.stringify(log)); }catch(e){} }
}
function updateNotifStatusUI(){
  const dot = document.getElementById('notif-dot');
  const el = document.getElementById('notif-status');
  const enableBtn = document.getElementById('notif-enable-btn');
  const disableBtn = document.getElementById('notif-disable-btn');
  if(!el) return;
  if(typeof Notification==='undefined'){
    dot.className = 'sync-dot';
    el.textContent = 'Not supported in this browser.';
    enableBtn.style.display='none'; disableBtn.style.display='none';
    return;
  }
  if(Notification.permission==='denied'){
    dot.className = 'sync-dot warn';
    el.textContent = 'Blocked — enable notifications for this site in your browser\'s settings to use this.';
    enableBtn.style.display='none'; disableBtn.style.display='none';
    return;
  }
  if(notificationsEnabled && Notification.permission==='granted'){
    dot.className = 'sync-dot ok';
    el.textContent = 'On — you\'ll be alerted about items due today while this tab is open.';
    enableBtn.style.display='none'; disableBtn.style.display='';
  } else {
    dot.className = 'sync-dot';
    el.textContent = 'Off — turn on to get alerted about due reminders and recurring bills.';
    enableBtn.style.display=''; disableBtn.style.display='none';
  }
}
async function enableNotifications(){
  if(typeof Notification==='undefined'){ toast('Not supported in this browser','warn'); return; }
  let perm = Notification.permission;
  if(perm==='default') perm = await Notification.requestPermission();
  if(perm!=='granted'){ toast('Notification permission was not granted','warn'); updateNotifStatusUI(); return; }
  notificationsEnabled = true;
  await setNotifPref(true);
  updateNotifStatusUI();
  toast('Notifications enabled ✓');
  checkAndNotify();
}
async function disableNotifications(){
  notificationsEnabled = false;
  await setNotifPref(false);
  updateNotifStatusUI();
  toast('Notifications turned off');
}
async function checkAndNotify(){
  if(!notificationsEnabled || typeof Notification==='undefined' || Notification.permission!=='granted') return;
  const today = new Date().toISOString().split('T')[0];

  const dueItems = [];
  state.reminders.forEach(r=>{ if(!r.done && r.due && r.due<=today) dueItems.push({ id:'rem-'+r.id, label:r.title }); });
  state.expenses.forEach(e=>{ if(e.recur && e.recur.nextDate && e.recur.nextDate<=today) dueItems.push({ id:'exp-'+e.id, label:e.desc+' (₹'+fmtNum(e.amt)+')' }); });
  state.incomes.forEach(e=>{ if(e.recur && e.recur.nextDate && e.recur.nextDate<=today) dueItems.push({ id:'inc-'+e.id, label:e.desc+' (₹'+fmtNum(e.amt)+')' }); });
  if(!dueItems.length) return;

  let log = await getNotifiedLog();
  if(log.date !== today) log = { date: today, ids: [] };
  const newItems = dueItems.filter(it=>!log.ids.includes(it.id));
  if(!newItems.length) return;

  const title = newItems.length===1 ? 'FinTrack: 1 item due today' : `FinTrack: ${newItems.length} items due today`;
  const body = newItems.slice(0,5).map(it=>it.label).join('\n') + (newItems.length>5 ? `\n…and ${newItems.length-5} more` : '');
  try{
    const notif = new Notification(title, { body });
    notif.onclick = () => {
      window.focus();
      switchScreen('reminder');
      notif.close();
    };
  }catch(e){ /* environments without real Notification support */ }

  log.ids = [...new Set([...log.ids, ...dueItems.map(it=>it.id)])];
  await setNotifiedLog(log);
}

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
  if(!confirm('This removes the PIN lock entirely — your financial data itself is unaffected. Continue?')) return;
  storedPinHash = null;
  setPinHashStorage(null);
  document.getElementById('lock-overlay').classList.remove('show');
  updatePinStatusUI();
  toast('PIN removed');
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

// ══════════════ BANK STATEMENT IMPORT (CSV + PDF, with review step) ══════════════
// Auto-parsing bank statements is never 100% reliable — column layouts vary
// by bank, and PDF text extraction is a best-effort heuristic. Rather than
// writing parsed rows straight into the ledger, every import lands in a
// review screen first so mistakes can be fixed or excluded before commit.
function triggerStatementImport(){ document.getElementById('statement-file-input').click(); }
function parseCSVLine(line){
  // Minimal CSV field parser handling quoted fields with embedded commas/quotes.
  const fields = [];
  let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const c = line[i];
    if(inQuotes){
      if(c==='"'){
        if(line[i+1]==='"'){ cur+='"'; i++; } else inQuotes=false;
      } else cur += c;
    } else {
      if(c==='"') inQuotes = true;
      else if(c===','){ fields.push(cur); cur=''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields.map(f=>f.trim());
}
function parseCSVDate(raw){
  if(!raw) return '';
  raw = raw.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  let m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(m){
    const [,d,mo,y] = m;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if(m){
    const [,d,mo,y] = m;
    return `20${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const d = new Date(raw);
  if(!isNaN(d)) return d.toISOString().split('T')[0];
  return '';
}

// ── CSV bank statement parsing ──
// ── Category auto-suggestion (keyword match against description) ──
const CATEGORY_KEYWORDS = {
  'Food & Dining': ['swiggy','zomato','restaurant','cafe','coffee','eatery','dine','food court','dominos','pizza','mcdonald','kfc','starbucks'],
  'Groceries': ['bigbasket','blinkit','zepto','grofers','dmart','grocery','supermarket','more retail','reliance fresh'],
  'Transport': ['uber','ola','rapido','fuel','petrol','diesel','metro','irctc','fastag','indian oil','hpcl','bpcl','parking','toll'],
  'Rent & Bills': ['rent','electricity','broadband','wifi','maintenance','gas bill','water bill','piped gas','landlord','society'],
  'Healthcare': ['pharmacy','hospital','clinic','apollo','medplus','diagnos','doctor','medical','healthkart'],
  'Entertainment': ['bookmyshow','pvr','inox','movie','cinema'],
  'Education': ['tuition','udemy','coursera','school fee','college','university','byju','unacademy'],
  'Shopping': ['amazon','flipkart','myntra','ajio','nykaa','shopping mall'],
  'Subscriptions': ['netflix','spotify','hotstar','prime video','youtube premium','apple.com/bill','google play','icloud'],
  'EMI / Loan': ['emi','loan','installment','nach','ecs'],
  'Gifts': ['gift'],
};
function guessCategoryFromDesc(desc){
  const d = (desc||'').toLowerCase();
  for(const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)){
    if(keywords.some(k=>d.includes(k))) return cat;
  }
  return 'Others';
}

// ── Skip non-transaction lines (balances, totals, running summaries) ──
const STATEMENT_EXCLUDE_KEYWORDS = [
  'opening balance','closing balance','carried forward','brought forward',
  'b/f','c/f','page total','grand total','statement summary','account summary',
  'total debit','total credit','net balance',
];
function isSummaryLine(desc){
  const d = (desc||'').toLowerCase().trim();
  return STATEMENT_EXCLUDE_KEYWORDS.some(k=>d.includes(k));
}

// ── Duplicate detection against what's already in the ledger ──
function normDesc(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function isDuplicateCandidate(row){
  const list = row.kind==='income' ? state.incomes : state.expenses;
  const rd = normDesc(row.desc);
  return list.some(e =>
    e.date===row.date &&
    Math.abs(e.amt - row.amt) < 0.01 &&
    (normDesc(e.desc)===rd || normDesc(e.desc).includes(rd) || rd.includes(normDesc(e.desc)))
  );
}

function parseCSVStatement(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const header = parseCSVLine(lines[0]).map(h=>h.toLowerCase());
  const idx = {
    date: header.findIndex(h=>h.includes('date')),
    desc: header.findIndex(h=>h.includes('desc')||h.includes('narration')||h.includes('particular')),
    cat: header.findIndex(h=>h.includes('categ')),
    type: header.findIndex(h=>h==='type'),
    acc: header.findIndex(h=>h.includes('account')),
    amt: header.findIndex(h=>(h.includes('amount')||h==='amt') && !h.includes('debit') && !h.includes('credit')),
    debit: header.findIndex(h=>h.includes('debit')||h.includes('withdrawal')),
    credit: header.findIndex(h=>h.includes('credit')||h.includes('deposit')),
    note: header.findIndex(h=>h.includes('note')||h.includes('remark')),
  };
  const hasHeader = idx.date>-1 || idx.desc>-1 || idx.amt>-1 || idx.debit>-1 || idx.credit>-1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  // Fallback column order for headerless files: Date, Description, Amount
  const fDate = idx.date>-1 ? idx.date : 0;
  const fDesc = idx.desc>-1 ? idx.desc : 1;
  const fAmt  = idx.amt>-1  ? idx.amt  : 2;

  const rows = [];
  dataLines.forEach(line=>{
    const cols = parseCSVLine(line);
    if(!cols.length || cols.every(c=>!c)) return;
    const date = parseCSVDate(cols[fDate]);
    const desc = (cols[fDesc]||'').trim();
    let amt = 0, kind = 'expense';
    if(idx.debit>-1 || idx.credit>-1){
      const debitVal = idx.debit>-1 ? parseFloat((cols[idx.debit]||'').replace(/[^0-9.\-]/g,'')) : 0;
      const creditVal = idx.credit>-1 ? parseFloat((cols[idx.credit]||'').replace(/[^0-9.\-]/g,'')) : 0;
      if(creditVal>0){ amt = creditVal; kind = 'income'; }
      else { amt = debitVal; kind = 'expense'; }
    } else {
      const raw = parseFloat((cols[fAmt]||'').replace(/[^0-9.\-]/g,''));
      amt = Math.abs(raw);
      kind = 'expense';
      if(idx.type>-1){
        const t = (cols[idx.type]||'').toLowerCase();
        if(t==='income' || t==='credit') kind = 'income';
      } else if(raw<0){
        kind = 'expense';
      }
    }
    if(!date || !desc || !(amt>0)) return;
    if(isSummaryLine(desc)) return;
    const cat = (idx.cat>-1 && CATEGORIES.includes(cols[idx.cat])) ? cols[idx.cat] : guessCategoryFromDesc(desc);
    const type = (idx.type>-1 && ['fixed','variable'].includes((cols[idx.type]||'').toLowerCase())) ? cols[idx.type].toLowerCase() : 'variable';
    const acc = (idx.acc>-1 && cols[idx.acc]) ? cols[idx.acc] : 'Savings Account';
    const row = {
      date, desc, amt, cat, type, acc,
      note: idx.note>-1 ? (cols[idx.note]||'') : '',
      kind, included: true,
    };
    row.possibleDuplicate = isDuplicateCandidate(row);
    if(row.possibleDuplicate) row.included = false;
    rows.push(row);
  });
  return rows;
}

// ── PDF bank statement parsing ──
async function extractPdfLines(arrayBuffer){
  if(!window.pdfjsLib) throw new Error('PDF support not available in this browser');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for(let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rowsByY = {};
    content.items.forEach(item=>{
      const y = Math.round(item.transform[5]);
      if(!rowsByY[y]) rowsByY[y] = [];
      rowsByY[y].push({ x:item.transform[4], str:item.str });
    });
    const ys = Object.keys(rowsByY).map(Number).sort((a,b)=>b-a);
    ys.forEach(y=>{
      const sorted = rowsByY[y].sort((a,b)=>a.x-b.x);
      let line = '', lastEnd = null;
      sorted.forEach(it=>{
        if(lastEnd!==null && it.x-lastEnd > 12) line += '   ';
        else if(line) line += ' ';
        line += it.str;
        lastEnd = it.x + it.str.length*4;
      });
      if(line.trim()) lines.push(line.trim());
    });
  }
  return lines;
}
const STMT_DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/;
const STMT_AMOUNT_RE = /-?₹?\s?[\d,]+\.\d{1,2}/g;
function parseStatementLines(lines){
  const rows = [];
  lines.forEach(line=>{
    const dateMatch = line.match(STMT_DATE_RE);
    if(!dateMatch) return;
    const dateStr = dateMatch[0];
    const afterDate = line.slice(line.indexOf(dateStr)+dateStr.length);
    const amounts = afterDate.match(STMT_AMOUNT_RE);
    if(!amounts || !amounts.length) return;
    const firstAmountIdx = afterDate.search(STMT_AMOUNT_RE);
    let desc = firstAmountIdx>-1 ? afterDate.slice(0, firstAmountIdx) : afterDate;
    desc = desc.replace(/\s+/g,' ').trim();
    if(!desc) desc = 'Statement transaction';
    if(isSummaryLine(desc) || isSummaryLine(line)) return;

    const isCredit = /\bCR\b/i.test(line) && !/\bDR\b/i.test(line);
    // With two+ amount columns (debit/credit/balance), the last is usually the
    // running balance — use the second-to-last as the transaction amount.
    const amtToken = amounts.length>=2 ? amounts[amounts.length-2] : amounts[amounts.length-1];
    const amtVal = parseFloat(amtToken.replace(/[^\d.\-]/g,''));
    if(!(amtVal>0)) return;

    const row = {
      date: parseCSVDate(dateStr), desc, amt: amtVal,
      cat: guessCategoryFromDesc(desc), type: 'variable', acc: 'Savings Account', note: '',
      kind: isCredit ? 'income' : 'expense', included: true,
    };
    row.possibleDuplicate = isDuplicateCandidate(row);
    if(row.possibleDuplicate) row.included = false;
    rows.push(row);
  });
  return rows;
}

function handleStatementFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const isPdf = /pdf$/i.test(file.name) || file.type==='application/pdf';
  if(isPdf){
    const reader = new FileReader();
    reader.onload = async function(e){
      try{
        const lines = await extractPdfLines(e.target.result);
        const rows = parseStatementLines(lines);
        openStatementPreview(rows, file.name);
      }catch(err){
        toast(err.message || 'Could not read that PDF','danger');
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const rows = parseCSVStatement(e.target.result);
        openStatementPreview(rows, file.name);
      }catch(err){
        toast('Could not read that file','danger');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }
}

// ── Review modal ──
let statementCandidateRows = [];
let statementSourceLabel = '';
function openStatementPreview(rows, sourceLabel){
  statementCandidateRows = rows;
  statementSourceLabel = sourceLabel;
  document.getElementById('stmt-modal').classList.add('open');
  renderStatementSummary();
  renderStatementRows();
}
function closeStmtModal(e){
  if(!e||e.target===document.getElementById('stmt-modal')){
    document.getElementById('stmt-modal').classList.remove('open');
    statementCandidateRows = [];
  }
}
function renderStatementSummary(){
  const rows = statementCandidateRows;
  const summaryEl = document.getElementById('stmt-summary');
  const selectAllRow = document.getElementById('stmt-select-all-row');
  const importBtn = document.getElementById('stmt-import-btn');
  if(!rows.length){
    summaryEl.textContent = `No transactions could be recognized in "${statementSourceLabel}". Try exporting a CSV from your bank instead, or check the file isn't a scanned image.`;
    selectAllRow.style.display = 'none';
    importBtn.style.display = 'none';
    return;
  }
  const expenseCount = rows.filter(r=>r.kind==='expense').length;
  const incomeCount = rows.filter(r=>r.kind==='income').length;
  const dupCount = rows.filter(r=>r.possibleDuplicate).length;
  summaryEl.textContent = `Found ${rows.length} transaction${rows.length===1?'':'s'} in "${statementSourceLabel}" — ${expenseCount} expense${expenseCount===1?'':'s'}, ${incomeCount} income entr${incomeCount===1?'y':'ies'}.`
    + (dupCount ? ` ${dupCount} look${dupCount===1?'s':''} like a duplicate of something already in your ledger and ${dupCount===1?'is':'are'} unchecked below.` : '')
    + ' Check the details before importing.';
  selectAllRow.style.display = '';
  importBtn.style.display = '';
}
function statementRowHtml(r, i){
  const catSelect = r.kind==='expense'
    ? `<select onchange="updateStatementRow(${i},'cat',this.value)">${CATEGORIES.map(c=>`<option ${c===r.cat?'selected':''}>${c}</option>`).join('')}</select>`
    : '';
  const dupBadge = r.possibleDuplicate ? `<span class="tag tag-variable" style="flex-shrink:0;">Possible duplicate</span>` : '';
  return `
    <div class="stmt-row">
      <input type="checkbox" ${r.included?'checked':''} onchange="toggleStatementRow(${i},this.checked)"/>
      <span class="stmt-desc" title="${escapeHtml(r.desc)}">${escapeHtml(r.desc)}</span>
      ${dupBadge}
      <input type="date" value="${r.date}" onchange="updateStatementRow(${i},'date',this.value)"/>
      <input type="number" min="0" step="0.01" value="${r.amt}" onchange="updateStatementRow(${i},'amt',this.value)"/>
      <select onchange="updateStatementRow(${i},'kind',this.value)">
        <option value="expense" ${r.kind==='expense'?'selected':''}>Expense</option>
        <option value="income" ${r.kind==='income'?'selected':''}>Income</option>
      </select>
      ${catSelect}
    </div>`;
}
function renderStatementRows(){
  const rowsEl = document.getElementById('stmt-rows');
  const rows = statementCandidateRows;
  if(!rows.length){ rowsEl.innerHTML = ''; return; }
  if(rows.length > 150){
    // Too many to edit individually — show a quick sample and import the rest as-is.
    const dupCount = rows.filter(r=>r.possibleDuplicate).length;
    const willImport = rows.filter(r=>r.included).length;
    rowsEl.innerHTML = rows.slice(0,10).map((r,i)=>`
      <div class="stmt-summary-line">${fmtDate(r.date)} · ${escapeHtml(r.desc)} · <b>${r.kind==='income'?'+':'-'}₹${fmtNum(r.amt)}</b> (${r.kind})${r.possibleDuplicate?' · <span style="color:var(--warn);">possible duplicate, excluded</span>':''}</div>
    `).join('') + `<div class="stmt-summary-line">…and ${rows.length-10} more — showing the first 10 for a quick sanity check. ${willImport} of ${rows.length} will import${dupCount?` (${dupCount} possible duplicate${dupCount===1?'':'s'} excluded)`:''}; edit any mistakes afterward in the expense/income list.</div>`;
  } else {
    rowsEl.innerHTML = rows.map((r,i)=>statementRowHtml(r,i)).join('');
  }
}
function toggleStatementRow(i, checked){
  statementCandidateRows[i].included = checked;
}
function toggleAllStatementRows(checked){
  statementCandidateRows.forEach(r=>r.included=checked);
  renderStatementRows();
}
function updateStatementRow(i, field, value){
  const row = statementCandidateRows[i];
  if(!row) return;
  if(field==='amt') row.amt = parseFloat(value)||0;
  else row[field] = value;
  if(['date','amt','kind','desc'].includes(field)){
    row.possibleDuplicate = isDuplicateCandidate(row);
  }
  renderStatementRows(); // duplicate badge / category select visibility may need to update
}
async function confirmStatementImport(){
  const rows = statementCandidateRows.filter(r=>r.included && r.date && r.desc && r.amt>0);
  if(!rows.length){ toast('No rows selected to import','warn'); return; }
  let expAdded = 0, incAdded = 0;
  rows.forEach(r=>{
    if(r.kind==='income'){
      state.incomes.unshift({ id:uid(), desc:r.desc, amt:r.amt, date:r.date, type:r.type||'variable', acc:r.acc||'Savings Account', note:r.note||'', recur:null });
      incAdded++;
    } else {
      state.expenses.unshift({ id:uid(), desc:r.desc, amt:r.amt, date:r.date, cat:r.cat||'Others', type:r.type||'variable', acc:r.acc||'Savings Account', note:r.note||'', recur:null });
      expAdded++;
    }
  });
  if(expAdded) await persist('expenses');
  if(incAdded) await persist('incomes');
  state.importHistory.unshift({
    id: uid(),
    source: statementSourceLabel || 'Statement',
    when: new Date().toISOString(),
    expenseCount: expAdded,
    incomeCount: incAdded,
  });
  if(state.importHistory.length > 50) state.importHistory.length = 50; // cap so this list can't grow forever
  await persist('importHistory');
  document.getElementById('stmt-modal').classList.remove('open');
  statementCandidateRows = [];
  renderExpenses();
  updateDataUsage();
  renderImportHistory();
  toast(`Imported ${expAdded} expense${expAdded===1?'':'s'} and ${incAdded} income entr${incAdded===1?'y':'ies'} ✓`);
}
function renderImportHistory(){
  const el = document.getElementById('import-history-list');
  const clearBtn = document.getElementById('import-history-clear-btn');
  if(!el) return;
  if(!state.importHistory.length){
    el.innerHTML = '<div class="empty"><p>No imports yet</p><span>Statement imports you run will be logged here</span></div>';
    if(clearBtn) clearBtn.style.display = 'none';
    return;
  }
  if(clearBtn) clearBtn.style.display = '';
  el.innerHTML = state.importHistory.slice(0,20).map(h=>{
    const parts = [];
    if(h.expenseCount) parts.push(h.expenseCount+' expense'+(h.expenseCount===1?'':'s'));
    if(h.incomeCount) parts.push(h.incomeCount+' income entr'+(h.incomeCount===1?'y':'ies'));
    return `
    <div class="import-hist-row">
      <div class="name">${escapeHtml(h.source)}</div>
      <div class="meta">${parts.join(', ')||'0 rows'} · ${timeAgo(h.when)}</div>
    </div>`;
  }).join('');
}
async function clearImportHistory(){
  if(!confirm('Clear the import history log? This does not remove any transactions, only the log of past imports.')) return;
  state.importHistory = [];
  await persist('importHistory');
  renderImportHistory();
  toast('Import history cleared');
}


(async function init(){
  await loadAll();
  applyTheme();
  populateCatFilter();
  renderProfile();
  renderExpenses();
  renderReminders();
  renderUpcomingRecurring();
  maybeShowOnboarding();
  updateDbStatus();
  updateLocalFileStatus();
  updateP2PStatus('idle');
  updatePinStatusUI();
  updateDataUsage();
  renderBackupTimestamps();
  renderImportHistory();
  notificationsEnabled = await getNotifPref();
  updateNotifStatusUI();
  await tryReconnectLocalFile();
  storedPinHash = await getPinHash();
  const statusEl = document.getElementById('storage-status');
  statusEl.textContent = indexedDbAvailable
    ? 'Your data lives in the local database above. Connect a local file too, or download a backup occasionally, in case you clear browser data or switch devices.'
    : (storageAvailable
      ? 'Saving to this browser\'s local storage automatically. Connect a local file above or download a backup occasionally in case you clear browser data or switch devices.'
      : 'This environment doesn\'t allow saving data automatically — nothing persists after you leave. Connect a local file above (if supported), or download a backup before you go and import it next time.');
  document.getElementById('load-overlay').classList.add('hide');
  setTimeout(()=>document.getElementById('load-overlay').remove(),350);
  if(storedPinHash) showLockScreen();
  checkAndNotify();
  setInterval(checkAndNotify, 5*60*1000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkAndNotify(); });
})();

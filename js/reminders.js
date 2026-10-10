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
  const today = toLocalDateStr();
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
  const today = toLocalDateStr();

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



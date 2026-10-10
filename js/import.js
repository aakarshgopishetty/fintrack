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
  if(!isNaN(d)) return toLocalDateStr(d);
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


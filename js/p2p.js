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
  sendChunked(dataChannel, JSON.stringify(buildDataPayload()));
  markBackupEvent('p2pSend');
  toast('Data sent ✓');
}

function sendChunked(channel, payloadStr) {
  const CHUNK_SIZE = 16000;
  const chunks = Math.ceil(payloadStr.length / CHUNK_SIZE);
  channel.send(JSON.stringify({ type: 'header', chunks }));
  for (let i = 0; i < chunks; i++) {
    channel.send(JSON.stringify({ type: 'chunk', index: i, data: payloadStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) }));
  }
}
let incomingChunks = [];
let expectedChunks = 0;
async function handleIncomingSync(raw) {
  let data;
  try { data = JSON.parse(raw); } catch(e) { return; }
  if (data.type === 'header') { expectedChunks = data.chunks; incomingChunks = []; return; }
  if (data.type === 'chunk') {
    incomingChunks.push(data.data);
    if (incomingChunks.length === expectedChunks) {
      const fullStr = incomingChunks.join('');
      let payload;
      try { payload = JSON.parse(fullStr); } catch(e) { toast('Received invalid data','danger'); return; }
      const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('en-IN') : 'unknown time';
      if (!confirm('Received data from the connected device (exported '+when+'). Import it?')) return;
      await applyImportedPayload(payload);
      markBackupEvent('p2pReceive');
      toast('Data received and imported ✓');
    }
    return;
  }
  // legacy fallback
  try { data = JSON.parse(raw); } catch(e) { return; }
  if (!data.exportedAt) return;
  const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-IN') : 'unknown time';
  if (!confirm('Received data from the connected device (exported '+when+'). Import it?')) return;
  await applyImportedPayload(data);
  markBackupEvent('p2pReceive');
  toast('Data received and imported ✓');
}




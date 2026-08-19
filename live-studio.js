(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const liveView=$('#view-live');
if(!liveView)return;

if(!document.querySelector('link[data-live-phase1]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./live-studio-phase1.css?v=1';
  link.dataset.livePhase1='true';
  document.head.appendChild(link);
}

const CUE_HELP='Headphones only — listeners cannot hear this channel.';
const attachableIds=new Set(['music','carts','requests']);

let micStream=null,audioContext=null,sourceNode=null,micAnalyser=null,rafId=null;
let micInputGain=null,programBusGain=null,masterMonitorGain=null,cueMonitorGain=null;
let selectedShow='',isLive=false,signalReady=false,activeCue=null;
const channelNodes=new Map();
const channelMuted={mic:false,music:false,carts:false,requests:false,master:false};

const consoleShell=document.createElement('div');
consoleShell.className='broadcast-console';
consoleShell.id='broadcastConsole';
consoleShell.innerHTML=`
  <section class="console-topbar">
    <div class="console-identity"><div class="console-status-light" id="consoleStatusLight"></div><div><p class="eyebrow">PARAÍSO BROADCAST CONSOLE</p><h2 id="consoleStateTitle">Prepare the board</h2></div></div>
    <div class="console-ready-pill" id="consoleReadyPill"><i></i><span>MIC CONNECTING</span></div>
  </section>
  <section class="setup-ribbon">
    <label class="ribbon-field"><span>SHOW</span><select id="liveShowSelect"><option value="">Select show…</option><option>Sebastián Live</option><option>Viernes en Paraíso</option><option>Guest DJ Session</option><option>Special Broadcast</option></select></label>
    <label class="ribbon-field"><span>MICROPHONE</span><select id="micDeviceSelect"><option value="">Default microphone</option></select></label>
    <label class="ribbon-field"><span>HEADPHONES / OUTPUT</span><select id="outputDeviceSelect"><option value="">System default output</option></select></label>
    <div class="ribbon-health" id="ribbonHealth">
      <div class="health-check" id="checkMic"><i>1</i><span><b>MIC</b><small>Connecting</small></span></div>
      <div class="health-check" id="checkSignal"><i>2</i><span><b>SIGNAL</b><small>Waiting</small></span></div>
      <div class="health-check" id="checkShow"><i>3</i><span><b>SHOW</b><small>Choose one</small></span></div>
      <div class="health-check ready" id="checkFallback"><i>✓</i><span><b>FALLBACK</b><small>AutoDJ ready</small></span></div>
    </div>
  </section>
  <section class="mixer-surface">
    <div class="mixer-header"><div><p class="eyebrow">MIXER</p><h3>Broadcast channels</h3></div><p class="cue-help"><b>CUE</b> ${CUE_HELP}</p></div>
    <div class="channel-bank">
      ${channelStrip('mic','MIC','Voice',72,true,'real')}
      ${channelStrip('music','MUSIC','Live music',64,false,'demo')}
      ${channelStrip('carts','CARTS','IDs / jingles',58,false,'demo')}
      ${channelStrip('requests','REQUESTS','Listener queue',52,false,'demo')}
      ${channelStrip('master','MASTER','Program out',82,true,'real')}
    </div>
    <div class="monitor-readout">
      <div><span>MONITOR</span><strong id="monitorReadout">OFF</strong><small id="monitorDetail">${CUE_HELP}</small></div>
      <div><span>PROGRAM</span><strong id="programReadout">AutoDJ</strong><small id="programDetail">Live feed not armed</small></div>
      <div><span>MIC INPUT</span><strong id="inputDb">— dB</strong><small id="inputHint">Requesting microphone access…</small></div>
    </div>
    <div class="live-mic-error" id="micError"></div>
  </section>
  <section class="console-lower-grid">
    <article class="console-dock"><div class="dock-heading"><div><p class="eyebrow">NEXT ON DECK</p><h3>DJ queue</h3></div><span>Prepared set</span></div><div class="deck-list">${queueRow('01','Fatalidad','Julio Jaramillo • 3:38')}${queueRow('02','Guayaquil de Mis Amores','Traditional Ecuador • 3:10')}${queueRow('03','Salsa de Queens','Demo Orchestra • 4:12')}</div></article>
    <article class="console-dock"><div class="dock-heading"><div><p class="eyebrow">LISTENER REQUESTS</p><h3>Incoming</h3></div><span class="request-tag">3 waiting</span></div><div class="incoming-list">${requestRow('M','Maria','Fatalidad • Queens')}${requestRow('C','Carlos','Guayaquil de Mis Amores • Brooklyn')}${requestRow('A','Ana','Nuestro Juramento • Cuenca')}</div></article>
  </section>
  <section class="air-bar"><div class="air-status" id="airStatus"><i></i><div><span>OFF AIR</span><strong id="airStatusText">Connect microphone and choose a show before taking control.</strong></div></div><div class="air-actions"><button class="air-review" id="reviewButton" disabled>Review setup</button><button class="air-button" id="airButton" disabled><span class="air-button-dot"></span><b>GO ON AIR</b><small>Take over from AutoDJ</small></button></div></section>`;
liveView.insertBefore(consoleShell,liveView.firstChild);

function channelStrip(id,label,sub,value,realMeter,sourceState){
  const badge=sourceState==='real'?'REAL':'DEMO SOURCE';
  return `<div class="channel-strip" data-channel="${id}"><div class="channel-label"><div class="channel-title-row"><b>${label}</b><span class="channel-source-badge ${sourceState}">${badge}</span></div><span>${sub}</span><em class="channel-program-state" id="${id}ProgramState">NOT ON PROGRAM</em></div><div class="channel-meter" id="${id}Meter">${'<i></i>'.repeat(18)}</div><div class="channel-db"><span>0</span><span>-12</span><span>-24</span><span>-48</span></div><input class="channel-fader" id="${id}Level" type="range" min="0" max="100" value="${value}" aria-label="${label} level"><output id="${id}Value">${value}%</output><div class="channel-buttons"><button class="channel-btn mute" data-channel-mute="${id}">MUTE</button><button class="channel-btn cue" data-channel-cue="${id}" title="${CUE_HELP}" aria-label="Cue ${label}. ${CUE_HELP}">CUE</button></div>${realMeter?'<span class="real-meter-badge">LIVE METER</span>':''}</div>`;
}
function queueRow(n,title,sub){return `<div class="deck-row"><span class="deck-number">${n}</span><div class="deck-copy"><strong>${title}</strong><small>${sub}</small></div><button class="queue-action">Play next</button></div>`}
function requestRow(initial,name,sub){return `<div class="incoming-row"><span class="incoming-avatar">${initial}</span><div class="incoming-copy"><strong>${name}</strong><small>${sub}</small></div><button class="request-action">Accept</button></div>`}

const dialog=document.createElement('dialog');
dialog.className='live-confirm-dialog';
dialog.id='liveConfirmDialog';
dialog.innerHTML=`<form method="dialog"><div class="confirm-icon" id="confirmIcon">●</div><p class="eyebrow" id="confirmEyebrow">READY TO BROADCAST</p><h3 id="confirmTitle">Go on air?</h3><p id="confirmCopy">AutoDJ will hand control to this local live board. Backend streaming is still demo-only.</p><div class="confirm-summary"><div><span>Show</span><strong id="confirmShow">—</strong></div><div><span>Microphone</span><strong id="confirmMic">—</strong></div><div><span>Cue</span><strong id="confirmMonitor">Off</strong></div><div><span>Fallback</span><strong>AutoDJ ready</strong></div></div><div class="confirm-actions"><button class="confirm-cancel" value="cancel">Cancel</button><button class="confirm-onair" id="confirmOnAir" value="default" type="button">GO ON AIR</button></div></form>`;
document.body.appendChild(dialog);

const showSelect=$('#liveShowSelect'),micSelect=$('#micDeviceSelect'),outputSelect=$('#outputDeviceSelect'),reviewButton=$('#reviewButton'),airButton=$('#airButton');

function setCheck(id,ready,detail){const el=$(id);if(!el)return;el.classList.toggle('ready',ready);el.querySelector('i').textContent=ready?'✓':id==='#checkMic'?'1':id==='#checkSignal'?'2':'3';el.querySelector('small').textContent=detail;}
function updateReadyState(){
  const micReady=!!micStream,ready=micReady&&signalReady&&!!selectedShow;
  setCheck('#checkMic',micReady,micReady?'Connected':'Permission needed');
  setCheck('#checkSignal',signalReady,signalReady?'Healthy':'Waiting for audio');
  setCheck('#checkShow',!!selectedShow,selectedShow||'Choose one');
  const pill=$('#consoleReadyPill');pill.classList.toggle('ready',ready||isLive);pill.querySelector('span').textContent=isLive?'ON AIR':ready?'READY':micReady?'SETUP NEEDED':'MIC NEEDED';
  reviewButton.disabled=!ready||isLive;airButton.disabled=!ready&&!isLive;
  if(!isLive){airButton.classList.remove('end');airButton.querySelector('b').textContent='GO ON AIR';airButton.querySelector('small').textContent='Take over from AutoDJ';}
  $('#consoleStateTitle').textContent=isLive?'Live program in progress':ready?'Board ready for air':micReady?'Choose a show':'Microphone access needed';
  $('#airStatusText').textContent=isLive?'Listeners are on the live program feed.':ready?'Setup complete. Review or go on air.':'Connect microphone and choose a show before taking control.';
  updateProgramStates();
}

async function enumerateDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const devices=await navigator.mediaDevices.enumerateDevices(),currentMic=micSelect.value,currentOut=outputSelect.value;
  const mics=devices.filter(d=>d.kind==='audioinput'),outs=devices.filter(d=>d.kind==='audiooutput');
  micSelect.innerHTML='<option value="">Default microphone</option>'+mics.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Microphone ${i+1}`}</option>`).join('');
  outputSelect.innerHTML='<option value="">System default output</option>'+outs.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Output ${i+1}`}</option>`).join('');
  if([...micSelect.options].some(o=>o.value===currentMic))micSelect.value=currentMic;
  if([...outputSelect.options].some(o=>o.value===currentOut))outputSelect.value=currentOut;
}
function ensureAudioContext(){
  if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();programBusGain=audioContext.createGain();masterMonitorGain=audioContext.createGain();cueMonitorGain=audioContext.createGain();programBusGain.connect(masterMonitorGain);masterMonitorGain.connect(audioContext.destination);masterMonitorGain.gain.value=0;cueMonitorGain.gain.value=.85;}
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
}
function updateAudioGains(){
  if(micInputGain)micInputGain.gain.value=channelMuted.mic?0:Number($('#micLevel').value)/100;
  if(programBusGain)programBusGain.gain.value=Number($('#masterLevel').value)/100;
  if(masterMonitorGain)masterMonitorGain.gain.value=(activeCue==='master'&&!channelMuted.master)?1:0;
}
function disconnectCueRouting(){
  try{sourceNode?.disconnect(cueMonitorGain)}catch{}
  for(const node of channelNodes.values())try{node.disconnect(cueMonitorGain)}catch{}
  activeCue=null;
  $$('.channel-strip').forEach(s=>s.classList.remove('is-cued'));
  $$('[data-channel-cue]').forEach(b=>b.classList.remove('active'));
  $('#monitorReadout').textContent='OFF';$('#monitorDetail').textContent=CUE_HELP;
  updateAudioGains();
}
function setCue(id){
  ensureAudioContext();
  if(activeCue===id){disconnectCueRouting();return;}
  disconnectCueRouting();activeCue=id;
  const strip=$(`.channel-strip[data-channel="${id}"]`),btn=$(`[data-channel-cue="${id}"]`);strip?.classList.add('is-cued');btn?.classList.add('active');
  if(id==='mic'&&micInputGain){micInputGain.connect(cueMonitorGain);$('#monitorReadout').textContent='MIC';}
  else if(id==='master'){masterMonitorGain.gain.value=channelMuted.master?0:1;$('#monitorReadout').textContent='MASTER';}
  else if(channelNodes.has(id)){channelNodes.get(id).connect(cueMonitorGain);$('#monitorReadout').textContent=id.toUpperCase();}
  else{$('#monitorReadout').textContent=`${id.toUpperCase()} · DEMO`;showError(`${id.toUpperCase()} has no real audio source yet. CUE is armed as a routing hook only.`)}
  $('#monitorDetail').textContent=CUE_HELP;updateAudioGains();
}
function updateProgramStates(){
  ['mic','music','carts','requests','master'].forEach(id=>{
    const onProgram=id==='master'?isLive:(id==='mic'?isLive&&!channelMuted.mic:(isLive&&channelNodes.has(id)&&!channelMuted[id]));
    const el=$(`#${id}ProgramState`);if(el){el.textContent=onProgram?'PROGRAM':'NOT ON PROGRAM';el.classList.toggle('on',onProgram)}
  });
}
function updateMuteVisual(id){$(`.channel-strip[data-channel="${id}"]`)?.classList.toggle('is-muted',channelMuted[id]);updateProgramStates()}
function showError(msg){const err=$('#micError');err.textContent=msg;err.classList.add('show');clearTimeout(showError.timer);showError.timer=setTimeout(()=>err.classList.remove('show'),4200)}
function clearMeter(id){$$(`#${id} i`).forEach(i=>i.className='')}
function paintMeter(id,n){const bars=$$(`#${id} i`),lit=Math.round(Math.max(0,Math.min(1,n))*bars.length);bars.forEach((bar,i)=>bar.className=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):'')}

function stopMic(){
  cancelAnimationFrame(rafId);rafId=null;
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
  try{sourceNode?.disconnect()}catch{};try{micInputGain?.disconnect()}catch{}
  sourceNode=micAnalyser=micInputGain=null;signalReady=false;clearMeter('micMeter');clearMeter('masterMeter');$('#inputDb').textContent='— dB';$('#inputHint').textContent='Microphone disconnected';updateReadyState();
}
async function connectMicrophone(){
  if(!navigator.mediaDevices?.getUserMedia){showError('Microphone input is not available in this browser.');return;}
  stopMic();
  try{
    const constraints=micSelect.value?{audio:{deviceId:{exact:micSelect.value},echoCancellation:false,noiseSuppression:false,autoGainControl:false}}:{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
    micStream=await navigator.mediaDevices.getUserMedia(constraints);ensureAudioContext();await enumerateDevices();
    sourceNode=audioContext.createMediaStreamSource(micStream);micAnalyser=audioContext.createAnalyser();micAnalyser.fftSize=256;micAnalyser.smoothingTimeConstant=.72;micInputGain=audioContext.createGain();sourceNode.connect(micAnalyser);sourceNode.connect(micInputGain);micInputGain.connect(programBusGain);updateAudioGains();
    $('#inputHint').textContent='Microphone connected';updateReadyState();
    const data=new Uint8Array(micAnalyser.frequencyBinCount);let healthyFrames=0;
    const draw=()=>{micAnalyser.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b,0)/data.length,n=Math.min(1,avg/88),micLevel=n*(channelMuted.mic?0:Number($('#micLevel').value)/100),masterLevel=micLevel*(Number($('#masterLevel').value)/100);paintMeter('micMeter',n);paintMeter('masterMeter',masterLevel);$('#inputDb').textContent=`${Math.round(-60+n*58)} dB`;if(n>.025){healthyFrames++;$('#inputHint').textContent='Signal detected'}if(healthyFrames>8&&!signalReady){signalReady=true;updateReadyState()}animateDemoMeters();rafId=requestAnimationFrame(draw)};draw();
  }catch(e){showError(e?.name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access to operate Live Studio.':'Could not open that microphone. Try another input.');$('#inputHint').textContent='Microphone permission required';updateReadyState()}
}
function animateDemoMeters(){
  const t=Date.now()/550,f=isLive?1:.28;
  paintMeter('musicMeter',(0.18+Math.abs(Math.sin(t))*.42)*f*Number($('#musicLevel').value)/100);
  paintMeter('cartsMeter',(0.08+Math.abs(Math.sin(t*.63))*.24)*f*Number($('#cartsLevel').value)/100);
  paintMeter('requestsMeter',(0.06+Math.abs(Math.cos(t*.42))*.18)*f*Number($('#requestsLevel').value)/100);
}

window.PARAISO_LIVE_AUDIO={
  attachSource(id,node){if(!attachableIds.has(id)||!node||typeof node.connect!=='function')return false;ensureAudioContext();channelNodes.set(id,node);node.connect(programBusGain);const badge=$(`.channel-strip[data-channel="${id}"] .channel-source-badge`);if(badge){badge.textContent='REAL';badge.classList.remove('demo');badge.classList.add('real')}updateAudioGains();if(activeCue===id){disconnectCueRouting();activeCue=id;$(`.channel-strip[data-channel="${id}"]`)?.classList.add('is-cued');$(`[data-channel-cue="${id}"]`)?.classList.add('active');node.connect(cueMonitorGain);$('#monitorReadout').textContent=id.toUpperCase();$('#monitorDetail').textContent=CUE_HELP}updateProgramStates();return true},
  detachSource(id){const node=channelNodes.get(id);if(node)try{node.disconnect(programBusGain)}catch{};channelNodes.delete(id);const badge=$(`.channel-strip[data-channel="${id}"] .channel-source-badge`);if(badge){badge.textContent='DEMO SOURCE';badge.classList.remove('real');badge.classList.add('demo')}if(activeCue===id)disconnectCueRouting();updateProgramStates()},
  get context(){return audioContext},get programBus(){return programBusGain}
};

function setLive(next){
  isLive=next;document.body.classList.toggle('live-broadcasting',isLive);$('#consoleStatusLight').classList.toggle('live',isLive);$('#programReadout').textContent=isLive?'LIVE PROGRAM':'AutoDJ';$('#programDetail').textContent=isLive?'Local program bus active — backend transport still demo':'Live feed not armed';const airStatus=$('#airStatus');airStatus.classList.toggle('live',isLive);airStatus.querySelector('span').textContent=isLive?'ON AIR':'OFF AIR';showSelect.disabled=isLive;micSelect.disabled=isLive;if(isLive){airButton.disabled=false;airButton.classList.add('end');airButton.querySelector('b').textContent='END BROADCAST';airButton.querySelector('small').textContent='Return control to AutoDJ'}updateReadyState();
}
function openConfirm(end=false){$('#confirmShow').textContent=selectedShow||'Live broadcast';$('#confirmMic').textContent=micSelect.selectedOptions[0]?.textContent||'Default microphone';$('#confirmMonitor').textContent=activeCue?activeCue.toUpperCase():'Off';$('#confirmEyebrow').textContent=end?'END LIVE BROADCAST':'READY TO BROADCAST';$('#confirmTitle').textContent=end?'Return to AutoDJ?':'Go on air?';$('#confirmCopy').textContent=end?'The local live program will end and AutoDJ demo mode will resume.':'The local board will enter ON AIR state. No backend stream is being faked.';$('#confirmIcon').textContent=end?'■':'●';const action=$('#confirmOnAir');action.textContent=end?'END BROADCAST':'GO ON AIR';action.classList.toggle('danger',end);action.dataset.mode=end?'end':'start';dialog.showModal()}

showSelect.addEventListener('change',()=>{selectedShow=showSelect.value;updateReadyState()});
micSelect.addEventListener('change',connectMicrophone);
outputSelect.addEventListener('change',async()=>{if(audioContext&&typeof audioContext.setSinkId==='function'){try{await audioContext.setSinkId(outputSelect.value||'default');$('#monitorDetail').textContent='Headphone output updated.'}catch{showError('This browser could not switch to that output. System default will be used.')}}else if(outputSelect.value)showError('This browser uses the system audio output for monitoring.')});
[['mic','master','music','carts','requests']].flat().forEach(id=>$(`#${id}Level`).addEventListener('input',e=>{$(`#${id}Value`).textContent=`${e.target.value}%`;updateAudioGains()}));
$$('[data-channel-mute]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.channelMute;channelMuted[id]=!channelMuted[id];btn.classList.toggle('active',channelMuted[id]);btn.textContent=channelMuted[id]?'MUTED':'MUTE';updateMuteVisual(id);updateAudioGains()}));
$$('[data-channel-cue]').forEach(btn=>btn.addEventListener('click',()=>setCue(btn.dataset.channelCue)));
$$('.queue-action').forEach(btn=>btn.addEventListener('click',()=>{$$('.queue-action.armed').forEach(b=>{b.classList.remove('armed');b.textContent='Play next'});btn.classList.add('armed');btn.textContent='Armed ✓'}));
$$('.request-action').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.add('accepted');btn.textContent='Queued ✓';btn.disabled=true}));
reviewButton.addEventListener('click',()=>openConfirm(false));airButton.addEventListener('click',()=>openConfirm(isLive));$('#confirmOnAir').addEventListener('click',()=>{const end=$('#confirmOnAir').dataset.mode==='end';dialog.close();setLive(!end)});
$('#goLiveButton')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelector('.nav-item[data-view="live"]')?.click();setTimeout(()=>$('#broadcastConsole')?.scrollIntoView({behavior:'smooth',block:'start'}),80)},true);
window.addEventListener('beforeunload',()=>{if(micStream)micStream.getTracks().forEach(t=>t.stop())});

updateProgramStates();updateReadyState();connectMicrophone();
})();
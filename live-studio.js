(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const liveView=$('#view-live');
if(!liveView)return;

if(!document.querySelector('link[href*="live-studio-phase1.css"]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./live-studio-phase1.css?v=2';
  link.dataset.livePhase1='true';
  document.head.appendChild(link);
}

const CUE_HELP='Headphones only — listeners cannot hear this channel. Pre-fader: CUE still works when muted or the channel fader is down.';
const attachableIds=new Set(['music','carts','requests']);

let micStream=null,audioContext=null,sourceNode=null,micAnalyser=null,meterRaf=null;
let micInputGain=null,programMixGain=null,programLimiter=null,programBusGain=null,masterAnalyser=null,programStreamDest=null,cueMonitorGain=null;
let selectedShow='',isLive=false,signalReady=false,lastMicRms=0,lastMasterRms=0,healthyFrames=0;
const activeCues=new Set();
const channelNodes=new Map(); // id -> {source,cueSource,analyser,gain}
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
    <div class="mixer-header">
      <div><p class="eyebrow">MIXER</p><h3>Broadcast channels</h3></div>
      <div class="cue-tools">
        <label class="cue-volume-control" title="Controls headphone cue level only. Listeners are not affected.">
          <span>CUE VOLUME</span>
          <input id="cueVolume" type="range" min="0" max="100" value="85" aria-label="Cue headphone volume">
          <output id="cueVolumeValue">85%</output>
        </label>
        <p class="cue-help"><b>CUE</b> ${CUE_HELP}</p>
      </div>
    </div>
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
  return `<div class="channel-strip" data-channel="${id}"><div class="channel-label"><div class="channel-title-row"><b>${label}</b><span class="channel-source-badge ${sourceState}">${badge}</span></div><span>${sub}</span><em class="channel-program-state" id="${id}ProgramState">NOT ON PROGRAM</em></div><div class="channel-meter" id="${id}Meter">${'<i></i>'.repeat(18)}</div><div class="channel-db"><span>0</span><span>-12</span><span>-24</span><span>-48</span></div><input class="channel-fader" id="${id}Level" type="range" min="0" max="100" value="${value}" aria-label="${label} level"><output id="${id}Value">${value}%</output><div class="channel-buttons"><button class="channel-btn mute" data-channel-mute="${id}">MUTE</button><button class="channel-btn cue" data-channel-cue="${id}" title="${CUE_HELP}" aria-label="Cue ${label}. ${CUE_HELP}" aria-pressed="false"><span class="cue-word-tag">CUE</span><span class="cue-button-status">OFF</span></button></div>${realMeter?'<span class="real-meter-badge">LIVE METER</span>':''}</div>`;
}
function queueRow(n,title,sub){return `<div class="deck-row"><span class="deck-number">${n}</span><div class="deck-copy"><strong>${title}</strong><small>${sub}</small></div><button class="queue-action">Play next</button></div>`}
function requestRow(initial,name,sub){return `<div class="incoming-row"><span class="incoming-avatar">${initial}</span><div class="incoming-copy"><strong>${name}</strong><small>${sub}</small></div><button class="request-action">Accept</button></div>`}

const dialog=document.createElement('dialog');
dialog.className='live-confirm-dialog';
dialog.id='liveConfirmDialog';
dialog.innerHTML=`<form method="dialog"><div class="confirm-icon" id="confirmIcon">●</div><p class="eyebrow" id="confirmEyebrow">READY TO BROADCAST</p><h3 id="confirmTitle">Go on air?</h3><p id="confirmCopy">AutoDJ will hand control to this local live board. Backend streaming is still demo-only.</p><div class="confirm-summary"><div><span>Show</span><strong id="confirmShow">—</strong></div><div><span>Microphone</span><strong id="confirmMic">—</strong></div><div><span>Cue</span><strong id="confirmMonitor">Off</strong></div><div><span>Fallback</span><strong>AutoDJ ready</strong></div></div><div class="confirm-actions"><button class="confirm-cancel" value="cancel">Cancel</button><button class="confirm-onair" id="confirmOnAir" value="default" type="button">GO ON AIR</button></div></form>`;
document.body.appendChild(dialog);

const showSelect=$('#liveShowSelect'),micSelect=$('#micDeviceSelect'),outputSelect=$('#outputDeviceSelect'),reviewButton=$('#reviewButton'),airButton=$('#airButton'),cueVolume=$('#cueVolume');

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function levelValue(id){return clamp(Number($(`#${id}Level`)?.value||0)/100)}
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
function smoothGain(param,target,ms=30){
  if(!param)return;
  target=clamp(Number(target)||0);
  if(!audioContext){param.value=target;return}
  const now=audioContext.currentTime;
  try{
    if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(now);
    else{param.cancelScheduledValues(now);param.setValueAtTime(param.value,now)}
    param.linearRampToValueAtTime(target,now+Math.max(5,ms)/1000);
  }catch{param.value=target}
}
function startMeterLoop(){
  if(meterRaf)return;
  const tick=()=>{
    if(micAnalyser){
      const {rms,db,norm}=readAnalyser(micAnalyser);
      lastMicRms=rms;
      paintMeter('micMeter',norm);
      $('#inputDb').textContent=`${Math.round(db)} dB`;
      if(rms>.004){healthyFrames++;$('#inputHint').textContent='Signal detected'}
      else if(micStream)$('#inputHint').textContent='Microphone connected';
      if(healthyFrames>8&&!signalReady){signalReady=true;updateReadyState()}
    }else{
      lastMicRms=0;
      clearMeter('micMeter');
    }

    for(const id of ['music','carts','requests']){
      const entry=channelNodes.get(id);
      if(entry?.analyser){
        const {norm}=readAnalyser(entry.analyser);
        paintMeter(`${id}Meter`,norm);
      }else{
        const t=Date.now()/550,f=isLive?1:.28;
        const demo=id==='music'?(0.18+Math.abs(Math.sin(t))*.42):id==='carts'?(0.08+Math.abs(Math.sin(t*.63))*.24):(0.06+Math.abs(Math.cos(t*.42))*.18);
        paintMeter(`${id}Meter`,demo*f);
      }
    }

    if(masterAnalyser){
      const {rms,norm}=readAnalyser(masterAnalyser);
      lastMasterRms=rms;
      paintMeter('masterMeter',norm);
    }else{
      lastMasterRms=0;
      clearMeter('masterMeter');
    }
    meterRaf=requestAnimationFrame(tick);
  };
  meterRaf=requestAnimationFrame(tick);
}
function ensureAudioContext(){
  if(!audioContext){
    audioContext=new (window.AudioContext||window.webkitAudioContext)();

    programMixGain=audioContext.createGain();
    programLimiter=audioContext.createDynamicsCompressor();
    programBusGain=audioContext.createGain();
    masterAnalyser=audioContext.createAnalyser();
    programStreamDest=audioContext.createMediaStreamDestination();
    cueMonitorGain=audioContext.createGain();

    programMixGain.gain.value=1;
    programLimiter.threshold.value=-2;
    programLimiter.knee.value=0;
    programLimiter.ratio.value=20;
    programLimiter.attack.value=.003;
    programLimiter.release.value=.12;
    masterAnalyser.fftSize=512;
    masterAnalyser.smoothingTimeConstant=.64;

    programMixGain.connect(programLimiter);
    programLimiter.connect(programBusGain);
    programBusGain.connect(masterAnalyser);
    masterAnalyser.connect(programStreamDest);

    // CUE is intentionally not connected to the hardware destination here.
    // live-cue-output.js owns the headphone/device route.
    cueMonitorGain.gain.value=Number(cueVolume.value)/100;

    updateAudioGains({immediate:true});
    startMeterLoop();
  }
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  return audioContext;
}
function updateAudioGains({immediate=false}={}){
  const ms=immediate?5:28;
  if(micInputGain)smoothGain(micInputGain.gain,channelMuted.mic?0:levelValue('mic'),ms);
  for(const [id,entry] of channelNodes)smoothGain(entry.gain.gain,channelMuted[id]?0:levelValue(id),ms);
  if(programBusGain)smoothGain(programBusGain.gain,channelMuted.master?0:levelValue('master'),ms);
  if(cueMonitorGain)smoothGain(cueMonitorGain.gain,Number(cueVolume.value)/100,18);
}
function cueSourceFor(id){
  if(id==='mic')return sourceNode;
  if(id==='master')return programMixGain;
  const entry=channelNodes.get(id);
  return entry?.cueSource||entry?.source||null;
}
function updateCueReadout(){
  if(!activeCues.size){
    $('#monitorReadout').textContent='OFF';
    $('#monitorDetail').textContent=CUE_HELP;
    return;
  }
  $('#monitorReadout').textContent=[...activeCues].map(id=>id.toUpperCase()).join(' + ');
  $('#monitorDetail').textContent=`${activeCues.size} CUE${activeCues.size===1?'':'S'} · ${cueVolume.value}% · ${CUE_HELP}`;
}
function updateCueVisual(id){
  const on=activeCues.has(id),strip=$(`.channel-strip[data-channel="${id}"]`),btn=$(`[data-channel-cue="${id}"]`);
  strip?.classList.toggle('is-cued',on);
  btn?.classList.toggle('active',on);
  btn?.setAttribute('aria-pressed',on?'true':'false');
  const status=btn?.querySelector('.cue-button-status');if(status)status.textContent=on?'ON':'OFF';
}
function connectCueSource(id){
  const node=cueSourceFor(id);
  if(!node||!cueMonitorGain)return false;
  try{node.connect(cueMonitorGain);return true}catch{return false}
}
function disconnectCueSource(id){
  const node=cueSourceFor(id);
  if(!node||!cueMonitorGain)return;
  try{node.disconnect(cueMonitorGain)}catch{}
}
function setCue(id,next){
  ensureAudioContext();
  const shouldOn=typeof next==='boolean'?next:!activeCues.has(id);
  if(shouldOn===activeCues.has(id)){updateCueVisual(id);updateCueReadout();return}
  if(shouldOn){
    activeCues.add(id);
    if(!connectCueSource(id))showError(`${id.toUpperCase()} has no real audio source yet. CUE is armed and will monitor it when a source is attached.`);
  }else{
    disconnectCueSource(id);
    activeCues.delete(id);
  }
  updateCueVisual(id);
  updateCueReadout();
}
function updateProgramStates(){
  ['mic','music','carts','requests','master'].forEach(id=>{
    const onProgram=id==='master'
      ?isLive&&!channelMuted.master
      :(id==='mic'?isLive&&!channelMuted.mic:(isLive&&channelNodes.has(id)&&!channelMuted[id]));
    const el=$(`#${id}ProgramState`);if(el){el.textContent=onProgram?'PROGRAM':'NOT ON PROGRAM';el.classList.toggle('on',onProgram)}
  });
}
function updateMuteVisual(id){
  const btn=$(`[data-channel-mute="${id}"]`);
  btn?.classList.toggle('active',channelMuted[id]);
  if(btn)btn.textContent=channelMuted[id]?'MUTED':'MUTE';
  $(`.channel-strip[data-channel="${id}"]`)?.classList.toggle('is-muted',channelMuted[id]);
  updateProgramStates();
}
function setChannelMute(id,next){
  if(!(id in channelMuted))return false;
  channelMuted[id]=!!next;
  updateMuteVisual(id);
  updateAudioGains();
  return true;
}
function showError(msg){const err=$('#micError');err.textContent=msg;err.classList.add('show');clearTimeout(showError.timer);showError.timer=setTimeout(()=>err.classList.remove('show'),4200)}
function clearMeter(id){$$(`#${id} i`).forEach(i=>i.className='')}
function paintMeter(id,n){
  const bars=$$(`#${id} i`),lit=Math.round(clamp(n)*bars.length);
  bars.forEach((bar,i)=>bar.className=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):'');
}
function readAnalyser(analyser){
  if(!analyser)return{rms:0,db:-60,norm:0};
  let data=analyser._paraisoData;
  if(!data||data.length!==analyser.fftSize)data=analyser._paraisoData=new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum=0;
  for(const v of data){const x=(v-128)/128;sum+=x*x}
  const rms=Math.sqrt(sum/data.length);
  const db=Math.max(-60,20*Math.log10(Math.max(rms,0.001)));
  const norm=clamp((db+60)/60);
  return{rms,db,norm};
}

function stopMic(){
  if(sourceNode&&activeCues.has('mic'))try{sourceNode.disconnect(cueMonitorGain)}catch{}
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}
  try{sourceNode?.disconnect()}catch{}
  try{micInputGain?.disconnect()}catch{}
  try{micAnalyser?.disconnect()}catch{}
  sourceNode=micAnalyser=micInputGain=null;
  lastMicRms=0;healthyFrames=0;signalReady=false;
  clearMeter('micMeter');
  $('#inputDb').textContent='— dB';
  $('#inputHint').textContent='Microphone disconnected';
  updateReadyState();
}
async function connectMicrophone(){
  if(!navigator.mediaDevices?.getUserMedia){showError('Microphone input is not available in this browser.');return}
  stopMic();
  try{
    const constraints=micSelect.value?{audio:{deviceId:{exact:micSelect.value},echoCancellation:false,noiseSuppression:false,autoGainControl:false}}:{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
    micStream=await navigator.mediaDevices.getUserMedia(constraints);
    ensureAudioContext();
    await enumerateDevices();

    sourceNode=audioContext.createMediaStreamSource(micStream);
    micAnalyser=audioContext.createAnalyser();
    micAnalyser.fftSize=512;
    micAnalyser.smoothingTimeConstant=.58;
    micInputGain=audioContext.createGain();

    sourceNode.connect(micAnalyser);      // raw input meter / Smart Talk detector
    sourceNode.connect(micInputGain);     // program path
    micInputGain.connect(programMixGain);
    updateAudioGains({immediate:true});

    if(activeCues.has('mic'))connectCueSource('mic');
    $('#inputHint').textContent='Microphone connected';
    updateReadyState();

    const track=micStream.getAudioTracks()[0];
    track?.addEventListener('ended',()=>{if(micStream)stopMic()});
  }catch(e){
    showError(e?.name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access to operate Live Studio.':'Could not open that microphone. Try another input.');
    $('#inputHint').textContent='Microphone permission required';
    updateReadyState();
  }
}

window.PARAISO_LIVE_AUDIO={
  attachSource(id,node,options={}){
    if(!attachableIds.has(id)||!node||typeof node.connect!=='function')return false;
    ensureAudioContext();
    if(channelNodes.has(id))this.detachSource(id);

    const cueSource=options?.cueNode&&typeof options.cueNode.connect==='function'?options.cueNode:node;
    const analyser=audioContext.createAnalyser();
    analyser.fftSize=512;
    analyser.smoothingTimeConstant=.64;
    const gain=audioContext.createGain();

    try{
      node.connect(analyser);
      analyser.connect(gain);
      gain.connect(programMixGain);
    }catch{
      try{node.disconnect(analyser)}catch{}
      try{analyser.disconnect()}catch{}
      try{gain.disconnect()}catch{}
      return false;
    }

    channelNodes.set(id,{source:node,cueSource,analyser,gain});
    const badge=$(`.channel-strip[data-channel="${id}"] .channel-source-badge`);
    if(badge){badge.textContent='REAL';badge.classList.remove('demo');badge.classList.add('real')}
    updateAudioGains({immediate:true});
    if(activeCues.has(id))connectCueSource(id);
    updateCueReadout();
    updateProgramStates();
    return true;
  },
  detachSource(id){
    const entry=channelNodes.get(id);
    if(entry){
      if(activeCues.has(id))try{entry.cueSource.disconnect(cueMonitorGain)}catch{}
      try{entry.source.disconnect(entry.analyser)}catch{}
      try{entry.analyser.disconnect(entry.gain)}catch{}
      try{entry.gain.disconnect(programMixGain)}catch{}
    }
    channelNodes.delete(id);
    const badge=$(`.channel-strip[data-channel="${id}"] .channel-source-badge`);
    if(badge){badge.textContent='DEMO SOURCE';badge.classList.remove('real');badge.classList.add('demo')}
    updateCueReadout();
    updateProgramStates();
  },
  ensureContext(){return ensureAudioContext()},
  setChannelMute,
  setCue,
  getChannelMuted(id){return !!channelMuted[id]},
  getChannelLevel(id){return Number($(`#${id}Level`)?.value||0)},
  get context(){return audioContext},
  get programBus(){return programBusGain},
  get programStream(){return programStreamDest?.stream||null},
  get cueBus(){return cueMonitorGain},
  get micRms(){return lastMicRms},
  get masterRms(){return lastMasterRms},
  get activeCues(){return [...activeCues]},
  get isLive(){return isLive}
};

function setLive(next){
  isLive=next;
  document.body.classList.toggle('live-broadcasting',isLive);
  $('#consoleStatusLight').classList.toggle('live',isLive);
  $('#programReadout').textContent=isLive?'LIVE PROGRAM':'AutoDJ';
  $('#programDetail').textContent=isLive?'Local program bus active — backend transport still demo':'Live feed not armed';
  const airStatus=$('#airStatus');airStatus.classList.toggle('live',isLive);airStatus.querySelector('span').textContent=isLive?'ON AIR':'OFF AIR';
  showSelect.disabled=isLive;micSelect.disabled=isLive;
  if(isLive){
    airButton.disabled=false;airButton.classList.add('end');airButton.querySelector('b').textContent='END BROADCAST';airButton.querySelector('small').textContent='Return control to AutoDJ';
    ensureAudioContext();
  }
  updateReadyState();
  document.dispatchEvent(new CustomEvent('paraiso:live-state',{detail:{isLive}}));
}
function openConfirm(end=false){
  $('#confirmShow').textContent=selectedShow||'Live broadcast';
  $('#confirmMic').textContent=micSelect.selectedOptions[0]?.textContent||'Default microphone';
  $('#confirmMonitor').textContent=activeCues.size?`${[...activeCues].map(id=>id.toUpperCase()).join(' + ')} · ${cueVolume.value}%`:'Off';
  $('#confirmEyebrow').textContent=end?'END LIVE BROADCAST':'READY TO BROADCAST';
  $('#confirmTitle').textContent=end?'Return to AutoDJ?':'Go on air?';
  $('#confirmCopy').textContent=end?'The local live program will end and AutoDJ demo mode will resume.':'The local board will enter ON AIR state. No backend stream is being faked.';
  $('#confirmIcon').textContent=end?'■':'●';
  const action=$('#confirmOnAir');action.textContent=end?'END BROADCAST':'GO ON AIR';action.classList.toggle('danger',end);action.dataset.mode=end?'end':'start';
  dialog.showModal();
}

showSelect.addEventListener('change',()=>{selectedShow=showSelect.value;updateReadyState()});
micSelect.addEventListener('change',connectMicrophone);
outputSelect.addEventListener('change',()=>window.PARAISO_CUE_OUTPUT?.refresh?.());
cueVolume.addEventListener('input',e=>{
  $('#cueVolumeValue').textContent=`${e.target.value}%`;
  if(cueMonitorGain)smoothGain(cueMonitorGain.gain,Number(e.target.value)/100,18);
  updateCueReadout();
});
['mic','master','music','carts','requests'].forEach(id=>$(`#${id}Level`).addEventListener('input',e=>{
  $(`#${id}Value`).textContent=`${e.target.value}%`;
  updateAudioGains();
  document.dispatchEvent(new CustomEvent('paraiso:channel-level',{detail:{id,value:Number(e.target.value),manual:!e.target.dataset.sceneTransition}}));
}));
$$('[data-channel-mute]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.dataset.channelMute;
  setChannelMute(id,!channelMuted[id]);
  document.dispatchEvent(new CustomEvent('paraiso:channel-mute',{detail:{id,muted:channelMuted[id]}}));
}));
$$('[data-channel-cue]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.dataset.channelCue;
  setCue(id);
  document.dispatchEvent(new CustomEvent('paraiso:channel-cue',{detail:{id,active:activeCues.has(id)}}));
}));
$$('.queue-action').forEach(btn=>btn.addEventListener('click',()=>{$$('.queue-action.armed').forEach(b=>{b.classList.remove('armed');b.textContent='Play next'});btn.classList.add('armed');btn.textContent='Armed ✓'}));
$$('.request-action').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.add('accepted');btn.textContent='Queued ✓';btn.disabled=true}));
reviewButton.addEventListener('click',()=>openConfirm(false));
airButton.addEventListener('click',()=>openConfirm(isLive));
$('#confirmOnAir').addEventListener('click',()=>{const end=$('#confirmOnAir').dataset.mode==='end';dialog.close();setLive(!end)});
$('#goLiveButton')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelector('.nav-item[data-view="live"]')?.click();setTimeout(()=>$('#broadcastConsole')?.scrollIntoView({behavior:'smooth',block:'start'}),80)},true);
window.addEventListener('beforeunload',()=>{if(micStream)micStream.getTracks().forEach(t=>t.stop());if(meterRaf)cancelAnimationFrame(meterRaf)});

function syncLiveViewMic(){
  const open=liveView.classList.contains('active');
  if(open&&!micStream)connectMicrophone();
  if(!open&&micStream&&!isLive)stopMic();
}
new MutationObserver(syncLiveViewMic).observe(liveView,{attributes:true,attributeFilter:['class']});
document.querySelector('.nav-item[data-view="live"]')?.addEventListener('click',()=>setTimeout(syncLiveViewMic,0));
updateProgramStates();updateReadyState();updateCueReadout();syncLiveViewMic();
})();
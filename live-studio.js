(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const liveView=$('#view-live');
if(!liveView)return;

// Hide the original card-based live layout; keep it in the DOM only for legacy Studio state hooks.
const legacyLayout=liveView.querySelector('.live-layout');
if(legacyLayout)legacyLayout.classList.add('legacy-live-layout');

let micStream=null,audioContext=null,sourceNode=null,analyser=null,rafId=null;
let micGainNode=null,programGainNode=null,micMonitorGain=null,programMonitorGain=null;
let micReady=false,signalReady=false,selectedShow='',monitorMode='off',isLive=false,cueOn=false;

const consoleShell=document.createElement('div');
consoleShell.className='broadcast-console';
consoleShell.id='broadcastConsole';
consoleShell.innerHTML=`
  <section class="console-topbar">
    <div class="console-identity">
      <div class="console-status-light" id="consoleStatusLight"></div>
      <div><p class="eyebrow">PARAÍSO BROADCAST CONSOLE</p><h2 id="consoleStateTitle">Prepare the board</h2></div>
    </div>
    <div class="console-ready-pill" id="consoleReadyPill"><i></i><span>SETUP NEEDED</span></div>
  </section>

  <section class="setup-ribbon">
    <label class="ribbon-field"><span>SHOW</span><select id="liveShowSelect"><option value="">Select show…</option><option>Sebastián Live</option><option>Viernes en Paraíso</option><option>Guest DJ Session</option><option>Special Broadcast</option></select></label>
    <label class="ribbon-field"><span>MICROPHONE</span><select id="micDeviceSelect"><option value="">Default microphone</option></select></label>
    <label class="ribbon-field"><span>HEADPHONES / OUTPUT</span><select id="outputDeviceSelect"><option value="">System default output</option></select></label>
    <div class="ribbon-health" id="ribbonHealth">
      <div class="health-check" id="checkMic"><i>1</i><span><b>MIC</b><small>Not tested</small></span></div>
      <div class="health-check" id="checkSignal"><i>2</i><span><b>SIGNAL</b><small>Waiting</small></span></div>
      <div class="health-check" id="checkShow"><i>3</i><span><b>SHOW</b><small>Choose one</small></span></div>
      <div class="health-check ready" id="checkFallback"><i>✓</i><span><b>FALLBACK</b><small>AutoDJ ready</small></span></div>
    </div>
  </section>

  <section class="mixer-surface">
    <div class="mixer-header">
      <div><p class="eyebrow">MIXER</p><h3>Broadcast channels</h3></div>
      <div class="monitor-bank" aria-label="Monitoring controls">
        <button class="console-button test" id="micTestButton"><span>●</span> Test Mic</button>
        <button class="console-button monitor" id="monitorMicButton" aria-pressed="false"><span>◉</span> Monitor Mic</button>
        <button class="console-button monitor" id="monitorProgramButton" aria-pressed="false"><span>◉</span> Monitor Program</button>
        <button class="console-button cue" id="cueAutoDjButton" aria-pressed="false"><span>▶</span> Cue AutoDJ</button>
      </div>
    </div>

    <div class="channel-bank">
      ${channelStrip('mic','MIC','Voice',72,true)}
      ${channelStrip('music','MUSIC','Live music',64,false)}
      ${channelStrip('carts','CARTS','IDs / jingles',58,false)}
      ${channelStrip('requests','REQUESTS','Listener queue',52,false)}
      ${channelStrip('master','MASTER','Program out',82,true)}
    </div>

    <div class="monitor-readout">
      <div class="monitor-source"><span>MONITOR</span><strong id="monitorReadout">OFF</strong><small id="monitorDetail">Use headphones before monitoring.</small></div>
      <div class="program-readout"><span>PROGRAM</span><strong id="programReadout">AutoDJ</strong><small id="programDetail">Live feed not armed</small></div>
      <div class="input-readout"><span>MIC INPUT</span><strong id="inputDb">— dB</strong><small id="inputHint">Click Test Mic and speak</small></div>
    </div>
    <div class="live-mic-error" id="micError"></div>
  </section>

  <section class="console-lower-grid">
    <article class="console-dock">
      <div class="dock-heading"><div><p class="eyebrow">NEXT ON DECK</p><h3>DJ queue</h3></div><span>Prepared set</span></div>
      <div class="deck-list">
        ${queueRow('01','Fatalidad','Julio Jaramillo • 3:38')}
        ${queueRow('02','Guayaquil de Mis Amores','Traditional Ecuador • 3:10')}
        ${queueRow('03','Salsa de Queens','Demo Orchestra • 4:12')}
      </div>
    </article>
    <article class="console-dock">
      <div class="dock-heading"><div><p class="eyebrow">LISTENER REQUESTS</p><h3>Incoming</h3></div><span class="request-tag">3 waiting</span></div>
      <div class="incoming-list">
        ${requestRow('M','Maria','Fatalidad • Queens')}
        ${requestRow('C','Carlos','Guayaquil de Mis Amores • Brooklyn')}
        ${requestRow('A','Ana','Nuestro Juramento • Cuenca')}
      </div>
    </article>
  </section>

  <section class="air-bar">
    <div class="air-status" id="airStatus"><i></i><div><span>OFF AIR</span><strong id="airStatusText">Complete setup before taking control.</strong></div></div>
    <div class="air-actions">
      <button class="air-review" id="reviewButton" disabled>Review setup</button>
      <button class="air-button" id="airButton" disabled><span class="air-button-dot"></span><b>GO ON AIR</b><small>Take over from AutoDJ</small></button>
    </div>
  </section>
`;
liveView.insertBefore(consoleShell,liveView.firstChild);

function channelStrip(id,label,sub,value,realMeter){
  return `<div class="channel-strip ${id==='master'?'master-strip':''}" data-channel="${id}">
    <div class="channel-label"><b>${label}</b><span>${sub}</span></div>
    <div class="channel-meter" id="${id}Meter">${'<i></i>'.repeat(18)}</div>
    <div class="channel-db"><span>0</span><span>-12</span><span>-24</span><span>-48</span></div>
    <input class="channel-fader" id="${id}Level" type="range" min="0" max="100" value="${value}" aria-label="${label} level">
    <output id="${id}Value">${value}%</output>
    <div class="channel-buttons"><button class="channel-btn mute" data-channel-mute="${id}">MUTE</button><button class="channel-btn cue" data-channel-cue="${id}">CUE</button></div>
    ${realMeter?'<span class="real-meter-badge">LIVE METER</span>':''}
  </div>`;
}
function queueRow(n,title,sub){return `<div class="deck-row"><span class="deck-number">${n}</span><div class="deck-copy"><strong>${title}</strong><small>${sub}</small></div><button class="queue-action">Play next</button></div>`}
function requestRow(initial,name,sub){return `<div class="incoming-row"><span class="incoming-avatar">${initial}</span><div class="incoming-copy"><strong>${name}</strong><small>${sub}</small></div><button class="request-action">Accept</button></div>`}

const dialog=document.createElement('dialog');
dialog.className='live-confirm-dialog';
dialog.id='liveConfirmDialog';
dialog.innerHTML=`<form method="dialog"><div class="confirm-icon" id="confirmIcon">●</div><p class="eyebrow" id="confirmEyebrow">READY TO BROADCAST</p><h3 id="confirmTitle">Go on air?</h3><p id="confirmCopy">AutoDJ will hand control to this live feed.</p><div class="confirm-summary"><div><span>Show</span><strong id="confirmShow">—</strong></div><div><span>Microphone</span><strong id="confirmMic">—</strong></div><div><span>Monitor</span><strong id="confirmMonitor">Off</strong></div><div><span>Fallback</span><strong>AutoDJ ready</strong></div></div><div class="confirm-actions"><button class="confirm-cancel" value="cancel">Cancel</button><button class="confirm-onair" id="confirmOnAir" value="default" type="button">GO ON AIR</button></div></form>`;
document.body.appendChild(dialog);

const showSelect=$('#liveShowSelect'),micSelect=$('#micDeviceSelect'),outputSelect=$('#outputDeviceSelect');
const testButton=$('#micTestButton'),monitorMicButton=$('#monitorMicButton'),monitorProgramButton=$('#monitorProgramButton'),cueButton=$('#cueAutoDjButton');
const reviewButton=$('#reviewButton'),airButton=$('#airButton');

function setCheck(id,ready,detail){const el=$(id);if(!el)return;el.classList.toggle('ready',ready);el.querySelector('i').textContent=ready?'✓':id==='#checkMic'?'1':id==='#checkSignal'?'2':'3';el.querySelector('small').textContent=detail;}
function updateReadyState(){
  const ready=micReady&&signalReady&&!!selectedShow;
  setCheck('#checkMic',micReady,micReady?'Connected':'Not tested');
  setCheck('#checkSignal',signalReady,signalReady?'Healthy':'Waiting');
  setCheck('#checkShow',!!selectedShow,selectedShow||'Choose one');
  const pill=$('#consoleReadyPill');pill.classList.toggle('ready',ready);pill.querySelector('span').textContent=isLive?'ON AIR':ready?'READY':'SETUP NEEDED';
  reviewButton.disabled=!ready||isLive;airButton.disabled=!ready&&!isLive;
  if(!isLive){airButton.classList.remove('end');airButton.querySelector('b').textContent='GO ON AIR';airButton.querySelector('small').textContent='Take over from AutoDJ';}
  $('#consoleStateTitle').textContent=isLive?'Live program in progress':ready?'Board ready for air':'Prepare the board';
  $('#airStatusText').textContent=isLive?'Listeners are on the live program feed.':ready?'Setup complete. Review or go on air.':'Complete setup before taking control.';
}

async function enumerateDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const devices=await navigator.mediaDevices.enumerateDevices();
  const currentMic=micSelect.value,currentOut=outputSelect.value;
  const mics=devices.filter(d=>d.kind==='audioinput'),outs=devices.filter(d=>d.kind==='audiooutput');
  micSelect.innerHTML='<option value="">Default microphone</option>'+mics.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Microphone ${i+1}`}</option>`).join('');
  outputSelect.innerHTML='<option value="">System default output</option>'+outs.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Output ${i+1}`}</option>`).join('');
  if([...micSelect.options].some(o=>o.value===currentMic))micSelect.value=currentMic;
  if([...outputSelect.options].some(o=>o.value===currentOut))outputSelect.value=currentOut;
}

function disconnectMonitoring(){
  try{micMonitorGain?.disconnect()}catch{};try{programMonitorGain?.disconnect()}catch{};
  monitorMode='off';
  monitorMicButton.classList.remove('active');monitorProgramButton.classList.remove('active');
  monitorMicButton.setAttribute('aria-pressed','false');monitorProgramButton.setAttribute('aria-pressed','false');
  $('#monitorReadout').textContent='OFF';$('#monitorDetail').textContent='Use headphones before monitoring.';
}
function setMonitor(mode){
  if(!micStream||!audioContext){showError('Test the microphone first before monitoring.');return;}
  if(audioContext.state==='suspended')audioContext.resume();
  disconnectMonitoring();
  if(mode==='off')return;
  // Monitoring is intentionally exclusive to prevent a doubled mic signal.
  if(mode==='mic'){
    sourceNode.connect(micMonitorGain);micMonitorGain.connect(audioContext.destination);
    monitorMode='mic';monitorMicButton.classList.add('active');monitorMicButton.setAttribute('aria-pressed','true');
    $('#monitorReadout').textContent='MIC';$('#monitorDetail').textContent='Raw microphone in your headphones.';
  }else{
    programGainNode.connect(programMonitorGain);programMonitorGain.connect(audioContext.destination);
    monitorMode='program';monitorProgramButton.classList.add('active');monitorProgramButton.setAttribute('aria-pressed','true');
    $('#monitorReadout').textContent='PROGRAM';$('#monitorDetail').textContent='Local master mix preview.';
  }
}

function showError(msg){const err=$('#micError');err.textContent=msg;err.classList.add('show');clearTimeout(showError.timer);showError.timer=setTimeout(()=>err.classList.remove('show'),4200);}

function clearMeter(id){$$(`#${id} i`).forEach(i=>i.className='')}
function paintMeter(id,normalized){const bars=$$(`#${id} i`),lit=Math.round(Math.max(0,Math.min(1,normalized))*bars.length);bars.forEach((bar,i)=>{bar.className=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):''});}

function stopMic(){
  cancelAnimationFrame(rafId);rafId=null;disconnectMonitoring();
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
  sourceNode=analyser=micGainNode=programGainNode=micMonitorGain=programMonitorGain=null;
  micReady=false;signalReady=false;testButton.classList.remove('active');testButton.innerHTML='<span>●</span> Test Mic';
  clearMeter('micMeter');clearMeter('masterMeter');$('#inputDb').textContent='— dB';$('#inputHint').textContent='Click Test Mic and speak';updateReadyState();
}

async function startMicTest(){
  if(micStream){stopMic();return;}
  if(!navigator.mediaDevices?.getUserMedia){showError('Microphone testing is not available in this browser.');return;}
  try{
    const constraints=micSelect.value?{audio:{deviceId:{exact:micSelect.value},echoCancellation:false,noiseSuppression:false,autoGainControl:false}}:{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
    micStream=await navigator.mediaDevices.getUserMedia(constraints);
    await enumerateDevices();
    audioContext=new (window.AudioContext||window.webkitAudioContext)();
    sourceNode=audioContext.createMediaStreamSource(micStream);
    analyser=audioContext.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.72;
    micGainNode=audioContext.createGain();programGainNode=audioContext.createGain();micMonitorGain=audioContext.createGain();programMonitorGain=audioContext.createGain();
    micGainNode.gain.value=Number($('#micLevel').value)/100;programGainNode.gain.value=Number($('#masterLevel').value)/100;micMonitorGain.gain.value=.72;programMonitorGain.gain.value=.72;
    sourceNode.connect(analyser);sourceNode.connect(micGainNode);micGainNode.connect(programGainNode);
    micReady=true;testButton.classList.add('active');testButton.innerHTML='<span>■</span> Stop Mic Test';
    const data=new Uint8Array(analyser.frequencyBinCount);let healthyFrames=0;
    const draw=()=>{
      analyser.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b,0)/data.length;const normalized=Math.min(1,avg/88);
      paintMeter('micMeter',normalized);paintMeter('masterMeter',normalized*(Number($('#micLevel').value)/100)*(Number($('#masterLevel').value)/100));
      const db=Math.round(-60+normalized*58);$('#inputDb').textContent=`${db} dB`;
      if(avg>3){healthyFrames++;$('#inputHint').textContent='Signal detected';}if(healthyFrames>8&&!signalReady){signalReady=true;updateReadyState();}
      animateDemoMeters();rafId=requestAnimationFrame(draw);
    };draw();updateReadyState();
  }catch(e){showError(e?.name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access, then try again.':'Could not open that microphone. Try another input.');stopMic();}
}

function animateDemoMeters(){
  const t=Date.now()/550,liveFactor=isLive?1:.35,cueFactor=cueOn?.7:.18;
  paintMeter('musicMeter',(0.22+Math.abs(Math.sin(t))*.55)*Math.max(liveFactor,cueFactor)*Number($('#musicLevel').value)/100);
  paintMeter('cartsMeter',(0.1+Math.abs(Math.sin(t*.63))*.36)*(isLive?.65:.18)*Number($('#cartsLevel').value)/100);
  paintMeter('requestsMeter',(0.08+Math.abs(Math.cos(t*.42))*.26)*(isLive?.55:.12)*Number($('#requestsLevel').value)/100);
}

function setLive(next){
  isLive=next;document.body.classList.toggle('live-broadcasting',isLive);
  $('#consoleStatusLight').classList.toggle('live',isLive);$('#programReadout').textContent=isLive?'LIVE PROGRAM':'AutoDJ';$('#programDetail').textContent=isLive?'Local live bus active':'Live feed not armed';
  const airStatus=$('#airStatus');airStatus.classList.toggle('live',isLive);airStatus.querySelector('span').textContent=isLive?'ON AIR':'OFF AIR';
  showSelect.disabled=isLive;micSelect.disabled=isLive;
  if(isLive){airButton.disabled=false;airButton.classList.add('end');airButton.querySelector('b').textContent='END BROADCAST';airButton.querySelector('small').textContent='Return control to AutoDJ';}
  // Keep the rest of Studio visually synchronized.
  const mode=$('#modeChip');if(mode){mode.textContent=isLive?'LIVE':'AUTO DJ';mode.classList.toggle('is-live',isLive)}
  const header=$('.station-health');if(header){header.querySelector('strong').textContent=isLive?'ON AIR — LIVE':'Station online';header.querySelector('small').textContent=isLive?'Live DJ feed active':'Demo mode';}
  const dashGo=$('#goLiveButton');if(dashGo){dashGo.textContent=isLive?'● Live Now':'Go Live';dashGo.classList.toggle('state-live',isLive)}
  updateReadyState();
}

function openConfirm(end=false){
  $('#confirmShow').textContent=selectedShow||'Live broadcast';$('#confirmMic').textContent=micSelect.selectedOptions[0]?.textContent||'Default microphone';$('#confirmMonitor').textContent=monitorMode==='mic'?'Mic':monitorMode==='program'?'Program':'Off';
  $('#confirmEyebrow').textContent=end?'END LIVE BROADCAST':'READY TO BROADCAST';$('#confirmTitle').textContent=end?'Return to AutoDJ?':'Go on air?';$('#confirmCopy').textContent=end?'The live program will end and AutoDJ will resume.':'The board will stay on this screen and switch into its green ON AIR state.';$('#confirmIcon').textContent=end?'■':'●';
  const action=$('#confirmOnAir');action.textContent=end?'END BROADCAST':'GO ON AIR';action.classList.toggle('danger',end);action.dataset.mode=end?'end':'start';dialog.showModal();
}

// Bind setup and board controls.
testButton.addEventListener('click',startMicTest);
monitorMicButton.addEventListener('click',()=>setMonitor(monitorMode==='mic'?'off':'mic'));
monitorProgramButton.addEventListener('click',()=>setMonitor(monitorMode==='program'?'off':'program'));
showSelect.addEventListener('change',()=>{selectedShow=showSelect.value;updateReadyState()});
micSelect.addEventListener('change',()=>{if(micStream){stopMic();startMicTest()}});
outputSelect.addEventListener('change',async()=>{
  if(audioContext&&typeof audioContext.setSinkId==='function'){
    try{await audioContext.setSinkId(outputSelect.value||'default');$('#monitorDetail').textContent='Headphone output updated.';}catch{showError('This browser could not switch to that output. System default will be used.');}
  }else if(outputSelect.value){showError('This browser uses the system audio output for monitoring.');}
});
cueButton.addEventListener('click',()=>{cueOn=!cueOn;cueButton.classList.toggle('active',cueOn);cueButton.setAttribute('aria-pressed',String(cueOn));cueButton.innerHTML=cueOn?'<span>■</span> Stop AutoDJ Cue':'<span>▶</span> Cue AutoDJ';$('#monitorDetail').textContent=cueOn?'AutoDJ cue armed — audio will connect when the real stream is available.':'Use headphones before monitoring.';});

[['mic','micGainNode'],['master','programGainNode'],['music',null],['carts',null],['requests',null]].forEach(([id,nodeName])=>{
  $(`#${id}Level`).addEventListener('input',e=>{const v=Number(e.target.value);$(`#${id}Value`).textContent=`${v}%`;if(id==='mic'&&micGainNode)micGainNode.gain.value=v/100;if(id==='master'&&programGainNode)programGainNode.gain.value=v/100;});
});
$$('[data-channel-mute]').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.toggle('active');btn.textContent=btn.classList.contains('active')?'MUTED':'MUTE';if(btn.dataset.channelMute==='mic'&&micGainNode)micGainNode.gain.value=btn.classList.contains('active')?0:Number($('#micLevel').value)/100;}));
$$('[data-channel-cue]').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.toggle('active')}));
$$('.queue-action').forEach(btn=>btn.addEventListener('click',()=>{$$('.queue-action.armed').forEach(b=>{b.classList.remove('armed');b.textContent='Play next'});btn.classList.add('armed');btn.textContent='Armed ✓';}));
$$('.request-action').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.add('accepted');btn.textContent='Queued ✓';btn.disabled=true;}));
reviewButton.addEventListener('click',()=>openConfirm(false));
airButton.addEventListener('click',()=>openConfirm(isLive));
$('#confirmOnAir').addEventListener('click',()=>{const end=$('#confirmOnAir').dataset.mode==='end';dialog.close();setLive(!end)});

// Dashboard Go Live now opens the board instead of immediately simulating a broadcast.
$('#goLiveButton')?.addEventListener('click',e=>{if(isLive)return;e.preventDefault();e.stopImmediatePropagation();document.querySelector('.nav-item[data-view="live"]')?.click();setTimeout(()=>$('#broadcastConsole')?.scrollIntoView({behavior:'smooth',block:'start'}),80);},true);

window.addEventListener('beforeunload',()=>{if(micStream)micStream.getTracks().forEach(t=>t.stop())});
updateReadyState();
})();
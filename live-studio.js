(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const liveView=$('#view-live');
if(!liveView)return;

const CUE_HELP='Headphones only — pre-fader / pre-mute. CUE remains available even when a channel is muted or its fader is down.';
const CHANNEL_IDS=['mic','music','carts','requests'];
const ALL_IDS=[...CHANNEL_IDS,'master'];
const DEFAULT_LEVELS={mic:72,music:64,carts:58,requests:52,master:82};
const SCENES={
  talk:{label:'TALK OVER MUSIC',levels:{mic:72,music:46,carts:42,requests:40,master:82},mutes:{mic:false,music:false,carts:true,requests:true,master:false},detail:'Mic open · music reduced · utility channels parked'},
  song:{label:'FULL SONG',levels:{mic:24,music:78,carts:48,requests:44,master:82},mutes:{mic:true,music:false,carts:true,requests:true,master:false},detail:'Music forward · mic safely muted'},
  id:{label:'STATION ID',levels:{mic:20,music:22,carts:74,requests:40,master:82},mutes:{mic:true,music:false,carts:false,requests:true,master:false},detail:'Carts prioritized · music held low'},
  request:{label:'REQUEST',levels:{mic:56,music:28,carts:42,requests:72,master:82},mutes:{mic:false,music:false,carts:true,requests:false,master:false},detail:'Request channel forward · mic ready'},
  guest:{label:'GUEST',levels:{mic:60,music:34,carts:42,requests:40,master:82},mutes:{mic:false,music:false,carts:true,requests:true,master:false},detail:'Guest-ready mix · dedicated guest input pending'},
  autodj:{label:'AUTODJ',levels:{...DEFAULT_LEVELS},mutes:{mic:true,music:true,carts:true,requests:true,master:false},detail:'Local program channels parked safely'}
};

const state={
  isLive:false,
  selectedShow:'',
  scene:null,
  applyingScene:false,
  signalReady:false,
  cueVolume:85,
  outputDeviceId:'',
  channels:Object.fromEntries(ALL_IDS.map(id=>[id,{level:DEFAULT_LEVELS[id],muted:false,cue:false}])),
  smart:{enabled:false,ducking:false,duckDb:10,recoveryMs:900,noiseFloor:.004,voiceSince:0,silenceSince:0}
};

let audioContext=null,mixBus=null,masterGain=null,limiter=null,masterAnalyser=null,programDest=null,cueBus=null,cueDest=null,cueAudio=null;
let meterRaf=0,smartLastCheck=0;
let micStream=null,musicStream=null;
const nodes=new Map();
const analyserData=new WeakMap();

const consoleShell=document.createElement('div');
consoleShell.className='broadcast-console';
consoleShell.id='broadcastConsole';
consoleShell.innerHTML=`
  <section class="console-topbar">
    <div class="console-identity"><div class="console-status-light" id="consoleStatusLight"></div><div><p class="eyebrow">PARAÍSO BROADCAST CONSOLE</p><h2 id="consoleStateTitle">Prepare the board</h2></div></div>
    <div class="console-ready-pill" id="consoleReadyPill"><i></i><span>MIC CONNECTING</span></div>
  </section>
  <section class="setup-ribbon has-music-input">
    <label class="ribbon-field"><span>SHOW</span><select id="liveShowSelect"><option value="">Select show…</option><option>Sebastián Live</option><option>Viernes en Paraíso</option><option>Guest DJ Session</option><option>Special Broadcast</option></select></label>
    <label class="ribbon-field"><span>MICROPHONE</span><select id="micDeviceSelect"><option value="">Default microphone</option></select></label>
    <label class="ribbon-field music-input-field" id="musicInputField"><span>MUSIC INPUT</span><div class="music-input-row"><select id="musicDeviceSelect"><option value="">Choose virtual audio…</option></select><button id="musicInputButton" class="music-input-button" type="button">CONNECT</button></div><small class="music-input-status" id="musicInputStatus">Select BlackHole 2ch, Radio Out, Loopback, or another virtual audio input.</small></label>
    <label class="ribbon-field"><span>HEADPHONES / CUE OUTPUT</span><select id="outputDeviceSelect"><option value="">System default output</option></select></label>
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
      <div class="cue-tools"><label class="cue-volume-control"><span>CUE VOLUME</span><input id="cueVolume" type="range" min="0" max="100" value="85"><output id="cueVolumeValue">85%</output></label><p class="cue-help"><b>CUE</b> ${CUE_HELP}</p></div>
    </div>
    <section class="broadcast-tools-panel" id="broadcastScenesPanel">
      <div class="broadcast-scenes-card">
        <div class="broadcast-tools-heading"><div><p class="eyebrow">BROADCAST SCENES</p><h4>One-click mixer states</h4></div><div class="scene-status"><span>SCENE</span><strong id="sceneStatus">CUSTOM</strong></div></div>
        <div class="scene-buttons" role="group" aria-label="Broadcast scenes">${Object.entries(SCENES).map(([id,s])=>`<button class="scene-button" type="button" data-scene="${id}" aria-pressed="false">${s.label}</button>`).join('')}</div>
        <p class="scene-detail" id="sceneDetail">Manual board state · all scene transitions are gain-ramped.</p>
      </div>
      <div class="smart-talk-card" id="smartTalkCard">
        <div class="smart-talk-top"><div><p class="eyebrow">SMART TALK</p><h4>Voice-triggered music ducking</h4></div><button class="smart-talk-toggle" id="smartTalkToggle" type="button" aria-pressed="false"><i></i><span>OFF</span></button></div>
        <div class="smart-talk-state"><span></span><strong id="smartTalkState">MANUAL CONTROL</strong><small id="smartTalkHint">Enable when you want automatic talk-over assistance.</small></div>
        <div class="smart-talk-controls"><label><span>DUCK DEPTH</span><input id="smartDuckDepth" type="range" min="6" max="18" step="1" value="10"><output id="smartDuckDepthValue">−10 dB</output></label><label><span>RECOVERY</span><input id="smartRecovery" type="range" min="250" max="2500" step="50" value="900"><output id="smartRecoveryValue">0.9 s</output></label></div>
        <p class="smart-talk-note">Convenience feature only — MUSIC is ducked on a separate gain stage; the base MUSIC fader never moves.</p>
      </div>
    </section>
    <div class="channel-bank">
      ${channelStrip('mic','MIC','Voice',72,'demo')}
      ${channelStrip('music','MUSIC','Live music',64,'demo')}
      ${channelStrip('carts','CARTS','IDs / jingles',58,'demo')}
      ${channelStrip('requests','REQUESTS','Listener queue',52,'demo')}
      ${channelStrip('master','MASTER','Final program',82,'real')}
    </div>
    <div class="monitor-readout">
      <div><span>MONITOR</span><strong id="monitorReadout">OFF</strong><small id="monitorDetail">${CUE_HELP}</small></div>
      <div><span>PROGRAM</span><strong id="programReadout">AutoDJ</strong><small id="programDetail">Final program bus idle</small></div>
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

function channelStrip(id,label,sub,value,sourceState){
  const master=id==='master';
  return `<div class="channel-strip" data-channel="${id}"><div class="channel-label"><div class="channel-title-row"><b>${label}</b><span class="channel-source-badge ${sourceState}">${master?'PROGRAM BUS':'NO SOURCE'}</span></div><span>${sub}</span><em class="channel-program-state" id="${id}ProgramState">NOT ON PROGRAM</em></div><div class="channel-meter" id="${id}Meter">${'<i></i>'.repeat(18)}</div><div class="channel-db"><span>0</span><span>-12</span><span>-24</span><span>-48</span></div><input class="channel-fader" id="${id}Level" type="range" min="0" max="100" value="${value}" aria-label="${label} level"><output id="${id}Value">${value}%</output><div class="channel-buttons"><button class="channel-btn mute" data-channel-mute="${id}">MUTE</button><button class="channel-btn cue" data-channel-cue="${id}" title="${CUE_HELP}" aria-label="Cue ${label}" aria-pressed="false"><span class="cue-word-tag">CUE</span><span class="cue-button-status">OFF</span></button></div><span class="real-meter-badge">${master?'POST MIX':'INPUT'}</span></div>`;
}
function queueRow(n,title,sub){return `<div class="deck-row"><span class="deck-number">${n}</span><div class="deck-copy"><strong>${title}</strong><small>${sub}</small></div><button class="queue-action">Play next</button></div>`}
function requestRow(initial,name,sub){return `<div class="incoming-row"><span class="incoming-avatar">${initial}</span><div class="incoming-copy"><strong>${name}</strong><small>${sub}</small></div><button class="request-action">Accept</button></div>`}

const dialog=document.createElement('dialog');
dialog.className='live-confirm-dialog';
dialog.id='liveConfirmDialog';
dialog.innerHTML=`<form method="dialog"><div class="confirm-icon" id="confirmIcon">●</div><p class="eyebrow" id="confirmEyebrow">READY TO BROADCAST</p><h3 id="confirmTitle">Go on air?</h3><p id="confirmCopy">The local program bus will enter ON AIR state. Backend streaming is still not connected.</p><div class="confirm-summary"><div><span>Show</span><strong id="confirmShow">—</strong></div><div><span>Microphone</span><strong id="confirmMic">—</strong></div><div><span>Cue</span><strong id="confirmMonitor">Off</strong></div><div><span>Fallback</span><strong>AutoDJ ready</strong></div></div><div class="confirm-actions"><button class="confirm-cancel" value="cancel">Cancel</button><button class="confirm-onair" id="confirmOnAir" value="default" type="button">GO ON AIR</button></div></form>`;
document.body.appendChild(dialog);

const showSelect=$('#liveShowSelect'),micSelect=$('#micDeviceSelect'),musicSelect=$('#musicDeviceSelect'),musicButton=$('#musicInputButton'),musicField=$('#musicInputField'),musicStatus=$('#musicInputStatus'),outputSelect=$('#outputDeviceSelect'),reviewButton=$('#reviewButton'),airButton=$('#airButton'),cueVolume=$('#cueVolume');

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function dbToGain(db){return Math.pow(10,db/20)}
function levelGain(id){return clamp(state.channels[id].level/100)}
function sourceExists(id){return id==='master'?!!audioContext:nodes.has(id)}
function channelAudible(id){return sourceExists(id)&&!state.channels[id].muted&&state.channels[id].level>0}
function anyProgramChannelOpen(){return CHANNEL_IDS.some(channelAudible)}
function showError(msg){const el=$('#micError');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(showError.timer);showError.timer=setTimeout(()=>el.classList.remove('show'),4400)}

function ensureAudio(){
  if(audioContext)return audioContext;
  audioContext=new (window.AudioContext||window.webkitAudioContext)();
  mixBus=audioContext.createGain();
  masterGain=audioContext.createGain();
  limiter=audioContext.createDynamicsCompressor();
  masterAnalyser=audioContext.createAnalyser();
  programDest=audioContext.createMediaStreamDestination();
  cueBus=audioContext.createGain();
  cueDest=audioContext.createMediaStreamDestination();
  mixBus.gain.value=1;
  masterGain.gain.value=levelGain('master');
  limiter.threshold.value=-2;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.12;
  masterAnalyser.fftSize=512;masterAnalyser.smoothingTimeConstant=.45;
  cueBus.gain.value=state.cueVolume/100;
  mixBus.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(masterAnalyser);
  masterAnalyser.connect(programDest);
  cueBus.connect(cueDest);
  cueAudio=document.createElement('audio');
  cueAudio.autoplay=true;cueAudio.playsInline=true;cueAudio.volume=1;cueAudio.style.display='none';cueAudio.setAttribute('aria-hidden','true');cueAudio.srcObject=cueDest.stream;document.body.appendChild(cueAudio);
  applyMasterGain(true);
  startMeterLoop();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  return audioContext;
}
function resumeAudio(){const ctx=ensureAudio();if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx}
function smoothParam(param,target,ms=35){
  if(!param)return;target=Math.max(0,Number(target)||0);
  const ctx=ensureAudio(),now=ctx.currentTime;
  try{if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(now);else{param.cancelScheduledValues(now);param.setValueAtTime(param.value,now)}param.linearRampToValueAtTime(target,now+Math.max(5,ms)/1000)}catch{param.value=target}
}
function applyChannelGain(id,ms=35){const entry=nodes.get(id);if(!entry)return;smoothParam(entry.fader.gain,state.channels[id].muted?0:levelGain(id),ms)}
function applyMasterGain(immediate=false){if(!masterGain)return;smoothParam(masterGain.gain,state.channels.master.muted?0:levelGain('master'),immediate?5:35)}
function applyDuck(ms=120){const entry=nodes.get('music');if(!entry?.duck)return;smoothParam(entry.duck.gain,state.smart.ducking?dbToGain(-state.smart.duckDb):1,ms)}

function makeAnalyser(){const a=ensureAudio().createAnalyser();a.fftSize=512;a.smoothingTimeConstant=.48;return a}
function attachNode(id,source,{stream=null,external=false}={}){
  if(!CHANNEL_IDS.includes(id)||!source||typeof source.connect!=='function')return false;
  detachChannel(id,false);
  const ctx=ensureAudio(),analyser=makeAnalyser(),fader=ctx.createGain(),duck=id==='music'?ctx.createGain():null;
  fader.gain.value=state.channels[id].muted?0:levelGain(id);
  if(duck)duck.gain.value=state.smart.ducking?dbToGain(-state.smart.duckDb):1;
  try{source.connect(analyser);if(duck){analyser.connect(duck);duck.connect(fader)}else analyser.connect(fader);fader.connect(mixBus)}catch(e){try{source.disconnect()}catch{};try{analyser.disconnect()}catch{};try{duck?.disconnect()}catch{};try{fader.disconnect()}catch{};return false}
  nodes.set(id,{source,analyser,fader,duck,stream,external});
  if(state.channels[id].cue)connectCue(id);
  setSourceBadge(id,true);
  updateProgramStates();
  updateSmartVisual();
  return true;
}
function detachChannel(id,stopOwned=true){
  const entry=nodes.get(id);if(!entry)return;
  disconnectCue(id,entry);
  try{entry.source.disconnect(entry.analyser)}catch{}
  try{entry.analyser.disconnect()}catch{}
  try{entry.duck?.disconnect()}catch{}
  try{entry.fader.disconnect()}catch{}
  if(stopOwned&&entry.stream&&!entry.external)entry.stream.getTracks().forEach(t=>t.stop());
  nodes.delete(id);setSourceBadge(id,false);clearMeter(`${id}Meter`);updateProgramStates();updateSmartVisual();
}
function setSourceBadge(id,real){const b=$(`.channel-strip[data-channel="${id}"] .channel-source-badge`);if(!b)return;b.textContent=real?'REAL':'NO SOURCE';b.classList.toggle('real',real);b.classList.toggle('demo',!real)}

function connectCue(id,entryOverride=null){const node=id==='master'?masterAnalyser:(entryOverride?.source||nodes.get(id)?.source);if(!node||!cueBus)return false;try{node.connect(cueBus);return true}catch{return false}}
function disconnectCue(id,entryOverride=null){const node=id==='master'?masterAnalyser:(entryOverride?.source||nodes.get(id)?.source);if(!node||!cueBus)return;try{node.disconnect(cueBus)}catch{}}
function setCue(id,next,{internal=false}={}){
  resumeAudio();
  const ch=state.channels[id],desired=typeof next==='boolean'?next:!ch.cue;
  if(desired===ch.cue)return;
  ch.cue=desired;
  if(desired){if(!connectCue(id)&&id!=='master')showError(`${id.toUpperCase()} has no audio source to CUE yet.`);startCuePlayback()}else disconnectCue(id);
  updateCueVisual(id);updateCueReadout();
  if(!internal)markCustom('Headphone CUE changed manually.');
}
function updateCueVisual(id){const on=state.channels[id].cue,btn=$(`[data-channel-cue="${id}"]`),strip=$(`.channel-strip[data-channel="${id}"]`);btn?.classList.toggle('active',on);btn?.setAttribute('aria-pressed',on?'true':'false');strip?.classList.toggle('is-cued',on);const s=btn?.querySelector('.cue-button-status');if(s)s.textContent=on?'ON':'OFF'}
function updateCueReadout(){const active=ALL_IDS.filter(id=>state.channels[id].cue);$('#monitorReadout').textContent=active.length?active.map(x=>x.toUpperCase()).join(' + '):'OFF';$('#monitorDetail').textContent=active.length?`${active.length} CUE${active.length===1?'':'S'} · ${state.cueVolume}% · ${CUE_HELP}`:CUE_HELP}
async function applyCueSink(){
  if(!cueAudio)return;const requested=state.outputDeviceId||'default',label=outputSelect.selectedOptions[0]?.textContent||'System default output';
  if(typeof cueAudio.setSinkId==='function')try{await cueAudio.setSinkId(requested);$('#monitorDetail').textContent=`Headphone CUE output: ${label} · ${state.cueVolume}%`;return true}catch{showError(`Could not route CUE to ${label}; using the system default output.`);try{await cueAudio.setSinkId('default')}catch{}}
  if(state.outputDeviceId)$('#monitorDetail').textContent='This browser cannot select a separate output; CUE uses the system default audio output.';
  return false;
}
function startCuePlayback(){if(!cueAudio)return;applyCueSink();const p=cueAudio.play();p?.catch?.(()=>showError('Headphone monitoring was blocked by the browser. Tap CUE again to start it.'))}

function setLevel(id,value,{internal=false,immediate=false}={}){
  const v=Math.round(clamp(Number(value)||0,0,100));state.channels[id].level=v;const input=$(`#${id}Level`),out=$(`#${id}Value`);if(input&&Number(input.value)!==v)input.value=String(v);if(out)out.textContent=`${v}%`;
  if(id==='master')applyMasterGain(immediate);else applyChannelGain(id,immediate?5:35);
  updateProgramStates();
  if(!internal)markCustom(`${id.toUpperCase()} fader changed manually.`);
}
function setMute(id,next,{internal=false}={}){
  const desired=!!next;if(state.channels[id].muted===desired)return;state.channels[id].muted=desired;if(id==='master')applyMasterGain();else applyChannelGain(id,45);updateMuteVisual(id);updateProgramStates();updateSmartVisual();if(!internal)markCustom(`${id.toUpperCase()} mute changed manually.`)
}
function updateMuteVisual(id){const on=state.channels[id].muted,btn=$(`[data-channel-mute="${id}"]`),strip=$(`.channel-strip[data-channel="${id}"]`);btn?.classList.toggle('active',on);if(btn)btn.textContent=on?'MUTED':'MUTE';strip?.classList.toggle('is-muted',on)}
function updateProgramStates(){
  const masterOpen=state.isLive&&!state.channels.master.muted&&state.channels.master.level>0;
  ALL_IDS.forEach(id=>{const on=id==='master'?masterOpen:(masterOpen&&sourceExists(id)&&!state.channels[id].muted&&state.channels[id].level>0);const el=$(`#${id}ProgramState`);if(el){el.textContent=on?'PROGRAM':'NOT ON PROGRAM';el.classList.toggle('on',on)}})
}

function readAnalyser(analyser){
  if(!analyser)return{rms:0,db:-60,norm:0};let data=analyserData.get(analyser);if(!data||data.length!==analyser.fftSize){data=new Uint8Array(analyser.fftSize);analyserData.set(analyser,data)}analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x}const rms=Math.sqrt(sum/data.length),db=Math.max(-60,20*Math.log10(Math.max(rms,.001))),norm=clamp((db+60)/60);return{rms,db,norm}
}
function paintMeter(id,n){const bars=$$(`#${id} i`),lit=Math.round(clamp(n)*bars.length);bars.forEach((bar,i)=>bar.className=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):'')}
function clearMeter(id){$$(`#${id} i`).forEach(i=>i.className='')}
function startMeterLoop(){
  if(meterRaf)return;
  const tick=now=>{
    let micRms=0;
    for(const id of CHANNEL_IDS){const e=nodes.get(id);if(e){const m=readAnalyser(e.analyser);paintMeter(`${id}Meter`,m.norm);if(id==='mic'){micRms=m.rms;$('#inputDb').textContent=`${Math.round(m.db)} dB`;if(m.rms>.004){if(!state.signalReady){state.signalReady=true;updateReadyState()}$('#inputHint').textContent='Signal detected'}else $('#inputHint').textContent='Microphone connected'}}else{clearMeter(`${id}Meter`);if(id==='mic'){$('#inputDb').textContent='— dB'}}}
    if(masterAnalyser){const silentByControl=state.channels.master.muted||state.channels.master.level<=0||!anyProgramChannelOpen();const m=silentByControl?{rms:0,norm:0}:readAnalyser(masterAnalyser);paintMeter('masterMeter',m.norm)}else clearMeter('masterMeter');
    smartTalkTick(now,micRms);
    meterRaf=requestAnimationFrame(tick);
  };
  meterRaf=requestAnimationFrame(tick);
}

async function enumerateDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const devices=await navigator.mediaDevices.enumerateDevices(),curMic=micSelect.value,curMusic=musicSelect.value,curOut=outputSelect.value;
    const ins=devices.filter(d=>d.kind==='audioinput'),outs=devices.filter(d=>d.kind==='audiooutput');
    micSelect.innerHTML='<option value="">Default microphone</option>'+ins.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Audio input ${i+1}`}</option>`).join('');
    musicSelect.innerHTML='<option value="">Choose virtual audio…</option>'+ins.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Audio input ${i+1}`}</option>`).join('');
    outputSelect.innerHTML='<option value="">System default output</option>'+outs.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Output ${i+1}`}</option>`).join('');
    if([...micSelect.options].some(o=>o.value===curMic))micSelect.value=curMic;
    if([...musicSelect.options].some(o=>o.value===curMusic))musicSelect.value=curMusic;else{const preferred=[...musicSelect.options].find(o=>/blackhole|radio\s*out|loopback|soundflower|virtual/i.test(o.textContent||''));if(preferred)musicSelect.value=preferred.value}
    if([...outputSelect.options].some(o=>o.value===curOut))outputSelect.value=curOut;
  }catch{}
}
async function connectMicrophone(){
  if(!navigator.mediaDevices?.getUserMedia){showError('Microphone input is not available in this browser.');return}
  disconnectMicrophone();
  try{
    const audio=micSelect.value?{deviceId:{exact:micSelect.value},echoCancellation:false,noiseSuppression:false,autoGainControl:false}:{echoCancellation:false,noiseSuppression:false,autoGainControl:false};
    micStream=await navigator.mediaDevices.getUserMedia({audio,video:false});const ctx=resumeAudio(),source=ctx.createMediaStreamSource(micStream);if(!attachNode('mic',source,{stream:micStream}))throw new Error('Could not attach microphone');
    setSourceBadge('mic',true);$('#inputHint').textContent='Microphone connected';await enumerateDevices();updateReadyState();
    micStream.getAudioTracks()[0]?.addEventListener('ended',disconnectMicrophone,{once:true});
  }catch(e){micStream=null;showError(e?.name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access to operate Live Studio.':'Could not open that microphone.');$('#inputHint').textContent='Microphone permission required';updateReadyState()}
}
function disconnectMicrophone(){if(nodes.has('mic'))detachChannel('mic',false);if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}state.signalReady=false;setSourceBadge('mic',false);clearMeter('micMeter');$('#inputDb').textContent='— dB';$('#inputHint').textContent='Microphone disconnected';updateReadyState()}

function setMusicStatus(text,status='idle'){musicStatus.textContent=text;musicField.dataset.state=status}
async function connectMusic(){
  if(musicStream){disconnectMusic();return}
  if(!musicSelect.value){setMusicStatus('Choose a virtual audio input first.','error');return}
  if(!navigator.mediaDevices?.getUserMedia){setMusicStatus('Audio capture is unavailable in this browser.','error');return}
  resumeAudio();musicButton.disabled=true;musicButton.textContent='CONNECTING…';musicSelect.disabled=true;setMusicStatus('Opening real MUSIC input…','connecting');
  try{
    musicStream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:musicSelect.value},echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}},video:false});
    const source=audioContext.createMediaStreamSource(musicStream);if(!attachNode('music',source,{stream:musicStream}))throw new Error('Could not attach MUSIC');
    const label=musicStream.getAudioTracks()[0]?.label||musicSelect.selectedOptions[0]?.textContent||'Virtual audio';musicButton.textContent='DISCONNECT';musicButton.classList.add('connected');musicField.classList.add('connected');setMusicStatus(`REAL MUSIC · ${label} · routed through MUSIC → MASTER.`,'connected');musicStream.getAudioTracks()[0]?.addEventListener('ended',disconnectMusic,{once:true});
  }catch(e){if(musicStream)musicStream.getTracks().forEach(t=>t.stop());musicStream=null;setMusicStatus(e?.name==='NotAllowedError'?'Music input permission was blocked.':'Could not connect that MUSIC input.','error');musicButton.textContent='CONNECT';musicSelect.disabled=false}finally{musicButton.disabled=false}
}
function disconnectMusic(){if(nodes.has('music'))detachChannel('music',false);if(musicStream){musicStream.getTracks().forEach(t=>t.stop());musicStream=null}musicButton.textContent='CONNECT';musicButton.classList.remove('connected');musicField.classList.remove('connected');musicSelect.disabled=false;setMusicStatus('Disconnected. Choose a virtual audio input to reconnect.','idle');if(state.smart.ducking){state.smart.ducking=false;updateSmartVisual()}}

function updateSmartVisual(){
  const s=state.smart,card=$('#smartTalkCard'),toggle=$('#smartTalkToggle');toggle.classList.toggle('active',s.enabled);toggle.setAttribute('aria-pressed',s.enabled?'true':'false');toggle.querySelector('span').textContent=s.enabled?'ON':'OFF';card.classList.toggle('enabled',s.enabled);card.classList.toggle('ducking',s.ducking);$('.channel-strip[data-channel="music"]')?.classList.toggle('smart-ducking',s.ducking);
  let title='MANUAL CONTROL',hint='Enable when you want automatic talk-over assistance.';
  if(s.enabled){if(state.scene){title='PAUSED · SCENE CONTROL';hint=`${SCENES[state.scene].label} owns the board until you make a manual change.`}else if(!state.isLive){title='ARMED · OFF AIR';hint='Smart Talk will engage when the live program is on air.'}else if(!nodes.has('music')){title='ARMED · NO MUSIC SOURCE';hint='Connect a real MUSIC input.'}else if(!nodes.has('mic')){title='ARMED · NO MIC';hint='Connect the microphone.'}else if(state.channels.mic.muted||state.channels.mic.level<=0){title='PAUSED · MIC CLOSED';hint='MIC mute/fader has priority.'}else if(state.channels.music.muted||state.channels.music.level<=0){title='PAUSED · MUSIC CLOSED';hint='MUSIC mute/fader has priority.'}else if(s.ducking){title=`DUCKING −${s.duckDb} dB`;hint=`Voice detected · MUSIC base fader remains ${state.channels.music.level}%`}else{title='LISTENING';hint='Waiting for meaningful microphone activity.'}}
  $('#smartTalkState').textContent=title;$('#smartTalkHint').textContent=hint;
}
function smartEligible(){return state.smart.enabled&&state.isLive&&!state.applyingScene&&!state.scene&&nodes.has('mic')&&nodes.has('music')&&!state.channels.mic.muted&&state.channels.mic.level>0&&!state.channels.music.muted&&state.channels.music.level>0&&!state.channels.master.muted&&state.channels.master.level>0}
function smartTalkTick(now,micRms){
  if(now-smartLastCheck<50)return;smartLastCheck=now;const s=state.smart;
  if(!s.ducking&&micRms<.025)s.noiseFloor=s.noiseFloor*.985+micRms*.015;
  const attack=Math.max(.012,s.noiseFloor*2.8),release=Math.max(.006,attack*.55);
  if(!smartEligible()){if(s.ducking){s.ducking=false;applyDuck(120)}s.voiceSince=s.silenceSince=0;updateSmartVisual();return}
  if(micRms>=attack){s.silenceSince=0;if(!s.voiceSince)s.voiceSince=now;if(!s.ducking&&now-s.voiceSince>=90){s.ducking=true;applyDuck(120);updateSmartVisual()}}
  else if(micRms<=release){s.voiceSince=0;if(!s.silenceSince)s.silenceSince=now;if(s.ducking&&now-s.silenceSince>=220){s.ducking=false;applyDuck(s.recoveryMs);updateSmartVisual()}}
}

function updateSceneVisual(){const name=state.scene;$$('.scene-button').forEach(b=>{const on=b.dataset.scene===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false')});$('#sceneStatus').textContent=name?SCENES[name].label:'CUSTOM';$('#sceneDetail').textContent=name?SCENES[name].detail:'Manual board state · all scene transitions are gain-ramped.';updateSmartVisual()}
function markCustom(detail){if(state.applyingScene)return;if(state.scene){state.scene=null;updateSceneVisual()}if(detail)$('#sceneDetail').textContent=detail}
function animateLevel(id,target,duration,token){return new Promise(resolve=>{const from=state.channels[id].level,to=clamp(Number(target)||0,0,100),start=performance.now();const step=now=>{if(token!==sceneToken){resolve();return}const p=clamp((now-start)/Math.max(1,duration)),e=1-Math.pow(1-p,3);setLevel(id,from+(to-from)*e,{internal:true,immediate:true});if(p<1)requestAnimationFrame(step);else{setLevel(id,to,{internal:true});resolve()}};requestAnimationFrame(step)})}
let sceneToken=0;
async function applyScene(id){
  const scene=SCENES[id];if(!scene)return;const token=++sceneToken;state.applyingScene=true;state.scene=id;$('#broadcastScenesPanel').classList.add('scene-transitioning');$('#sceneStatus').textContent='CHANGING…';
  if(state.smart.ducking){state.smart.ducking=false;applyDuck(100)}
  ALL_IDS.forEach(ch=>{if(state.channels[ch].cue)setCue(ch,false,{internal:true})});
  ALL_IDS.forEach(ch=>{if(scene.mutes[ch])setMute(ch,true,{internal:true})});
  const opening=ALL_IDS.filter(ch=>!scene.mutes[ch]&&state.channels[ch].muted);
  opening.forEach(ch=>{setLevel(ch,0,{internal:true,immediate:true});setMute(ch,false,{internal:true})});
  await Promise.all(ALL_IDS.map(ch=>animateLevel(ch,scene.levels[ch],scene.levels[ch]>state.channels[ch].level?650:220,token)));
  if(token!==sceneToken)return;ALL_IDS.forEach(ch=>setMute(ch,!!scene.mutes[ch],{internal:true}));state.applyingScene=false;$('#broadcastScenesPanel').classList.remove('scene-transitioning');updateSceneVisual();
  if(id==='autodj'&&state.isLive)$('#sceneDetail').textContent='Local channels are parked. Use END BROADCAST for the actual AutoDJ handoff.';
}

function setCheck(id,ready,detail){const el=$(id);if(!el)return;el.classList.toggle('ready',ready);el.querySelector('i').textContent=ready?'✓':id==='#checkMic'?'1':id==='#checkSignal'?'2':'3';el.querySelector('small').textContent=detail}
function updateReadyState(){
  const micReady=nodes.has('mic'),ready=micReady&&state.signalReady&&!!state.selectedShow;setCheck('#checkMic',micReady,micReady?'Connected':'Permission needed');setCheck('#checkSignal',state.signalReady,state.signalReady?'Healthy':'Waiting for audio');setCheck('#checkShow',!!state.selectedShow,state.selectedShow||'Choose one');const pill=$('#consoleReadyPill');pill.classList.toggle('ready',ready||state.isLive);pill.querySelector('span').textContent=state.isLive?'ON AIR':ready?'READY':micReady?'SETUP NEEDED':'MIC NEEDED';reviewButton.disabled=!ready||state.isLive;airButton.disabled=!ready&&!state.isLive;if(!state.isLive){airButton.classList.remove('end');airButton.querySelector('b').textContent='GO ON AIR';airButton.querySelector('small').textContent='Take over from AutoDJ'}$('#consoleStateTitle').textContent=state.isLive?'Live program in progress':ready?'Board ready for air':micReady?'Choose a show':'Microphone access needed';$('#airStatusText').textContent=state.isLive?'Final program bus is live.':ready?'Setup complete. Review or go on air.':'Connect microphone and choose a show before taking control.';updateProgramStates()
}
function setLive(next){state.isLive=!!next;document.body.classList.toggle('live-broadcasting',state.isLive);$('#consoleStatusLight').classList.toggle('live',state.isLive);$('#programReadout').textContent=state.isLive?'LIVE PROGRAM':'AutoDJ';$('#programDetail').textContent=state.isLive?'Final post-master program bus active':'Final program bus idle';const a=$('#airStatus');a.classList.toggle('live',state.isLive);a.querySelector('span').textContent=state.isLive?'ON AIR':'OFF AIR';showSelect.disabled=state.isLive;micSelect.disabled=state.isLive;if(state.isLive){resumeAudio();airButton.disabled=false;airButton.classList.add('end');airButton.querySelector('b').textContent='END BROADCAST';airButton.querySelector('small').textContent='Return control to AutoDJ'}else if(state.smart.ducking){state.smart.ducking=false;applyDuck(100)}updateReadyState();updateSmartVisual()}
function openConfirm(end=false){$('#confirmShow').textContent=state.selectedShow||'Live broadcast';$('#confirmMic').textContent=micSelect.selectedOptions[0]?.textContent||'Default microphone';const active=ALL_IDS.filter(id=>state.channels[id].cue);$('#confirmMonitor').textContent=active.length?`${active.map(x=>x.toUpperCase()).join(' + ')} · ${state.cueVolume}%`:'Off';$('#confirmEyebrow').textContent=end?'END LIVE BROADCAST':'READY TO BROADCAST';$('#confirmTitle').textContent=end?'Return to AutoDJ?':'Go on air?';$('#confirmCopy').textContent=end?'The local live program will end and AutoDJ demo mode will resume.':'The final program bus will enter ON AIR state. Backend transport is still not connected.';$('#confirmIcon').textContent=end?'■':'●';const action=$('#confirmOnAir');action.textContent=end?'END BROADCAST':'GO ON AIR';action.classList.toggle('danger',end);action.dataset.mode=end?'end':'start';dialog.showModal()}

showSelect.addEventListener('change',()=>{state.selectedShow=showSelect.value;updateReadyState()});
micSelect.addEventListener('change',connectMicrophone);
musicButton.addEventListener('click',connectMusic);
musicSelect.addEventListener('change',()=>{if(musicStream)disconnectMusic();const label=musicSelect.selectedOptions[0]?.textContent||'';if(musicSelect.value)setMusicStatus(/blackhole|radio\s*out|loopback|soundflower|virtual/i.test(label)?`${label} selected. Ready to connect.`:`${label} selected. Confirm this is your intended broadcast feed.`,'ready');else setMusicStatus('Select a virtual audio input.','idle')});
outputSelect.addEventListener('change',()=>{state.outputDeviceId=outputSelect.value;applyCueSink()});
cueVolume.addEventListener('input',e=>{state.cueVolume=Number(e.target.value);$('#cueVolumeValue').textContent=`${state.cueVolume}%`;if(cueBus)smoothParam(cueBus.gain,state.cueVolume/100,18);updateCueReadout()});
ALL_IDS.forEach(id=>$(`#${id}Level`).addEventListener('input',e=>setLevel(id,Number(e.target.value))));
$$('[data-channel-mute]').forEach(btn=>btn.addEventListener('click',()=>setMute(btn.dataset.channelMute,!state.channels[btn.dataset.channelMute].muted)));
$$('[data-channel-cue]').forEach(btn=>btn.addEventListener('click',()=>setCue(btn.dataset.channelCue)));
$$('.scene-button').forEach(btn=>btn.addEventListener('click',()=>applyScene(btn.dataset.scene)));
$('#smartTalkToggle').addEventListener('click',()=>{state.smart.enabled=!state.smart.enabled;if(!state.smart.enabled&&state.smart.ducking){state.smart.ducking=false;applyDuck(100)}updateSmartVisual()});
$('#smartDuckDepth').addEventListener('input',e=>{state.smart.duckDb=Number(e.target.value);$('#smartDuckDepthValue').textContent=`−${state.smart.duckDb} dB`;if(state.smart.ducking)applyDuck(100);updateSmartVisual()});
$('#smartRecovery').addEventListener('input',e=>{state.smart.recoveryMs=Number(e.target.value);$('#smartRecoveryValue').textContent=`${(state.smart.recoveryMs/1000).toFixed(1)} s`});
$$('.queue-action').forEach(btn=>btn.addEventListener('click',()=>{$$('.queue-action.armed').forEach(b=>{b.classList.remove('armed');b.textContent='Play next'});btn.classList.add('armed');btn.textContent='Armed ✓'}));
$$('.request-action').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.add('accepted');btn.textContent='Queued ✓';btn.disabled=true}));
reviewButton.addEventListener('click',()=>openConfirm(false));airButton.addEventListener('click',()=>openConfirm(state.isLive));$('#confirmOnAir').addEventListener('click',()=>{const end=$('#confirmOnAir').dataset.mode==='end';dialog.close();setLive(!end)});
$('#goLiveButton')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelector('.nav-item[data-view="live"]')?.click();setTimeout(()=>$('#broadcastConsole')?.scrollIntoView({behavior:'smooth',block:'start'}),80)},true);

function syncLiveViewMic(){const open=liveView.classList.contains('active');if(open&&!micStream)connectMicrophone();if(!open&&micStream&&!state.isLive)disconnectMicrophone()}
new MutationObserver(syncLiveViewMic).observe(liveView,{attributes:true,attributeFilter:['class']});document.querySelector('.nav-item[data-view="live"]')?.addEventListener('click',()=>setTimeout(syncLiveViewMic,0));
navigator.mediaDevices?.addEventListener?.('devicechange',enumerateDevices);
window.addEventListener('beforeunload',()=>{try{disconnectMicrophone()}catch{};try{disconnectMusic()}catch{};if(meterRaf)cancelAnimationFrame(meterRaf);try{cueAudio?.pause()}catch{}});

window.PARAISO_LIVE_AUDIO={
  ensureContext:ensureAudio,
  attachSource(id,node){return attachNode(id,node,{external:true})},
  attachStream(id,stream){if(!CHANNEL_IDS.includes(id)||!stream)return false;const source=ensureAudio().createMediaStreamSource(stream);return attachNode(id,source,{stream,external:true})},
  detachSource(id){detachChannel(id,false)},
  setChannelLevel(id,value){if(!ALL_IDS.includes(id))return false;setLevel(id,value);return true},
  setChannelMute(id,value){if(!ALL_IDS.includes(id))return false;setMute(id,value);return true},
  setCue(id,value){if(!ALL_IDS.includes(id))return false;setCue(id,value);return true},
  getChannelLevel:id=>state.channels[id]?.level??0,
  getChannelMuted:id=>!!state.channels[id]?.muted,
  get context(){return audioContext},
  get programStream(){return programDest?.stream||null},
  get cueStream(){return cueDest?.stream||null},
  get activeCues(){return ALL_IDS.filter(id=>state.channels[id].cue)},
  get isLive(){return state.isLive},
  get state(){return JSON.parse(JSON.stringify(state))}
};
window.PARAISO_MUSIC_INPUT={connect:connectMusic,disconnect:disconnectMusic,refreshDevices:enumerateDevices,get connected(){return !!musicStream}};
window.PARAISO_BROADCAST_TOOLS={applyScene,setSmartTalk(enabled){state.smart.enabled=!!enabled;updateSmartVisual()},get activeScene(){return state.scene},get smartTalkEnabled(){return state.smart.enabled},get smartTalkDucking(){return state.smart.ducking},scenes:Object.keys(SCENES)};

ALL_IDS.forEach(id=>{updateMuteVisual(id);updateCueVisual(id)});updateCueReadout();updateSceneVisual();updateSmartVisual();updateProgramStates();updateReadyState();enumerateDevices();syncLiveViewMic();
})();
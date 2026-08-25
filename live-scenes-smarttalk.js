(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const surface=$('.mixer-surface'),bank=surface?.querySelector('.channel-bank');
if(!surface||!bank||$('#broadcastScenesPanel'))return;

const CHANNELS=['mic','music','carts','requests','master'];
const DEFAULTS={mic:72,music:64,carts:58,requests:52,master:82};
const SCENES={
  talk:{label:'TALK OVER MUSIC',levels:{mic:72,music:46,carts:42,requests:40,master:82},mutes:{mic:false,music:false,carts:true,requests:true,master:false},detail:'Mic open · music safely ducked · CUE cleared'},
  song:{label:'FULL SONG',levels:{mic:24,music:78,carts:48,requests:44,master:82},mutes:{mic:true,music:false,carts:true,requests:true,master:false},detail:'Music forward · mic safely muted · CUE cleared'},
  id:{label:'STATION ID',levels:{mic:20,music:22,carts:74,requests:40,master:82},mutes:{mic:true,music:false,carts:false,requests:true,master:false},detail:'Carts prioritized · music held low · CUE cleared'},
  request:{label:'REQUEST',levels:{mic:56,music:28,carts:42,requests:72,master:82},mutes:{mic:false,music:false,carts:true,requests:false,master:false},detail:'Request channel forward · mic ready · CUE cleared'},
  guest:{label:'GUEST',levels:{mic:60,music:34,carts:42,requests:40,master:82},mutes:{mic:false,music:false,carts:true,requests:true,master:false},detail:'Guest-ready mix prepared · dedicated guest channel not connected yet'},
  autodj:{label:'AUTODJ',levels:{...DEFAULTS},mutes:{mic:true,music:true,carts:true,requests:true,master:false},detail:'Local channels parked safely · end broadcast to return transport to AutoDJ'}
};

let activeScene=null,sceneApplying=false,sceneToken=0;
let smartEnabled=false,smartDucking=false,lastActivityCheck=0,voiceSince=0,silenceSince=0,noiseFloor=.008;
let musicDuckGain=null,musicDuckSource=null;

const panel=document.createElement('section');
panel.className='broadcast-tools-panel';
panel.id='broadcastScenesPanel';
panel.innerHTML=`
  <div class="broadcast-scenes-card">
    <div class="broadcast-tools-heading">
      <div><p class="eyebrow">BROADCAST SCENES</p><h4>One-click mixer states</h4></div>
      <div class="scene-status"><span>SCENE</span><strong id="sceneStatus">CUSTOM</strong></div>
    </div>
    <div class="scene-buttons" role="group" aria-label="Broadcast scenes">
      ${Object.entries(SCENES).map(([id,s])=>`<button class="scene-button" type="button" data-scene="${id}" aria-pressed="false">${s.label}</button>`).join('')}
    </div>
    <p class="scene-detail" id="sceneDetail">Manual board state · scene changes use safe level ramps and clear headphone CUE routes.</p>
  </div>
  <div class="smart-talk-card" id="smartTalkCard">
    <div class="smart-talk-top">
      <div><p class="eyebrow">SMART TALK</p><h4>Voice-triggered music ducking</h4></div>
      <button class="smart-talk-toggle" id="smartTalkToggle" type="button" aria-pressed="false"><i></i><span>OFF</span></button>
    </div>
    <div class="smart-talk-state"><span id="smartTalkStateDot"></span><strong id="smartTalkState">MANUAL CONTROL</strong><small id="smartTalkHint">Enable when you want automatic talk-over assistance.</small></div>
    <div class="smart-talk-controls">
      <label><span>DUCK DEPTH</span><input id="smartDuckDepth" type="range" min="6" max="18" step="1" value="10"><output id="smartDuckDepthValue">−10 dB</output></label>
      <label><span>RECOVERY</span><input id="smartRecovery" type="range" min="250" max="2500" step="50" value="900"><output id="smartRecoveryValue">0.9 s</output></label>
    </div>
    <p class="smart-talk-note">Convenience feature only — it temporarily lowers MUSIC while speech is detected, preserves the DJ's base fader position, and never overrides MUTE.</p>
  </div>`;
surface.insertBefore(panel,bank);

const sceneStatus=$('#sceneStatus'),sceneDetail=$('#sceneDetail'),smartToggle=$('#smartTalkToggle'),duckDepth=$('#smartDuckDepth'),recovery=$('#smartRecovery');

function levelEl(id){return $(`#${id}Level`)}
function muteBtn(id){return $(`[data-channel-mute="${id}"]`)}
function cueBtn(id){return $(`[data-channel-cue="${id}"]`)}
function isMuted(id){return muteBtn(id)?.classList.contains('active')||false}
function isCued(id){return cueBtn(id)?.classList.contains('active')||false}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dbToGain(db){return Math.pow(10,db/20)}

function dispatchLevel(id,value){
  const input=levelEl(id);if(!input)return;
  input.value=String(Math.round(clamp(value,0,100)));
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
async function tweenLevel(id,target,duration,token){
  const input=levelEl(id);if(!input)return;
  const from=Number(input.value),to=clamp(Number(target),0,100);
  if(Math.abs(to-from)<.5){dispatchLevel(id,to);return;}
  const start=performance.now();
  await new Promise(resolve=>{
    const tick=now=>{
      if(token!==sceneToken){resolve();return;}
      const p=clamp((now-start)/Math.max(1,duration),0,1),ease=1-Math.pow(1-p,3);
      dispatchLevel(id,from+(to-from)*ease);
      if(p<1)requestAnimationFrame(tick);else resolve();
    };
    requestAnimationFrame(tick);
  });
}
function setMute(id,muted){
  const btn=muteBtn(id);if(!btn||isMuted(id)===muted)return;
  btn.click();
}
function clearCues(){
  CHANNELS.forEach(id=>{if(isCued(id))cueBtn(id)?.click()});
}
function updateSceneVisual(){
  $$('.scene-button').forEach(btn=>{
    const on=btn.dataset.scene===activeScene;
    btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false');
  });
  sceneStatus.textContent=activeScene?SCENES[activeScene].label:'CUSTOM';
  sceneDetail.textContent=activeScene?SCENES[activeScene].detail:'Manual board state · scene changes use safe level ramps and clear headphone CUE routes.';
}
function markCustom(detail='Manual mixer adjustment detected.'){
  if(sceneApplying)return;
  activeScene=null;updateSceneVisual();sceneDetail.textContent=detail;
}

async function applyScene(id){
  const scene=SCENES[id];if(!scene)return;
  const token=++sceneToken;sceneApplying=true;activeScene=id;updateSceneVisual();
  panel.classList.add('scene-transitioning');
  sceneStatus.textContent='CHANGING…';
  releaseSmartDuck(120,true);
  clearCues();

  // Any channel being muted is silenced first. Downward moves are always safe.
  CHANNELS.forEach(ch=>{if(scene.mutes[ch])setMute(ch,true)});

  // Channels that will be opened start from zero while still muted, then rise smoothly.
  const opening=CHANNELS.filter(ch=>!scene.mutes[ch]&&isMuted(ch));
  opening.forEach(ch=>dispatchLevel(ch,0));
  opening.forEach(ch=>setMute(ch,false));

  const jobs=CHANNELS.map(ch=>{
    const current=Number(levelEl(ch)?.value||0),target=scene.levels[ch];
    const duration=target>current?700:220;
    return tweenLevel(ch,target,duration,token);
  });
  await Promise.all(jobs);
  if(token!==sceneToken)return;

  CHANNELS.forEach(ch=>setMute(ch,!!scene.mutes[ch]));
  sceneApplying=false;panel.classList.remove('scene-transitioning');updateSceneVisual();
  if(id==='guest')sceneDetail.textContent='Guest-ready mix loaded. Dedicated guest input will slot into this scene when guest-channel support is added.';
  if(id==='autodj'&&document.body.classList.contains('live-broadcasting'))sceneDetail.textContent='Local board parked safely. Use END BROADCAST to hand actual program control back to AutoDJ.';
}

$$('.scene-button').forEach(btn=>btn.addEventListener('click',()=>applyScene(btn.dataset.scene)));
CHANNELS.forEach(id=>{
  levelEl(id)?.addEventListener('input',()=>markCustom(`${id.toUpperCase()} fader changed manually.`));
  muteBtn(id)?.addEventListener('click',()=>setTimeout(()=>markCustom(`${id.toUpperCase()} mute changed manually.`),0));
  cueBtn(id)?.addEventListener('click',()=>setTimeout(()=>markCustom('Headphone CUE routing changed manually.'),0));
});

/* Patch future MUSIC attachments with an independent duck gain before the core mixer gain.
   This preserves the visible/base MUSIC fader position. */
const audio=window.PARAISO_LIVE_AUDIO;
if(audio?.attachSource&&audio?.detachSource){
  const originalAttach=audio.attachSource.bind(audio),originalDetach=audio.detachSource.bind(audio);
  audio.attachSource=function(id,node){
    if(id!=='music'||!node||typeof node.connect!=='function'||!audio.context)return originalAttach(id,node);
    try{
      if(musicDuckSource){try{musicDuckSource.disconnect(musicDuckGain)}catch{};try{musicDuckGain.disconnect()}catch{}}
      const duck=audio.context.createGain();duck.gain.value=smartDucking?dbToGain(-Number(duckDepth.value)):1;
      node.connect(duck);
      const ok=originalAttach(id,duck);
      if(!ok){try{node.disconnect(duck)}catch{};try{duck.disconnect()}catch{};return false;}
      musicDuckSource=node;musicDuckGain=duck;return true;
    }catch{return originalAttach(id,node)}
  };
  audio.detachSource=function(id){
    if(id==='music'&&musicDuckSource){try{musicDuckSource.disconnect(musicDuckGain)}catch{};try{musicDuckGain.disconnect()}catch{};musicDuckSource=musicDuckGain=null;}
    return originalDetach(id);
  };
}

function rampDuckGain(target,ms){
  if(!musicDuckGain||!audio?.context)return;
  const p=musicDuckGain.gain,now=audio.context.currentTime;
  try{
    if(typeof p.cancelAndHoldAtTime==='function')p.cancelAndHoldAtTime(now);
    else{p.cancelScheduledValues(now);p.setValueAtTime(p.value,now)}
    p.linearRampToValueAtTime(target,now+Math.max(20,ms)/1000);
  }catch{p.value=target}
}
function updateSmartVisual(){
  smartToggle.classList.toggle('active',smartEnabled);smartToggle.setAttribute('aria-pressed',smartEnabled?'true':'false');smartToggle.querySelector('span').textContent=smartEnabled?'ON':'OFF';
  const card=$('#smartTalkCard');card.classList.toggle('enabled',smartEnabled);card.classList.toggle('ducking',smartDucking);
  const music=$('.channel-strip[data-channel="music"]');music?.classList.toggle('smart-ducking',smartDucking);
  if(!smartEnabled){$('#smartTalkState').textContent='MANUAL CONTROL';$('#smartTalkHint').textContent='Enable when you want automatic talk-over assistance.';return;}
  if(smartDucking){$('#smartTalkState').textContent=`DUCKING −${duckDepth.value} dB`;$('#smartTalkHint').textContent=`Voice detected · MUSIC base fader remains at ${levelEl('music')?.value||0}%`;return;}
  if(!document.body.classList.contains('live-broadcasting')){$('#smartTalkState').textContent='ARMED · OFF AIR';$('#smartTalkHint').textContent='Smart Talk will engage when the live program is on air.';return;}
  if(isMuted('mic')){$('#smartTalkState').textContent='PAUSED · MIC MUTED';$('#smartTalkHint').textContent='Manual MIC mute has priority.';return;}
  if(isMuted('music')){$('#smartTalkState').textContent='PAUSED · MUSIC MUTED';$('#smartTalkHint').textContent='Manual MUSIC mute has priority.';return;}
  $('#smartTalkState').textContent='LISTENING';$('#smartTalkHint').textContent='Waiting for meaningful microphone activity.';
}
function engageSmartDuck(){
  if(!smartEnabled||smartDucking||sceneApplying||isMuted('mic')||isMuted('music')||!document.body.classList.contains('live-broadcasting'))return;
  smartDucking=true;rampDuckGain(dbToGain(-Number(duckDepth.value)),120);updateSmartVisual();
}
function releaseSmartDuck(ms=Number(recovery.value),force=false){
  if(!smartDucking&&!force){updateSmartVisual();return;}
  smartDucking=false;rampDuckGain(1,ms);voiceSince=silenceSince=0;updateSmartVisual();
}
function micActivity(){
  const bars=$$('#micMeter i'),lit=bars.filter(i=>i.className==='lit'||i.className==='hot'||i.className==='peak').length;
  return bars.length?lit/bars.length:0;
}
function activityLoop(now){
  if(now-lastActivityCheck>50){
    lastActivityCheck=now;
    const activity=micActivity();
    const approxRms=activity*.085;
    if(!smartDucking&&approxRms<.035)noiseFloor=noiseFloor*.97+approxRms*.03;
    const attack=Math.max(.022,noiseFloor*2.6),release=Math.max(.012,attack*.55);
    const eligible=smartEnabled&&!sceneApplying&&!isMuted('mic')&&!isMuted('music')&&document.body.classList.contains('live-broadcasting');
    if(!eligible){if(smartDucking)releaseSmartDuck(140,true);voiceSince=silenceSince=0;updateSmartVisual();}
    else if(approxRms>=attack){
      silenceSince=0;if(!voiceSince)voiceSince=now;if(!smartDucking&&now-voiceSince>=100)engageSmartDuck();
    }else if(approxRms<=release){
      voiceSince=0;if(!silenceSince)silenceSince=now;if(smartDucking&&now-silenceSince>=240)releaseSmartDuck();
    }
  }
  requestAnimationFrame(activityLoop);
}
requestAnimationFrame(activityLoop);

smartToggle.addEventListener('click',()=>{smartEnabled=!smartEnabled;if(!smartEnabled)releaseSmartDuck(120,true);else updateSmartVisual()});
duckDepth.addEventListener('input',()=>{$('#smartDuckDepthValue').textContent=`−${duckDepth.value} dB`;if(smartDucking)rampDuckGain(dbToGain(-Number(duckDepth.value)),120);updateSmartVisual()});
recovery.addEventListener('input',()=>{$('#smartRecoveryValue').textContent=`${(Number(recovery.value)/1000).toFixed(1)} s`});

window.PARAISO_BROADCAST_TOOLS={
  applyScene,
  get activeScene(){return activeScene},
  get smartTalkEnabled(){return smartEnabled},
  get smartTalkDucking(){return smartDucking},
  setSmartTalk(enabled){smartEnabled=!!enabled;if(!smartEnabled)releaseSmartDuck(120,true);updateSmartVisual()},
  scenes:Object.keys(SCENES)
};

updateSceneVisual();updateSmartVisual();
})();
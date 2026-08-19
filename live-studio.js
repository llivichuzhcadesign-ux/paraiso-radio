(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const liveView=$('#view-live');
if(!liveView)return;

let micStream=null,audioContext=null,analyser=null,rafId=null,micReady=false,signalReady=false,selectedShow='',monitorOn=false;

const workflow=document.createElement('div');
workflow.className='live-workflow-shell';
workflow.innerHTML=`
  <section class="live-preflight" id="livePreflight">
    <div class="live-preflight-head">
      <div><p class="eyebrow">PRE-FLIGHT</p><h2>Prepare the live feed.</h2><p>Choose your show and microphone, test the input, then complete the safety check before taking over from AutoDJ.</p></div>
      <div class="preflight-step" id="preflightStep"><i></i><span>NOT READY</span></div>
    </div>
    <div class="preflight-grid">
      <div class="preflight-panel">
        <h3>Source & show</h3>
        <div class="preflight-fields">
          <label class="live-field">Show<select id="liveShowSelect"><option value="">Select a show…</option><option>Sebastián Live</option><option>Viernes en Paraíso</option><option>Guest DJ Session</option><option>Special Broadcast</option></select></label>
          <label class="live-field">Microphone<select id="micDeviceSelect"><option value="">Default microphone</option></select></label>
        </div>
        <div class="mic-test-row"><button class="mic-test-button" id="micTestButton">Test microphone</button><button class="monitor-button" id="monitorButton" aria-pressed="false">Headphone monitor: Off</button></div>
        <div class="input-meter-wrap"><span>INPUT</span><div class="input-meter" id="inputMeter">${'<i></i>'.repeat(24)}</div><span id="inputDb">— dB</span></div>
        <p class="local-note">Microphone testing is local to this browser. Nothing is transmitted or recorded in this demo.</p>
        <div class="live-mic-error" id="micError"></div>
      </div>
      <div class="preflight-panel">
        <h3>Safety check</h3>
        <div class="check-grid">
          <div class="check-item" id="checkMic"><span class="check-icon">1</span><div><strong>Microphone</strong><small>Not connected</small></div></div>
          <div class="check-item" id="checkSignal"><span class="check-icon">2</span><div><strong>Input signal</strong><small>Waiting for test</small></div></div>
          <div class="check-item" id="checkShow"><span class="check-icon">3</span><div><strong>Show selected</strong><small>Choose a program</small></div></div>
          <div class="check-item ready" id="checkFallback"><span class="check-icon">✓</span><div><strong>AutoDJ fallback</strong><small>Ready to resume</small></div></div>
        </div>
      </div>
    </div>
    <div class="preflight-footer">
      <div class="preflight-status" id="preflightStatus"><i></i><span>Complete the checks above.</span></div>
      <button class="safe-go-button" id="safeGoButton" disabled>Review & Go On Air</button>
    </div>
  </section>

  <div class="live-ops-grid">
    <section class="live-ops-panel">
      <div class="live-ops-heading"><div><p class="eyebrow">NEXT ON DECK</p><h3>DJ queue</h3></div><small>Prepared for the live set</small></div>
      <div class="deck-list">
        <div class="deck-row"><span class="deck-number">01</span><div class="deck-copy"><strong>Fatalidad</strong><small>Julio Jaramillo • 3:38</small></div><button class="queue-action">Play next</button></div>
        <div class="deck-row"><span class="deck-number">02</span><div class="deck-copy"><strong>Guayaquil de Mis Amores</strong><small>Traditional Ecuador • 3:10</small></div><button class="queue-action">Play next</button></div>
        <div class="deck-row"><span class="deck-number">03</span><div class="deck-copy"><strong>Salsa de Queens</strong><small>Demo Orchestra • 4:12</small></div><button class="queue-action">Play next</button></div>
      </div>
    </section>
    <section class="live-ops-panel">
      <div class="live-ops-heading"><div><p class="eyebrow">LISTENER REQUESTS</p><h3>Incoming</h3></div><span class="request-tag">3 waiting</span></div>
      <div class="incoming-list">
        <div class="incoming-row"><span class="incoming-avatar">M</span><div class="incoming-copy"><strong>Maria</strong><small>Fatalidad • Queens</small></div><button class="request-action">Accept</button></div>
        <div class="incoming-row"><span class="incoming-avatar">C</span><div class="incoming-copy"><strong>Carlos</strong><small>Guayaquil de Mis Amores • Brooklyn</small></div><button class="request-action">Accept</button></div>
        <div class="incoming-row"><span class="incoming-avatar">A</span><div class="incoming-copy"><strong>Ana</strong><small>Nuestro Juramento • Cuenca</small></div><button class="request-action">Accept</button></div>
      </div>
    </section>
  </div>`;

liveView.insertBefore(workflow,liveView.firstChild);

const dialog=document.createElement('dialog');
dialog.className='live-confirm-dialog';
dialog.id='liveConfirmDialog';
dialog.innerHTML=`<form method="dialog"><div class="confirm-icon" id="confirmIcon">●</div><p class="eyebrow" id="confirmEyebrow">READY TO BROADCAST</p><h3 id="confirmTitle">Go on air?</h3><p id="confirmCopy">AutoDJ will hand control to this live feed.</p><div class="confirm-summary"><div><span>Show</span><strong id="confirmShow">—</strong></div><div><span>Microphone</span><strong id="confirmMic">—</strong></div><div><span>Input</span><strong id="confirmSignal">Ready</strong></div><div><span>Fallback</span><strong>AutoDJ ready</strong></div></div><div class="confirm-actions"><button class="confirm-cancel" value="cancel">Cancel</button><button class="confirm-onair" id="confirmOnAir" value="default" type="button">GO ON AIR</button></div></form>`;
document.body.appendChild(dialog);

const showSelect=$('#liveShowSelect'),micSelect=$('#micDeviceSelect'),testButton=$('#micTestButton'),monitorButton=$('#monitorButton'),safeGo=$('#safeGoButton'),legacyToggle=$('#liveToggle');

function setCheck(id,ready,detail){
  const el=$(id);if(!el)return;el.classList.toggle('ready',ready);el.querySelector('.check-icon').textContent=ready?'✓':el.dataset.num||el.querySelector('.check-icon').textContent;el.querySelector('small').textContent=detail;
}
function updateReadyState(){
  const ready=micReady&&signalReady&&!!selectedShow;
  setCheck('#checkMic',micReady,micReady?'Connected in browser':'Not connected');
  setCheck('#checkSignal',signalReady,signalReady?'Healthy local signal':'Waiting for test');
  setCheck('#checkShow',!!selectedShow,selectedShow||'Choose a program');
  const step=$('#preflightStep'),status=$('#preflightStatus');
  step.classList.toggle('ready',ready);step.querySelector('span').textContent=ready?'READY':'NOT READY';
  status.classList.toggle('ready',ready);status.querySelector('span').textContent=ready?'Pre-flight complete. Review before going on air.':'Complete the checks above.';
  if(!document.body.classList.contains('live-broadcasting')){safeGo.disabled=!ready;safeGo.classList.toggle('ready',ready);safeGo.classList.remove('end-live');safeGo.textContent='Review & Go On Air';}
}

async function enumerateMics(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const devices=await navigator.mediaDevices.enumerateDevices();
  const mics=devices.filter(d=>d.kind==='audioinput');
  const current=micSelect.value;
  micSelect.innerHTML='<option value="">Default microphone</option>'+mics.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Microphone ${i+1}`}</option>`).join('');
  if([...micSelect.options].some(o=>o.value===current))micSelect.value=current;
}

function stopMic(){
  cancelAnimationFrame(rafId);rafId=null;
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
  analyser=null;micReady=false;signalReady=false;testButton.classList.remove('testing');testButton.textContent='Test microphone';
  $$('#inputMeter i').forEach(i=>i.className='');$('#inputDb').textContent='— dB';updateReadyState();
}

async function startMicTest(){
  const err=$('#micError');err.classList.remove('show');err.textContent='';
  if(micStream){stopMic();return;}
  if(!navigator.mediaDevices?.getUserMedia){err.textContent='This browser does not expose microphone testing here.';err.classList.add('show');return;}
  try{
    const constraints=micSelect.value?{audio:{deviceId:{exact:micSelect.value}}}:{audio:true};
    micStream=await navigator.mediaDevices.getUserMedia(constraints);
    await enumerateMics();
    audioContext=new (window.AudioContext||window.webkitAudioContext)();
    analyser=audioContext.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.72;
    audioContext.createMediaStreamSource(micStream).connect(analyser);
    micReady=true;testButton.classList.add('testing');testButton.textContent='Stop mic test';
    const data=new Uint8Array(analyser.frequencyBinCount),bars=$$('#inputMeter i');let healthyFrames=0;
    const draw=()=>{
      analyser.getByteFrequencyData(data);
      const avg=data.reduce((a,b)=>a+b,0)/data.length;
      const normalized=Math.min(1,avg/90);const lit=Math.round(normalized*bars.length);
      bars.forEach((bar,i)=>{bar.className=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):''});
      const db=Math.round(-60+normalized*58);$('#inputDb').textContent=`${db} dB`;
      if(avg>3)healthyFrames++;if(healthyFrames>8&&!signalReady){signalReady=true;updateReadyState();}
      rafId=requestAnimationFrame(draw);
    };draw();updateReadyState();
  }catch(e){err.textContent=e?.name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access in the browser, then try again.':'Could not open that microphone. Try another input.';err.classList.add('show');stopMic();}
}

testButton.addEventListener('click',startMicTest);
micSelect.addEventListener('change',()=>{if(micStream){stopMic();startMicTest();}});
showSelect.addEventListener('change',()=>{selectedShow=showSelect.value;updateReadyState();});
monitorButton.addEventListener('click',()=>{monitorOn=!monitorOn;monitorButton.setAttribute('aria-pressed',String(monitorOn));monitorButton.textContent=`Headphone monitor: ${monitorOn?'On':'Off'}`;});

function openConfirm(end=false){
  const micLabel=micSelect.selectedOptions[0]?.textContent||'Default microphone';
  $('#confirmShow').textContent=selectedShow||'Live broadcast';$('#confirmMic').textContent=micLabel;
  $('#confirmEyebrow').textContent=end?'END LIVE BROADCAST':'READY TO BROADCAST';
  $('#confirmTitle').textContent=end?'Return to AutoDJ?':'Go on air?';
  $('#confirmCopy').textContent=end?'The live feed will end and AutoDJ will resume automatically.':'AutoDJ will hand control to this live feed. Your ON AIR state will be visible across the entire Studio.';
  $('#confirmIcon').textContent=end?'■':'●';
  const action=$('#confirmOnAir');action.textContent=end?'END BROADCAST':'GO ON AIR';action.classList.toggle('danger',end);action.dataset.mode=end?'end':'start';
  dialog.showModal();
}

safeGo.addEventListener('click',()=>openConfirm(document.body.classList.contains('live-broadcasting')));
$('#confirmOnAir').addEventListener('click',()=>{dialog.close();legacyToggle?.click();});

// Prevent Dashboard's one-click demo button from bypassing pre-flight.
$('#goLiveButton')?.addEventListener('click',e=>{
  if(document.body.classList.contains('live-broadcasting'))return;
  e.preventDefault();e.stopImmediatePropagation();
  document.querySelector('.nav-item[data-view="live"]')?.click();
  setTimeout(()=>$('#livePreflight')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
},true);

$$('.queue-action').forEach(btn=>btn.addEventListener('click',()=>{const active=$$('.queue-action.armed');active.forEach(b=>{b.classList.remove('armed');b.textContent='Play next'});btn.classList.add('armed');btn.textContent='Armed ✓';}));
$$('.request-action').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.add('accepted');btn.textContent='Queued ✓';btn.disabled=true;}));

const observer=new MutationObserver(()=>{
  const live=document.body.classList.contains('live-broadcasting');
  if(live){safeGo.disabled=false;safeGo.classList.remove('ready');safeGo.classList.add('end-live');safeGo.textContent='End Live Broadcast';showSelect.disabled=true;micSelect.disabled=true;$('#preflightStep').classList.add('ready');$('#preflightStep span').textContent='ON AIR';}
  else{showSelect.disabled=false;micSelect.disabled=false;updateReadyState();}
});
observer.observe(document.body,{attributes:true,attributeFilter:['class']});

window.addEventListener('beforeunload',()=>{if(micStream)micStream.getTracks().forEach(t=>t.stop());});
updateReadyState();
})();
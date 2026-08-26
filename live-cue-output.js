(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const outputSelect=$('#outputDeviceSelect');
if(!outputSelect||window.PARAISO_CUE_OUTPUT)return;

let monitorEl=null,monitorDest=null,monitorContext=null,lastSink='';

const outputField=outputSelect.closest('.ribbon-field');
const outputLabel=outputField?.querySelector(':scope > span');
if(outputLabel)outputLabel.textContent='HEADPHONES / CUE OUTPUT';

function audioApi(){return window.PARAISO_LIVE_AUDIO||null}
function outputName(){return outputSelect.selectedOptions?.[0]?.textContent||'System default output'}
function monitorDetail(){return $('#monitorDetail')}

function setDetail(text){
  const el=monitorDetail();
  if(el)el.textContent=text;
}

function cleanupMonitor(){
  try{monitorEl?.pause()}catch{}
  if(monitorEl){try{monitorEl.srcObject=null}catch{};monitorEl.remove()}
  try{monitorDest?.disconnect()}catch{}
  monitorEl=null;monitorDest=null;monitorContext=null;lastSink='';
}

function ensureMonitor(){
  const api=audioApi(),ctx=api?.context,cueBus=api?.cueBus;
  if(!ctx||!cueBus)return false;
  if(monitorEl&&monitorDest&&monitorContext===ctx)return true;

  cleanupMonitor();
  try{cueBus.disconnect()}catch{}

  monitorDest=ctx.createMediaStreamDestination();
  cueBus.connect(monitorDest);
  monitorContext=ctx;

  monitorEl=document.createElement('audio');
  monitorEl.autoplay=true;
  monitorEl.playsInline=true;
  monitorEl.volume=1;
  monitorEl.setAttribute('aria-hidden','true');
  monitorEl.style.display='none';
  monitorEl.srcObject=monitorDest.stream;
  document.body.appendChild(monitorEl);
  return true;
}

function startMonitorPlayback(){
  if(!monitorEl)return;
  const p=monitorEl.play();
  if(p?.catch)p.catch(()=>{
    setDetail('CUE output is ready but browser playback is paused. Tap a CUE button again to start headphone monitoring.');
  });
}

async function applySink(){
  if(!ensureMonitor())return false;
  const requested=outputSelect.value||'';
  const label=outputName();

  if(typeof monitorEl.setSinkId==='function'){
    try{
      await monitorEl.setSinkId(requested||'default');
      lastSink=requested||'default';
      startMonitorPlayback();
      setDetail(`Headphone CUE output: ${label} · pre-fader / pre-mute.`);
      return true;
    }catch{
      lastSink='default';
      try{await monitorEl.setSinkId('default')}catch{}
      startMonitorPlayback();
      setDetail(`Could not route CUE to ${label}. Using the system default audio output.`);
      return false;
    }
  }

  lastSink='default';
  startMonitorPlayback();
  setDetail(requested?`This browser cannot select a separate headphone device. CUE is using the system default output.`:`CUE is using the system default audio output.`);
  return !requested;
}

/* Stop the legacy handler from moving the entire AudioContext to the headphone device.
   Only the dedicated CUE monitor should follow this selector. */
outputSelect.addEventListener('change',e=>{
  e.stopImmediatePropagation();
  applySink();
},true);

/* The core CUE handler runs on the button first. Once it has created/resumed the
   AudioContext, this bubbling listener makes sure the dedicated monitor is alive. */
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-channel-cue]');
  if(!btn)return;
  if(ensureMonitor()){
    applySink();
    startMonitorPlayback();
    setTimeout(()=>{
      const active=$$('[data-channel-cue].active').map(b=>b.dataset.channelCue?.toUpperCase()).filter(Boolean);
      if(active.length)setDetail(`CUE: ${active.join(' + ')} → ${outputName()} · ${$('#cueVolume')?.value||85}% · pre-fader / pre-mute.`);
      else setDetail(`Headphone CUE output: ${outputName()} · no channels selected.`);
    },0);
  }else{
    setTimeout(()=>{
      if(ensureMonitor()){applySink();startMonitorPlayback()}
    },0);
  }
});

/* If the AudioContext is created by microphone connection before any CUE click,
   prepare the monitor lazily once the Live view becomes active. */
const liveView=$('#view-live');
if(liveView){
  new MutationObserver(()=>{
    if(liveView.classList.contains('active'))setTimeout(()=>{if(ensureMonitor())applySink()},250);
  }).observe(liveView,{attributes:true,attributeFilter:['class']});
}

window.addEventListener('beforeunload',cleanupMonitor);

window.PARAISO_CUE_OUTPUT={
  refresh:()=>{if(ensureMonitor())return applySink();return false},
  get element(){return monitorEl},
  get sinkId(){return lastSink},
  get outputLabel(){return outputName()}
};
})();
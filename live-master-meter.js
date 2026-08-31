(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const audio=window.PARAISO_LIVE_AUDIO;
const masterMeter=$('#masterMeter');
if(!audio||!masterMeter||window.PARAISO_MASTER_METER)return;

const SOURCES=['mic','music','carts','requests'];
let raf=0,observer=null,lastRms=0;

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function isReal(id){
  if(id==='mic')return true;
  return $(`.channel-strip[data-channel="${id}"] .channel-source-badge`)?.classList.contains('real')||false;
}
function meterNorm(id){
  const bars=$$(`#${id}Meter i`);
  if(!bars.length||!isReal(id))return 0;
  const lit=bars.filter(b=>b.classList.contains('lit')||b.classList.contains('hot')||b.classList.contains('peak')).length;
  return clamp(lit/bars.length);
}
function normToRms(norm){
  if(norm<=0)return 0;
  const db=norm*60-60;
  return Math.pow(10,db/20);
}
function channelContribution(id){
  if(audio.getChannelMuted?.(id))return 0;
  const level=clamp(Number(audio.getChannelLevel?.(id)||0)/100);
  if(level<=0)return 0;
  return normToRms(meterNorm(id))*level;
}
function aggregateProgramRms(){
  if(audio.getChannelMuted?.('master'))return 0;
  const masterLevel=clamp(Number(audio.getChannelLevel?.('master')||0)/100);
  if(masterLevel<=0)return 0;

  let energy=0;
  for(const id of SOURCES){
    const rms=channelContribution(id);
    energy+=rms*rms;
  }
  return Math.sqrt(energy)*masterLevel;
}
function rmsToNorm(rms){
  if(!(rms>0))return 0;
  const db=Math.max(-60,20*Math.log10(Math.max(rms,.001)));
  return clamp((db+60)/60);
}
function paint(norm){
  const bars=$$('#masterMeter i'),lit=Math.round(clamp(norm)*bars.length);
  bars.forEach((bar,i)=>{
    const next=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):'';
    if(bar.className!==next)bar.className=next;
  });
}
function render(){
  raf=0;
  /* MASTER is a post-fader/post-mute program meter.
     It is deliberately derived only from channels that are actually on program.
     This prevents analyser smoothing/residual signal from leaving the green meter
     lit after MUSIC/MIC/CARTS/REQUESTS or MASTER are muted. */
  lastRms=aggregateProgramRms();
  paint(rmsToNorm(lastRms));
}
function schedule(){if(!raf)raf=requestAnimationFrame(render)}

observer=new MutationObserver(schedule);
for(const id of SOURCES){
  const meter=$(`#${id}Meter`);
  if(meter)observer.observe(meter,{subtree:true,attributes:true,attributeFilter:['class']});
}

for(const id of [...SOURCES,'master']){
  $(`#${id}Level`)?.addEventListener('input',schedule);
  $(`[data-channel-mute="${id}"]`)?.addEventListener('click',()=>setTimeout(schedule,0));
}
document.addEventListener('paraiso:channel-level',schedule);
document.addEventListener('paraiso:channel-mute',schedule);
document.addEventListener('paraiso:live-state',schedule);

window.PARAISO_MASTER_METER={
  refresh:schedule,
  get rms(){return lastRms},
  get contributions(){return Object.fromEntries(SOURCES.map(id=>[id,channelContribution(id)]))}
};

schedule();
})();
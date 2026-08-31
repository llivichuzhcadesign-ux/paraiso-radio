(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const audio=window.PARAISO_LIVE_AUDIO;
const masterMeter=$('#masterMeter');
if(!audio||!masterMeter||window.PARAISO_MASTER_METER)return;
const SOURCES=['mic','music','carts','requests'];
let raf=0,lastRms=0;
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function isReal(id){if(id==='mic')return true;return $(`.channel-strip[data-channel="${id}"] .channel-source-badge`)?.classList.contains('real')||false}
function meterNorm(id){const bars=$$(`#${id}Meter i`);if(!bars.length||!isReal(id))return 0;const lit=bars.filter(b=>b.classList.contains('lit')||b.classList.contains('hot')||b.classList.contains('peak')).length;return clamp(lit/bars.length)}
function normToRms(norm){if(norm<=0)return 0;return Math.pow(10,(norm*60-60)/20)}
function channelContribution(id){if(audio.getChannelMuted?.(id))return 0;const level=clamp(Number(audio.getChannelLevel?.(id)||0)/100);if(level<=0)return 0;return normToRms(meterNorm(id))*level}
function aggregateProgramRms(){if(audio.getChannelMuted?.('master'))return 0;const masterLevel=clamp(Number(audio.getChannelLevel?.('master')||0)/100);if(masterLevel<=0)return 0;let energy=0;for(const id of SOURCES){const rms=channelContribution(id);energy+=rms*rms}return Math.sqrt(energy)*masterLevel}
function rmsToNorm(rms){if(!(rms>0))return 0;const db=Math.max(-60,20*Math.log10(Math.max(rms,.001)));return clamp((db+60)/60)}
function paint(norm){const bars=$$('#masterMeter i'),lit=Math.round(clamp(norm)*bars.length);bars.forEach((bar,i)=>{const next=i<lit?(i>bars.length*.88?'peak':i>bars.length*.72?'hot':'lit'):'';if(bar.className!==next)bar.className=next})}
function render(){lastRms=aggregateProgramRms();paint(rmsToNorm(lastRms));raf=requestAnimationFrame(render)}
window.PARAISO_MASTER_METER={refresh:()=>{},get rms(){return lastRms},get contributions(){return Object.fromEntries(SOURCES.map(id=>[id,channelContribution(id)]))}};
raf=requestAnimationFrame(render);
window.addEventListener('beforeunload',()=>{if(raf)cancelAnimationFrame(raf)});
})();
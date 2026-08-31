(()=>{
const $=s=>document.querySelector(s);
const audio=window.PARAISO_LIVE_AUDIO;
const ribbon=$('.setup-ribbon'),micField=$('#micDeviceSelect')?.closest('.ribbon-field');
if(!audio||!ribbon||!micField||$('#musicDeviceSelect'))return;

let musicStream=null,musicSource=null;
let selectedDeviceLabel='';

const field=document.createElement('label');
field.className='ribbon-field music-input-field';
field.innerHTML=`
  <span>MUSIC INPUT</span>
  <div class="music-input-row">
    <select id="musicDeviceSelect" aria-label="Music audio input">
      <option value="">Choose virtual audio…</option>
    </select>
    <button id="musicInputButton" class="music-input-button" type="button">CONNECT</button>
  </div>
  <small class="music-input-status" id="musicInputStatus">Select a virtual audio input such as BlackHole 2ch or Radio Out. MIDI devices do not carry audio.</small>`;
micField.insertAdjacentElement('afterend',field);
ribbon.classList.add('has-music-input');

const select=$('#musicDeviceSelect'),button=$('#musicInputButton'),status=$('#musicInputStatus');
function setStatus(text,state='idle'){status.textContent=text;field.dataset.state=state}
function likelyVirtual(label=''){return /blackhole|radio\s*out|loopback|soundflower|virtual|vb[- ]?cable/i.test(label)}

async function refreshDevices(){
  if(!navigator.mediaDevices?.enumerateDevices){setStatus('Audio input enumeration is not supported in this browser.','error');return}
  const current=select.value;
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const inputs=devices.filter(d=>d.kind==='audioinput');
    select.innerHTML='<option value="">Choose virtual audio…</option>'+inputs.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Audio input ${i+1}`}</option>`).join('');
    if(current&&inputs.some(d=>d.deviceId===current))select.value=current;
    else{
      const preferred=inputs.find(d=>likelyVirtual(d.label));
      if(preferred){select.value=preferred.deviceId;setStatus(`Detected ${preferred.label}. Ready to connect.`,'ready')}
      else setStatus('Select BlackHole 2ch, Radio Out, Loopback, or another virtual audio input.','idle');
    }
  }catch{setStatus('Could not read audio input devices. Check browser microphone permission.','error')}
}

function cleanupLocal(){
  try{musicSource?.disconnect()}catch{}
  if(musicStream)musicStream.getTracks().forEach(t=>t.stop());
  musicStream=musicSource=null;selectedDeviceLabel='';
}
function disconnectMusic({quiet=false}={}){
  if(musicStream||musicSource){try{audio.detachSource('music')}catch{};cleanupLocal()}
  button.textContent='CONNECT';button.classList.remove('connected');button.disabled=false;select.disabled=false;field.classList.remove('connected');
  if(!quiet)setStatus('Disconnected. Select a virtual audio input to reconnect.','idle');
}
async function connectMusic(){
  const deviceId=select.value;
  if(!deviceId){setStatus('Choose a virtual audio input first.','error');return}
  if(!navigator.mediaDevices?.getUserMedia){setStatus('Audio capture is unavailable in this browser.','error');return}
  const ctx=audio.ensureContext?.()||audio.context;
  if(!ctx){setStatus('Audio engine could not start. Tap Live Studio once and try again.','error');return}

  disconnectMusic({quiet:true});
  button.disabled=true;button.textContent='CONNECTING…';select.disabled=true;setStatus('Opening real MUSIC input…','connecting');
  try{
    musicStream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:deviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}},video:false});
    const track=musicStream.getAudioTracks()[0];
    selectedDeviceLabel=track?.label||select.selectedOptions[0]?.textContent||'Virtual audio';
    musicSource=ctx.createMediaStreamSource(musicStream);
    const attached=audio.attachSource('music',musicSource);
    if(!attached)throw new Error('Mixer rejected MUSIC source');

    button.textContent='DISCONNECT';button.classList.add('connected');field.classList.add('connected');
    setStatus(`REAL MUSIC · ${selectedDeviceLabel} · MUSIC fader, CUE, MASTER and Smart Talk are active.`,'connected');
    track?.addEventListener('ended',()=>disconnectMusic());
  }catch(e){
    cleanupLocal();select.disabled=false;button.textContent='CONNECT';
    const msg=e?.name==='NotAllowedError'?'Music input permission was blocked. Allow audio input access in the browser.':e?.name==='NotFoundError'?'That audio device is no longer available.':'Could not connect that MUSIC input. Check the virtual audio device and try again.';
    setStatus(msg,'error');
  }finally{button.disabled=false}
}

button.addEventListener('click',()=>musicStream?disconnectMusic():connectMusic());
select.addEventListener('change',()=>{
  if(musicStream)disconnectMusic({quiet:true});
  const label=select.selectedOptions[0]?.textContent||'';
  if(select.value)setStatus(likelyVirtual(label)?`${label} selected. Ready to connect.`:`${label} selected. Make sure this is the audio feed you intend to broadcast.`,'ready');
  else setStatus('Select a virtual audio input such as BlackHole 2ch or Radio Out.','idle');
});

navigator.mediaDevices?.addEventListener?.('devicechange',refreshDevices);
window.addEventListener('beforeunload',cleanupLocal);
window.PARAISO_MUSIC_INPUT={connect:connectMusic,disconnect:disconnectMusic,refreshDevices,get connected(){return !!musicStream},get deviceLabel(){return selectedDeviceLabel}};
setTimeout(refreshDevices,350);
})();
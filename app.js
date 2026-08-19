(()=>{
const c=window.RADIO_CONFIG||{},$=id=>document.getElementById(id);
const LIVE_STORAGE_KEY='paraiso.radio.liveState';
const e={audio:$('radioAudio'),play:$('playButton'),icon:$('playIcon'),heroPlay:$('heroPlayButton'),heroIcon:$('heroPlayIcon'),mobilePlay:$('mobilePlayButton'),mobileIcon:$('mobilePlayIcon'),mute:$('muteButton'),vol:$('volumeSlider'),title:$('songTitle'),artist:$('artistName'),mobileTitle:$('mobileTitle'),mobileArtist:$('mobileArtist'),cover:$('coverArt'),fallback:$('coverFallback'),fill:$('progressFill'),elapsed:$('elapsedTime'),duration:$('durationTime'),pill:$('signalPill'),signal:$('signalText'),host:$('hostName'),show:$('showName'),listeners:$('listenerCount'),history:$('historyList'),refresh:$('refreshButton'),status:$('playerStatus'),ny:$('nyClock'),ec:$('ecClock'),dayTabs:$('dayTabs'),schedule:$('scheduleList'),upNextShow:$('upNextShow'),upNextTime:$('upNextTime'),requestButton:$('requestButton'),requestModal:$('requestModal'),requestForm:$('requestForm'),requestFeedback:$('requestFeedback')};
let stream=c.streamUrl||'',playing=false,demo=0;
const tracks=[['Nuestro Juramento','Julio Jaramillo',203],['Guayaquil de Mis Amores','Traditional Ecuador',190],['Fatalidad','Julio Jaramillo',218],['Llorando se fue','Los Kjarkas',240],['El Aguacate','Julio Jaramillo',225]];
const schedule={Monday:[['7:00 AM','Despierta Ecuador','Pasillos, boleros & soft mornings','MORNINGS'],['12:00 PM','Cumbia de Oro','Ecuadorian & Latin cumbia classics','CUMBIA'],['4:00 PM','Salsa NY','Classic salsa from Ecuador to New York','SALSA'],['9:00 PM','Después de Medianoche','Romance, deep cuts and late radio','LATE NIGHT']],Tuesday:[['7:00 AM','Despierta Ecuador','Pasillos, boleros & soft mornings','MORNINGS'],['12:00 PM','Cumbia de Oro','Golden cumbia all afternoon','CUMBIA'],['5:00 PM','Ecuador en Nueva York','Stories and music between two homes','CULTURE'],['9:00 PM','Después de Medianoche','Romance, deep cuts and late radio','LATE NIGHT']],Wednesday:[['7:00 AM','Despierta Ecuador','Pasillos, boleros & soft mornings','MORNINGS'],['12:00 PM','Cumbia de Oro','Ecuadorian & Latin cumbia classics','CUMBIA'],['7:00 PM','Sebastián Live','Live host, guests and community','LIVE'],['10:00 PM','Después de Medianoche','Romance and nocturnal radio','LATE NIGHT']],Thursday:[['7:00 AM','Despierta Ecuador','Pasillos, boleros & soft mornings','MORNINGS'],['12:00 PM','Cumbia de Oro','Golden cumbia all afternoon','CUMBIA'],['4:00 PM','Salsa NY','Classic salsa from Ecuador to New York','SALSA'],['9:00 PM','Después de Medianoche','Romance, deep cuts and late radio','LATE NIGHT']],Friday:[['7:00 AM','Despierta Ecuador','Pasillos, boleros & soft mornings','MORNINGS'],['12:00 PM','Cumbia de Oro','Friday cumbia session','CUMBIA'],['8:00 PM','Viernes en Paraíso','Live weekend kickoff','LIVE'],['10:00 PM','Después de Medianoche','Late-night requests and romance','LATE NIGHT']],Saturday:[['9:00 AM','Sabado Familiar','Music for home, coffee and family','WEEKEND'],['1:00 PM','Cumbia de Oro','Long-form weekend cumbia','CUMBIA'],['7:00 PM','Paraiso Mix','DJ mix and party classics','DJ'],['11:00 PM','Después de Medianoche','Deep cuts after dark','LATE NIGHT']],Sunday:[['9:00 AM','Domingo de Recuerdos','Nostalgic Ecuadorian favorites','SUNDAY'],['1:00 PM','Almuerzo en Casa','Easy listening for Sunday lunch','SUNDAY'],['6:00 PM','Ecuador en Nueva York','Community stories and classics','CULTURE'],['9:00 PM','Después de Medianoche','A quiet close to the week','LATE NIGHT']]};

document.title=`${c.stationName||'PARAÍSO'} — Live Radio`;
const fmt=s=>`${Math.floor((s||0)/60)}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;

function syncPlayUi(){
  const icon=playing?'❚❚':'▶',label=playing?'Pause':'Listen live';
  e.icon.textContent=icon;e.heroIcon.textContent=icon;e.mobileIcon.textContent=icon;
  e.heroPlay.childNodes[e.heroPlay.childNodes.length-1].textContent=` ${label}`;
  e.play.setAttribute('aria-label',playing?'Pause live radio':'Play live radio');
  e.mobilePlay.setAttribute('aria-label',playing?'Pause live radio':'Play live radio');
}

function history(items=[]){
  e.history.innerHTML='';
  items.slice(0,5).forEach((x,i)=>{
    const s=x.song||x,li=document.createElement('li');
    li.className='history-item';
    li.innerHTML=`<div class="history-cover">P</div><div><p class="history-title"></p><p class="history-artist"></p></div><span class="history-time"></span>`;
    li.querySelector('.history-title').textContent=s.title||'Unknown title';
    li.querySelector('.history-artist').textContent=s.artist||c.stationName||'PARAÍSO';
    li.querySelector('.history-time').textContent=`${3+i*4} min ago`;
    e.history.appendChild(li);
  });
}

function setCoverArt(url,title=''){
  if(url){
    e.cover.src=url;e.cover.alt=title?`${title} cover art`:'Now playing cover art';
    e.cover.classList.remove('hidden');e.fallback.classList.add('hidden');
  }else{
    e.cover.removeAttribute('src');e.cover.alt='';
    e.cover.classList.add('hidden');e.fallback.classList.remove('hidden');
  }
}

function render(n){
  const s=n.now_playing?.song||{},l=n.live||{},d=Number(n.now_playing?.duration||0),a=Number(n.now_playing?.elapsed||0);
  e.title.textContent=s.title||'Live Radio';e.artist.textContent=s.artist||c.stationName||'PARAÍSO';
  e.mobileTitle.textContent=s.title||'Live Radio';e.mobileArtist.textContent=s.artist||c.stationName||'PARAÍSO';
  e.elapsed.textContent=fmt(a);e.duration.textContent=fmt(d);e.fill.style.width=`${d?Math.min(100,a/d*100):100}%`;
  const live=!!l.is_live;
  e.pill.classList.toggle('live',live);e.signal.textContent=live?'LIVE DJ':'AUTO DJ';
  e.host.textContent=live?(l.streamer_name||'Live DJ'):'AutoDJ';
  e.show.textContent=live?(l.show_name||'Live broadcast'):'Continuous music';
  e.listeners.textContent=n.listeners?.current??'—';
  setCoverArt(s.art||s.art_url||n.now_playing?.song?.art,e.title.textContent);
  stream=c.streamUrl||n.station?.listen_url||n.mounts?.[0]?.url||stream;
  history(n.song_history||[]);
}

function readStudioDemoState(){
  try{return JSON.parse(localStorage.getItem(LIVE_STORAGE_KEY)||'null')}catch{return null}
}

function demoData(){
  const t=tracks[demo%tracks.length],rest=tracks.filter((_,i)=>i!==demo%tracks.length).map(x=>({song:{title:x[0],artist:x[1]}}));
  const studio=readStudioDemoState(),live=!!studio?.isLive;
  render({station:{listen_url:''},listeners:{current:(live?52:24)+(demo*3)%12},live:{is_live:live,streamer_name:live?(studio.streamerName||'Sebastián'):'',show_name:live?(studio.show||'Live broadcast'):''},now_playing:{elapsed:67+(demo*17)%80,duration:t[2],song:{title:t[0],artist:t[1]}},song_history:rest});
  e.status.textContent=live?'Demo mode — Live Studio is ON AIR':'Demo mode — interface only';
}

async function refresh(){
  if(c.demoMode)return demoData();
  const b=String(c.azuracastBaseUrl||'').replace(/\/+$/,''),s=encodeURIComponent(c.stationShortcode||'');
  if(!b||!s){e.status.textContent='Add AzuraCast settings in config.js';return}
  try{
    const r=await fetch(`${b}/api/nowplaying/${s}`,{cache:'no-store'});
    if(!r.ok)throw 0;
    render(await r.json());e.status.textContent=playing?'Playing live':'Ready';
  }catch{e.status.textContent='Could not reach the station'}
}

async function toggle(){
  if(playing){e.audio.pause();playing=false;syncPlayUi();e.status.textContent='Paused';return}
  if(c.demoMode&&!stream){e.status.textContent='Demo mode — audio will activate when the broadcast server is connected';return}
  if(!stream)await refresh();
  if(!stream)return e.status.textContent='No stream URL available yet';
  try{e.audio.src=stream;await e.audio.play();playing=true;syncPlayUi();e.status.textContent='Playing live'}
  catch{e.status.textContent='Stream could not connect'}
}

function clocks(){
  const now=new Date(),f=(zone)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(now);
  e.ny.textContent=f('America/New_York');e.ec.textContent=f('America/Guayaquil');
}

function renderSchedule(day){
  [...e.dayTabs.children].forEach(x=>x.classList.toggle('active',x.dataset.day===day));
  e.schedule.innerHTML='';
  (schedule[day]||[]).forEach(([time,title,desc,tag])=>{
    const row=document.createElement('article');row.className='schedule-row';
    row.innerHTML=`<time>${time}</time><div><h3></h3><p></p></div><span class="tag"></span>`;
    row.querySelector('h3').textContent=title;row.querySelector('p').textContent=desc;row.querySelector('.tag').textContent=tag;
    e.schedule.appendChild(row);
  });
  const next=(schedule[day]||[])[1]||(schedule[day]||[])[0];
  if(next){e.upNextShow.textContent=next[1];e.upNextTime.textContent=`${next[0]} ET`}
}

function initSchedule(){
  Object.keys(schedule).forEach(day=>{
    const b=document.createElement('button');b.className='day-tab';b.type='button';b.role='tab';b.dataset.day=day;b.textContent=day.slice(0,3);
    b.addEventListener('click',()=>renderSchedule(day));e.dayTabs.appendChild(b);
  });
  const today=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long'}).format(new Date());
  renderSchedule(schedule[today]?today:'Monday');
}

[e.play,e.heroPlay,e.mobilePlay].forEach(x=>x.addEventListener('click',toggle));
e.vol.addEventListener('input',x=>{e.audio.volume=Number(x.target.value)});
e.mute.addEventListener('click',()=>{e.audio.muted=!e.audio.muted});
e.refresh.addEventListener('click',()=>{if(c.demoMode)demo++;refresh()});
e.requestButton.addEventListener('click',()=>{e.requestFeedback.textContent='';e.requestModal.showModal()});
e.requestForm.addEventListener('submit',ev=>{
  ev.preventDefault();const song=$('requestSong').value.trim(),artist=$('requestArtist').value.trim();if(!song||!artist)return;
  e.requestFeedback.textContent=`Demo request saved: ${song} — ${artist}`;setTimeout(()=>e.requestModal.close(),1200);
});
window.addEventListener('storage',ev=>{if(c.demoMode&&ev.key===LIVE_STORAGE_KEY)refresh()});
e.audio.volume=Number(e.vol.value);clocks();setInterval(clocks,30000);initSchedule();refresh();syncPlayUi();
setInterval(refresh,Math.max(5000,Number(c.refreshMs||15000)));
})();
(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const views={dashboard:'Dashboard',live:'Live Studio',library:'Library',schedule:'Schedule',djs:'DJs & Hosts',analytics:'Analytics',settings:'Settings'};

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  $$('.nav-item').forEach(b=>{
    const active=b.dataset.view===name;
    b.classList.toggle('active',active);
    b.setAttribute('aria-current',active?'page':'false');
  });
  $('#viewTitle').textContent=views[name]||'PARAÍSO Studio';
  document.querySelector('.sidebar')?.classList.remove('open');
}
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.jump)));
$('#menuButton')?.addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('open'));

function pulseButton(btn,label,kind='success',ms=1300){
  if(!btn)return;
  const original=btn.dataset.originalLabel||btn.textContent;
  btn.dataset.originalLabel=original;
  btn.classList.remove('state-success','state-warning','state-danger','state-loading');
  btn.classList.add(`state-${kind}`);
  btn.textContent=label;
  btn.disabled=true;
  setTimeout(()=>{
    btn.classList.remove(`state-${kind}`);
    btn.textContent=original;
    btn.disabled=false;
  },ms);
}
function setToggle(btn,on,onLabel,offLabel,kind='active'){
  if(!btn)return;
  btn.classList.toggle(`state-${kind}`,on);
  btn.setAttribute('aria-pressed',String(on));
  btn.textContent=on?onLabel:offLabel;
}

let playing=true;
$('#dashPlay')?.addEventListener('click',e=>{
  playing=!playing;
  const btn=e.currentTarget;
  btn.textContent=playing?'❚❚':'▶';
  btn.classList.toggle('state-active',!playing);
  btn.setAttribute('aria-label',playing?'Pause AutoDJ':'Resume AutoDJ');
});

const demoTracks=[
 ['Fatalidad','Julio Jaramillo','3:38'],
 ['Guayaquil de Mis Amores','Traditional Ecuador','3:10'],
 ['Latin Evening','PARAÍSO Radio','4:00'],
 ['Ecuador en Nueva York','PARAÍSO','3:45'],
 ['Nuestro Juramento','Julio Jaramillo','3:23']
];
let trackIndex=0;
$('#skipButton')?.addEventListener('click',e=>{
  const btn=e.currentTarget;
  btn.classList.add('state-loading');btn.textContent='Skipping…';btn.disabled=true;
  setTimeout(()=>{
    trackIndex=(trackIndex+1)%demoTracks.length;
    const t=demoTracks[trackIndex];
    $('#dashTrackTitle').textContent=t[0];$('#dashTrackArtist').textContent=t[1];
    $('#trackElapsed').textContent='0:00';$('#trackDuration').textContent=t[2];$('#trackProgress').style.width='2%';
    btn.classList.remove('state-loading');btn.textContent='Skipped ✓';btn.classList.add('state-success');
    setTimeout(()=>{btn.classList.remove('state-success');btn.textContent='Skip track →';btn.disabled=false},900);
  },550);
});

$$('.queue-button').forEach(btn=>btn.addEventListener('click',()=>{
  btn.textContent='Queued ✓';btn.classList.add('state-success');btn.disabled=true;
}));

let isLive=false;
function setLive(next){
  isLive=next;
  $('#modeChip').textContent=isLive?'LIVE':'AUTO DJ';
  $('#modeChip').classList.toggle('is-live',isLive);
  $('#liveStateTitle').textContent=isLive?'You are live':'Ready to broadcast';
  const liveToggle=$('#liveToggle'),go=$('#goLiveButton');
  liveToggle.textContent=isLive?'End Live Broadcast':'Start Live Broadcast';
  liveToggle.classList.toggle('state-danger',isLive);
  go.textContent=isLive?'● Live Now':'Go Live';go.classList.toggle('state-live',isLive);
  $('#micVisual').classList.toggle('active',isLive);
  document.querySelector('.live-dot').style.background=isLive?'#ff5f62':'#54d68a';
}
$('#goLiveButton')?.addEventListener('click',()=>{showView('live');if(!isLive)setLive(true)});
$('#liveToggle')?.addEventListener('click',()=>setLive(!isLive));

let micMuted=false;
$('#micMute')?.addEventListener('click',e=>{
  micMuted=!micMuted;
  setToggle(e.currentTarget,micMuted,'Mic muted','Mute mic','warning');
  $('#micVisual').style.opacity=micMuted?'.22':'1';
});
[['#micLevel','#micValue'],['#musicLevel','#musicValue'],['#masterLevel','#masterValue']].forEach(([a,b])=>$(a)?.addEventListener('input',e=>$(b).textContent=`${e.target.value}%`));

setInterval(()=>{
  const base=isLive?52:47,n=base+Math.floor(Math.random()*7)-3;
  $('#listenersNow').textContent=n;$('#liveListeners').textContent=n;
},4500);

// ----- Library / playlists demo -----
const libraryTracks=[
 {id:1,title:'Nuestro Juramento',artist:'Julio Jaramillo',genre:'Bolero',length:'3:23',last:'Today',playlists:['Boleros','Románticas']},
 {id:2,title:'Fatalidad',artist:'Julio Jaramillo',genre:'Bolero',length:'3:38',last:'Today',playlists:['Boleros']},
 {id:3,title:'Guayaquil de Mis Amores',artist:'Traditional Ecuador',genre:'Ecuador',length:'3:10',last:'Yesterday',playlists:['Ecuador Esencial']},
 {id:4,title:'Ecuador en Nueva York',artist:'PARAÍSO',genre:'Station',length:'3:45',last:'Yesterday',playlists:['Station IDs']},
 {id:5,title:'Cumbia Chonera',artist:'Demo Artist',genre:'Cumbia',length:'3:31',last:'2 days ago',playlists:['Cumbia de Oro']},
 {id:6,title:'A Mi Lindo Ecuador',artist:'Demo Artist',genre:'Ecuador',length:'3:18',last:'2 days ago',playlists:['Ecuador Esencial']},
 {id:7,title:'Salsa de Queens',artist:'Demo Orchestra',genre:'Salsa',length:'4:12',last:'3 days ago',playlists:['Salsa NY']},
 {id:8,title:'Medianoche',artist:'Demo Artist',genre:'Late Night',length:'4:06',last:'3 days ago',playlists:['Después de Medianoche']}
];
let playlists=[
 {name:'Boleros',count:186,rotation:'Medium',desc:'Classic romantic rotation'},
 {name:'Cumbia de Oro',count:243,rotation:'High',desc:'Ecuadorian & Latin cumbia'},
 {name:'Ecuador Esencial',count:158,rotation:'Medium',desc:'Core Ecuadorian catalog'},
 {name:'Salsa NY',count:214,rotation:'High',desc:'New York salsa energy'},
 {name:'Después de Medianoche',count:121,rotation:'Low',desc:'Late-night deep cuts'},
 {name:'Station IDs',count:18,rotation:'Utility',desc:'Jingles, liners & IDs'}
];
let selectedTracks=new Set(),activeGenre='All',searchTerm='',libraryTab='tracks';

function mountLibrary(){
  const view=$('#view-library');if(!view)return;
  view.innerHTML=`
    <div class="section-toolbar library-header">
      <div><p class="eyebrow">MUSIC CONTROL</p><h2>Library & playlists</h2><p class="section-subtitle">Shape what AutoDJ can play before we connect the real engine.</p></div>
      <div class="toolbar-actions"><button class="ghost-button" id="createPlaylistBtn">+ New playlist</button><button class="go-live-button" id="addMusicBtn">+ Add music</button></div>
    </div>
    <div class="library-summary">
      <article><span>TRACKS</span><b>1,248</b><small>Demo catalog</small></article>
      <article><span>PLAYLISTS</span><b id="playlistCount">${playlists.length}</b><small>Active rotations</small></article>
      <article><span>UNCATEGORIZED</span><b>23</b><small>Needs attention</small></article>
      <article><span>STORAGE</span><b>18.6 GB</b><small>Preview estimate</small></article>
    </div>
    <div class="library-tabs" role="tablist">
      <button class="library-tab active" data-library-tab="tracks">Tracks <span>1,248</span></button>
      <button class="library-tab" data-library-tab="playlists">Playlists <span id="playlistTabCount">${playlists.length}</span></button>
    </div>
    <section id="libraryTracksPane">
      <div class="library-controls panel-soft">
        <label class="search-box"><span>⌕</span><input id="librarySearch" placeholder="Search title or artist…" /></label>
        <div class="genre-filters" id="genreFilters"></div>
        <div class="selection-actions" id="selectionActions"><span><b id="selectedCount">0</b> selected</span><button id="addToPlaylistBtn" disabled>Add to playlist</button><button id="clearSelectionBtn" disabled>Clear</button></div>
      </div>
      <div class="library-table panel" id="libraryTrackTable"></div>
    </section>
    <section id="libraryPlaylistsPane" hidden>
      <div class="playlist-grid" id="playlistGrid"></div>
    </section>
    <dialog class="studio-dialog" id="playlistDialog">
      <form method="dialog" id="playlistForm">
        <button class="dialog-close" value="cancel" type="button" id="playlistClose">×</button>
        <p class="eyebrow">NEW PLAYLIST</p><h3>Create a rotation</h3>
        <label>Name<input id="playlistName" required placeholder="e.g. Domingo en Familia"></label>
        <label>Rotation<select id="playlistRotation"><option>Medium</option><option>High</option><option>Low</option><option>Utility</option></select></label>
        <label>Description<input id="playlistDesc" placeholder="What belongs here?"></label>
        <button class="go-live-button dialog-submit" type="submit">Create playlist</button>
      </form>
    </dialog>
    <div class="studio-toast" id="studioToast" role="status" aria-live="polite"></div>`;

  renderGenreFilters();renderTrackTable();renderPlaylists();bindLibrary();
}
function renderGenreFilters(){
  const genres=['All',...new Set(libraryTracks.map(t=>t.genre))];
  const box=$('#genreFilters');if(!box)return;
  box.innerHTML=genres.map(g=>`<button class="filter-chip ${g===activeGenre?'active':''}" data-genre="${g}">${g}</button>`).join('');
  $$('.filter-chip').forEach(btn=>btn.addEventListener('click',()=>{activeGenre=btn.dataset.genre;renderGenreFilters();renderTrackTable()}));
}
function filteredTracks(){return libraryTracks.filter(t=>(activeGenre==='All'||t.genre===activeGenre)&&(`${t.title} ${t.artist}`.toLowerCase().includes(searchTerm.toLowerCase())))}
function renderTrackTable(){
  const table=$('#libraryTrackTable');if(!table)return;
  const rows=filteredTracks();
  table.innerHTML=`<div class="library-table-head"><span></span><span>TRACK</span><span>GENRE</span><span>PLAYLIST</span><span>LENGTH</span><span>LAST PLAYED</span><span></span></div>`+
  rows.map(t=>`<div class="library-track-row ${selectedTracks.has(t.id)?'selected':''}" data-id="${t.id}">
    <label class="check-wrap"><input type="checkbox" ${selectedTracks.has(t.id)?'checked':''} aria-label="Select ${t.title}"><span></span></label>
    <div class="track-cell"><b>${t.title}</b><small>${t.artist}</small></div><span>${t.genre}</span><span class="playlist-pill">${t.playlists[0]||'—'}</span><span>${t.length}</span><span>${t.last}</span><button class="row-menu" aria-label="More options">•••</button>
  </div>`).join('')+(rows.length?'':'<div class="empty-state">No tracks match this filter.</div>');
  $$('.library-track-row input').forEach(input=>input.addEventListener('change',e=>{const id=Number(e.target.closest('.library-track-row').dataset.id);e.target.checked?selectedTracks.add(id):selectedTracks.delete(id);renderTrackTable();updateSelectionActions()}));
  $$('.row-menu').forEach(btn=>btn.addEventListener('click',()=>pulseButton(btn,'Ready ✓','success',800)));
  updateSelectionActions();
}
function updateSelectionActions(){
  const n=selectedTracks.size,c=$('#selectedCount'),a=$('#addToPlaylistBtn'),clear=$('#clearSelectionBtn');if(c)c.textContent=n;if(a)a.disabled=!n;if(clear)clear.disabled=!n;
  $('#selectionActions')?.classList.toggle('has-selection',n>0);
}
function renderPlaylists(){
  const grid=$('#playlistGrid');if(!grid)return;
  grid.innerHTML=playlists.map((p,i)=>`<article class="playlist-card panel" data-playlist="${p.name}"><div class="playlist-art"><span>${String(i+1).padStart(2,'0')}</span><b>P</b></div><div class="playlist-info"><p class="eyebrow">${p.rotation.toUpperCase()} ROTATION</p><h3>${p.name}</h3><p>${p.desc}</p><div><span>${p.count} tracks</span><button class="playlist-open">Open playlist →</button></div></div></article>`).join('');
  $$('.playlist-open').forEach(btn=>btn.addEventListener('click',()=>{
    const name=btn.closest('.playlist-card').dataset.playlist;
    libraryTab='tracks';switchLibraryTab();searchTerm='';activeGenre='All';
    const matching=libraryTracks.filter(t=>t.playlists.includes(name));
    const table=$('#libraryTrackTable');
    if(matching.length){
      table.innerHTML=`<div class="playlist-focus-banner"><span>Viewing playlist</span><b>${name}</b><button id="exitPlaylistFocus">× Clear</button></div>`+
      `<div class="library-table-head"><span></span><span>TRACK</span><span>GENRE</span><span>PLAYLIST</span><span>LENGTH</span><span>LAST PLAYED</span><span></span></div>`+
      matching.map(t=>`<div class="library-track-row" data-id="${t.id}"><label class="check-wrap"><input type="checkbox"><span></span></label><div class="track-cell"><b>${t.title}</b><small>${t.artist}</small></div><span>${t.genre}</span><span class="playlist-pill">${name}</span><span>${t.length}</span><span>${t.last}</span><button class="row-menu">•••</button></div>`).join('');
      $('#exitPlaylistFocus')?.addEventListener('click',renderTrackTable);
    } else {showToast(`${name} is ready for tracks.`)}
  }));
}
function switchLibraryTab(){
  $$('.library-tab').forEach(b=>b.classList.toggle('active',b.dataset.libraryTab===libraryTab));
  $('#libraryTracksPane').hidden=libraryTab!=='tracks';$('#libraryPlaylistsPane').hidden=libraryTab!=='playlists';
}
function showToast(msg,kind='success'){
  const toast=$('#studioToast');if(!toast)return;toast.textContent=msg;toast.className=`studio-toast show ${kind}`;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.className='studio-toast',2200);
}
function bindLibrary(){
  $$('.library-tab').forEach(btn=>btn.addEventListener('click',()=>{libraryTab=btn.dataset.libraryTab;switchLibraryTab()}));
  $('#librarySearch')?.addEventListener('input',e=>{searchTerm=e.target.value;renderTrackTable()});
  $('#clearSelectionBtn')?.addEventListener('click',()=>{selectedTracks.clear();renderTrackTable()});
  $('#addToPlaylistBtn')?.addEventListener('click',e=>{
    const n=selectedTracks.size;pulseButton(e.currentTarget,'Added ✓','success',1100);showToast(`${n} track${n===1?'':'s'} added to demo playlist.`);selectedTracks.clear();setTimeout(renderTrackTable,1150);
  });
  $('#addMusicBtn')?.addEventListener('click',e=>{pulseButton(e.currentTarget,'Demo only','warning',1200);showToast('Upload flow will connect when storage is added.','warning')});
  const dialog=$('#playlistDialog');
  $('#createPlaylistBtn')?.addEventListener('click',()=>{dialog?.showModal();setTimeout(()=>$('#playlistName')?.focus(),20)});
  $('#playlistClose')?.addEventListener('click',()=>dialog?.close());
  $('#playlistForm')?.addEventListener('submit',e=>{
    e.preventDefault();const name=$('#playlistName').value.trim();if(!name)return;
    playlists.unshift({name,count:0,rotation:$('#playlistRotation').value,desc:$('#playlistDesc').value.trim()||'New custom rotation'});
    $('#playlistCount').textContent=playlists.length;$('#playlistTabCount').textContent=playlists.length;renderPlaylists();dialog.close();e.target.reset();libraryTab='playlists';switchLibraryTab();showToast(`${name} created.`);
  });
}
mountLibrary();

// Generic demo button feedback for controls that are not wired to backend yet.
$$('#view-schedule .go-live-button,#view-djs .go-live-button,#view-settings .go-live-button').forEach(btn=>btn.addEventListener('click',()=>pulseButton(btn,'Saved ✓','success',1100)));
})();
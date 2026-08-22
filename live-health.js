(()=>{
const SVG={
  mic:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>',
  signal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"/></svg>',
  show:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="m10 12 5 3-5 3Z"/></svg>',
  fallback:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.6 7 10 4.1-1.4 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  internet:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16a11 11 0 0 1 16 0M7 19a7 7 0 0 1 10 0M10.5 22a2.2 2.2 0 0 1 3 0"/><path d="M12 15 17 9"/><circle cx="12" cy="15" r="1.2"/></svg>'
};

function boot(){
  const bank=document.querySelector('#ribbonHealth');
  if(!bank){setTimeout(boot,60);return;}
  if(bank.dataset.iconHealth==='ready')return;
  bank.dataset.iconHealth='ready';

  const configs=[
    ['#checkMic','Microphone',SVG.mic],
    ['#checkSignal','Audio signal',SVG.signal],
    ['#checkShow','Show selected',SVG.show],
    ['#checkFallback','AutoDJ fallback',SVG.fallback]
  ];

  configs.forEach(([selector,label,svg])=>{
    const el=document.querySelector(selector);if(!el)return;
    const copy=el.querySelector('span');
    if(copy)copy.classList.add('health-copy');
    const icon=document.createElement('span');icon.className='health-icon';icon.innerHTML=svg;el.insertBefore(icon,el.firstChild);
    el.querySelector('i')?.setAttribute('aria-hidden','true');
    el.classList.add('health-icon-tile');
    const sync=()=>{
      const detail=copy?.querySelector('small')?.textContent?.trim()||'';
      el.title=detail?`${label} — ${detail}`:label;
      el.setAttribute('aria-label',detail?`${label}: ${detail}`:label);
    };
    sync();
    if(copy)new MutationObserver(sync).observe(copy,{subtree:true,childList:true,characterData:true});
  });

  const internet=document.createElement('button');
  internet.type='button';
  internet.id='checkInternet';
  internet.className='health-check health-icon-tile health-internet';
  internet.innerHTML=`<span class="health-icon">${SVG.internet}</span><span class="health-speed" id="internetSpeedValue">TEST</span>`;
  internet.title='Internet speed — click to re-test';
  internet.setAttribute('aria-label','Internet speed: testing');
  bank.appendChild(internet);
  internet.addEventListener('click',measureInternetSpeed);
  window.addEventListener('online',measureInternetSpeed);
  window.addEventListener('offline',measureInternetSpeed);
  measureInternetSpeed();
}

async function measureInternetSpeed(){
  const tile=document.querySelector('#checkInternet'),value=document.querySelector('#internetSpeedValue');
  if(!tile||!value)return;
  tile.classList.remove('ready','warn','bad','testing');
  tile.classList.add('testing');
  value.textContent='…';
  tile.title='Internet speed — testing…';
  tile.setAttribute('aria-label','Internet speed: testing');

  if(!navigator.onLine){
    tile.classList.remove('testing');tile.classList.add('bad');value.textContent='OFF';
    tile.title='Internet — offline';tile.setAttribute('aria-label','Internet: offline');return;
  }

  let measured=null,duration=0;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const stamp=Date.now();
    const urls=[`./live-studio.js?net=${stamp}-1`,`./live-studio.css?net=${stamp}-2`,`./studio.css?net=${stamp}-3`];
    const started=performance.now();
    const buffers=await Promise.all(urls.map(async url=>{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('network test failed');
      return response.arrayBuffer();
    }));
    duration=(performance.now()-started)/1000;
    const bytes=buffers.reduce((sum,b)=>sum+b.byteLength,0);
    if(duration>0&&bytes>0)measured=(bytes*8)/(duration*1000000);
  }catch{}
  clearTimeout(timeout);

  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const browserEstimate=Number(connection?.downlink);
  if((!measured||duration<0.12||measured>1000)&&Number.isFinite(browserEstimate)&&browserEstimate>0)measured=browserEstimate;

  tile.classList.remove('testing');
  if(!measured||!Number.isFinite(measured)){
    value.textContent='ON';tile.classList.add('ready');
    tile.title='Internet online — speed estimate unavailable';
    tile.setAttribute('aria-label','Internet online; speed estimate unavailable');
    return;
  }

  const shown=measured>=100?`${Math.round(measured)}`:measured>=10?`${measured.toFixed(0)}`:`${measured.toFixed(1)}`;
  value.textContent=`${shown}`;
  if(measured>=10)tile.classList.add('ready');else if(measured>=3)tile.classList.add('warn');else tile.classList.add('bad');
  tile.title=`Internet speed — approximately ${shown} Mbps. Click to re-test.`;
  tile.setAttribute('aria-label',`Internet speed approximately ${shown} megabits per second`);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
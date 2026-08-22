(()=>{
const STORAGE_KEY='paraiso.studio.sidebarCollapsed';
const MOBILE_BREAKPOINT=820;

function boot(){
  const shell=document.querySelector('.studio-shell');
  const sidebar=document.querySelector('.sidebar');
  const nav=document.querySelector('.studio-nav');
  if(!shell||!sidebar||!nav)return;
  if(sidebar.dataset.collapseReady==='true')return;
  sidebar.dataset.collapseReady='true';

  // Wrap raw nav label text so CSS can hide only the words and keep the icons active.
  sidebar.querySelectorAll('.nav-item').forEach(btn=>{
    if(btn.querySelector('.nav-label'))return;
    [...btn.childNodes].forEach(node=>{
      if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){
        const label=document.createElement('span');
        label.className='nav-label';
        label.textContent=node.textContent.trim();
        node.replaceWith(label);
      }
    });
    const label=btn.querySelector('.nav-label')?.textContent?.trim();
    if(label){
      btn.dataset.navLabel=label;
      btn.title=label;
      btn.setAttribute('aria-label',label);
    }
  });

  const brand=document.querySelector('.studio-brand');
  if(brand){
    const parts=brand.querySelectorAll(':scope > span');
    if(parts[1])parts[1].classList.add('brand-copy');
    brand.title='PARAÍSO Studio';
  }

  const bottom=sidebar.querySelector('.sidebar-bottom');
  const publicLink=bottom?.querySelector('.public-link');
  const bottomNote=bottom?.querySelector('small');
  if(publicLink){
    publicLink.classList.add('sidebar-public-link');
    publicLink.dataset.fullLabel=publicLink.textContent.trim();
    publicLink.title='Open public station';
    publicLink.setAttribute('aria-label','Open public station');
    const icon=document.createElement('span');
    icon.className='sidebar-public-icon';
    icon.setAttribute('aria-hidden','true');
    icon.textContent='↗';
    publicLink.prepend(icon);
    const label=document.createElement('span');
    label.className='sidebar-public-label';
    // Remove all text nodes left in the anchor and reinsert as a label.
    [...publicLink.childNodes].forEach(node=>{
      if(node.nodeType===Node.TEXT_NODE)node.remove();
    });
    label.textContent='Open public station';
    publicLink.appendChild(label);
  }
  if(bottomNote)bottomNote.classList.add('sidebar-bottom-note');

  const controls=document.createElement('div');
  controls.className='sidebar-controls';
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.id='sidebarCollapseButton';
  toggle.className='sidebar-collapse-button';
  toggle.innerHTML='<span aria-hidden="true">‹</span>';
  controls.appendChild(toggle);
  sidebar.insertBefore(controls,nav);

  function storedPreference(){
    try{
      const value=localStorage.getItem(STORAGE_KEY);
      return value===null?null:value==='true';
    }catch{return null}
  }
  function savePreference(collapsed){
    try{localStorage.setItem(STORAGE_KEY,String(collapsed))}catch{}
  }
  function setCollapsed(collapsed,{persist=true}={}){
    shell.classList.toggle('sidebar-collapsed',collapsed);
    sidebar.classList.toggle('collapsed',collapsed);
    toggle.classList.toggle('collapsed',collapsed);
    toggle.querySelector('span').textContent=collapsed?'›':'‹';
    toggle.title=collapsed?'Expand sidebar':'Collapse sidebar';
    toggle.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');
    toggle.setAttribute('aria-expanded',String(!collapsed));
    if(persist)savePreference(collapsed);
  }
  function currentCollapsed(){return shell.classList.contains('sidebar-collapsed')}

  toggle.addEventListener('click',()=>setCollapsed(!currentCollapsed()));

  // Reuse the existing header menu button as another sidebar toggle.
  const headerMenu=document.querySelector('#menuButton');
  if(headerMenu){
    headerMenu.title='Toggle sidebar';
    headerMenu.setAttribute('aria-label','Toggle sidebar');
    headerMenu.addEventListener('click',e=>{
      if(window.innerWidth>MOBILE_BREAKPOINT){
        e.stopImmediatePropagation();
        setCollapsed(!currentCollapsed());
      }
    },true);
  }

  // In icon-rail mode, navigation remains one click away. Tooltips expose names.
  sidebar.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(window.innerWidth<=MOBILE_BREAKPOINT)setCollapsed(true,{persist:false});
    });
  });

  const pref=storedPreference();
  const initial=window.innerWidth<=MOBILE_BREAKPOINT?true:(pref??false);
  setCollapsed(initial,{persist:false});

  let wasMobile=window.innerWidth<=MOBILE_BREAKPOINT;
  window.addEventListener('resize',()=>{
    const mobile=window.innerWidth<=MOBILE_BREAKPOINT;
    if(mobile!==wasMobile){
      wasMobile=mobile;
      if(mobile)setCollapsed(true,{persist:false});
      else setCollapsed(storedPreference()??false,{persist:false});
    }
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
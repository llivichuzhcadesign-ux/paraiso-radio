(()=>{
  const root=document.documentElement;
  let raf=0,lastX=window.innerWidth*.72,lastY=window.innerHeight*.28;
  const apply=()=>{
    raf=0;
    root.style.setProperty('--lab-pointer-x',`${(lastX/window.innerWidth)*100}%`);
    root.style.setProperty('--lab-pointer-y',`${(lastY/window.innerHeight)*100}%`);
  };
  const move=e=>{
    lastX=e.clientX;lastY=e.clientY;
    if(!raf)raf=requestAnimationFrame(apply);
  };
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&window.matchMedia('(pointer:fine)').matches){
    window.addEventListener('pointermove',move,{passive:true});
  }
})();
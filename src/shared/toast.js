/* Aviso rápido (#toast), compartilhado (marcador SHARED:toast). A duração vem de TOAST_MS, definido no núcleo. */
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,TOAST_MS);}

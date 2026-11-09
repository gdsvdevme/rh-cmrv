/* Aviso rápido (#toast), compartilhado (marcador SHARED:toast). A página pode trocar a duração depois do marcador: TOAST_MS=3500; */
let TOAST_MS=4500;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,TOAST_MS);}

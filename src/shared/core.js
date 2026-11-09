/* Núcleo compartilhado por todas as páginas (o build.py injeta onde o modelo tem o marcador SHARED:core). Mudou aqui, mudou em todas. */
const TEMA_KEY='rhcrv-tema';
let TOAST_MS=4500;                                  // a página pode trocar: TOAST_MS=3500;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICO2={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'};
function isDark(){const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);return m?(0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255<0.4:false;}
function themeBtn(){
  const b=$('#themeBtn');if(!b) return;const d=isDark();
  b.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO2[d?'sun':'moon']}</svg>${d?'Modo claro':'Modo escuro'}`;
  b.setAttribute('aria-label',d?'Mudar para o modo claro':'Mudar para o modo escuro');
}
/* liga o botão de tema; `depois` roda após a troca (ex.: redesenhar um gráfico) */
function ligarTema(depois){
  $('#themeBtn').addEventListener('click',()=>{
    const n=isDark()?'light':'dark';document.documentElement.setAttribute('data-theme',n);
    try{localStorage.setItem(TEMA_KEY,n);}catch(e){}
    themeBtn();if(depois) depois();
  });
}
try{const s=localStorage.getItem(TEMA_KEY);document.documentElement.setAttribute('data-theme',s==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}

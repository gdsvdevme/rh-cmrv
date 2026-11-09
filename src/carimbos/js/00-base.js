const LS='rhcrv-carimbos-v1';
const WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PADRAO={id:'padrao',nome:'Atesto jornada 40h (padrão)',src:'data:image/png;base64,/*STAMP_B64*/',padrao:true};
/* atenção: este norm também reduz espaços repetidos; o de src/shared/norm.js (usado nas outras páginas) não. Por isso não é o compartilhado. */
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const digs=s=>String(s||'').replace(/\D/g,'').replace(/^0+/,'');
const MIN=new Set(['de','da','do','das','dos','e','a','o']),ROMAN=/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
function titulo(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim().split(' ').map((w,i)=>(i>0&&ROMAN.test(w))?w.toUpperCase():(i>0&&MIN.has(w))?w:w.replace(/(^|[-\/(])(\p{L})/gu,
  (m,a,b)=>a+b.toUpperCase())).join(' ');}
/* mesma regra de grupos da Hierarquia de Pessoal */
function grupoInfo(h){
  const n=norm(h);
  if(n==='setor administrativo') return {k:'setor',nome:'Setor Administrativo',ramo:0,sort:'0'};
  const m=/^vereador(a)?\s+(.+)$/.exec(n);
  if(m){const nm=titulo(String(h).replace(/^vereador(a)?\s+/i,''));return {k:'g:'+n,nome:'Gabinete '+(m[1]?'da Vereadora ':'do Vereador ')+nm,ramo:1,sort:norm(nm)};}
  return {k:'o:'+n,nome:titulo(h),ramo:0,sort:'1'+norm(h)};
}
const NAO={k:'nao',nome:'Não identificados na hierarquia',ramo:9,sort:'z'};


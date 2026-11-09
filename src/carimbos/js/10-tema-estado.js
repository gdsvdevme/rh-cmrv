/* ---------- tema ---------- */
ligarTema();
function carga(on,t,s,p){
  $('#load').hidden=!on;document.body.classList.toggle('carregando',!!on);
  if(t) $('#ldT').textContent=t;if(s!=null) $('#ldS').textContent=s;if(p!=null) $('#ldB').style.width=Math.round(p*100)+'%';
}
const pausa=()=>new Promise(r=>setTimeout(r,0));

/* ---------- estado ---------- */
let dbh=null,pessoal=null;                 // pessoal: dados da Hierarquia de Pessoal (servidor)
let bytes=null,pdfDoc=null,nomeArq='',N=0;
let entradas=[];                            // uma por servidor: {nome,mat,cargo,pag:[índices],pessoa,manual,periodo}
let porPag=[];                              // índice da página -> entrada
let GH=new Map();                           // grupos da hierarquia (k -> info)
let idxMat=new Map(),idxNome=new Map();
let custom=[],sel='padrao',pos={x:.66,y:.55,w:.30};
const over=new Map();                       // índice da página -> {x,y,w} | 'skip'
let cur=0,aberto=new Set(['__todos']),filtro='';
const stampImgs={};                          // id -> HTMLImageElement
const stampsTodos=()=>[PADRAO].concat(custom);
const stampAtual=()=>stampsTodos().find(s=>s.id===sel)||PADRAO;

/* ---------- configuração guardada (carimbos adicionados, escolhido e posição) ---------- */
let saveT=null;
function guardar(){
  clearTimeout(saveT);
  saveT=setTimeout(async()=>{
    const json=JSON.stringify({custom,sel,pos,fundo:$('#optFundo').checked,capas:$('#optCapas').checked});
    if(dbh){try{await dbh.doc('carimbos/config').set({json});return;}catch(e){toast('Não foi possível salvar as preferências no servidor.');}}
    try{localStorage.setItem(LS,json);}catch(e){}
  },400);
}
function aplicarConfig(c){
  if(!c) return;
  if(Array.isArray(c.custom)) custom=c.custom.filter(s=>s&&s.id&&s.src);
  if(c.sel&&stampsTodos().some(s=>s.id===c.sel)) sel=c.sel;
  if(c.pos&&c.pos.w>0) pos=c.pos;
  if(typeof c.fundo==='boolean') $('#optFundo').checked=c.fundo;
  if(typeof c.capas==='boolean') $('#optCapas').checked=c.capas;
}

/* ---------- hierarquia (a mesma da Hierarquia de Pessoal) ---------- */
function montarHierarquia(){
  GH=new Map();idxMat=new Map();idxNome=new Map();
  ((pessoal&&pessoal.pessoas)||[]).forEach(p=>{
    const g=grupoInfo(p.g);if(!GH.has(g.k)) GH.set(g.k,g);
    p._k=g.k;
    if(p.m&&digs(p.m)&&!idxMat.has(digs(p.m))) idxMat.set(digs(p.m),p);
    const nn=norm(p.n);if(!idxNome.has(nn)) idxNome.set(nn,p);
  });
}
function vincular(){
  entradas.forEach(e=>{e.pessoa=idxMat.get(digs(e.mat))||idxNome.get(norm(e.nome))||null;});
}
const gkDe=e=>e.manual||(e.pessoa?e.pessoa._k:'nao');
const infoGrupo=k=>k==='nao'?(pessoal?NAO:Object.assign({},NAO,{nome:'Sem hierarquia (a hierarquia de pessoal não foi carregada)'})):(GH.get(k)||NAO);
function grupos(){
  const m=new Map();
  entradas.forEach(e=>{const k=gkDe(e);if(!m.has(k)) m.set(k,Object.assign({},infoGrupo(k),{k,entradas:[]}));m.get(k).entradas.push(e);});
  const L=[...m.values()];
  const ord=e=>(e.pessoa&&!e.manual&&e.pessoa.o!=null)?e.pessoa.o:1e6+e.pag[0];
  L.forEach(g=>g.entradas.sort((a,b)=>ord(a)-ord(b)||a.pag[0]-b.pag[0]));
  L.sort((a,b)=>a.ramo-b.ramo||a.sort.localeCompare(b.sort));
  return L;
}


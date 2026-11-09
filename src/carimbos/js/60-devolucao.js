/* ---------- controle de devolução ---------- */
const DST={nao:'Não devolvido',ok:'Devolvido ao RH',pend:'Devolvido com pendências'};
const DST_EM={ok:'devolvido ao RH',pend:'devolvido com pendências'};   // frase da linha do setor (não dá para só baixar as maiúsculas: "RH")
const devAberto=new Set();                       // setores com a lista de servidores aberta
let dev={itens:{},baixas:{}},devFiltro='todos',devBusca='',devT=null,devRef='',devPend=false;
const devKey=()=>{const m=+$('#dMes').value,a=+$('#dAno').value;return(a>=2000&&a<=2100)?a+'-'+String(m).padStart(2,'0'):'';};
const hoje=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const brData=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'';
let devSetoresCache=null;                       // zerado em montarHierarquia(), quando a hierarquia muda
function devSetores(){
  if(devSetoresCache) return devSetoresCache;
  const cont=new Map();
  ((pessoal&&pessoal.pessoas)||[]).forEach(p=>{if(p._k) cont.set(p._k,(cont.get(p._k)||0)+1);});
  return devSetoresCache=[...GH.values()].sort((a,b)=>a.ramo-b.ramo||a.sort.localeCompare(b.sort)).map(g=>({k:g.k,nome:g.nome,n:cont.get(g.k)||0}));
}
const devSit=k=>(dev.itens[k]&&dev.itens[k].s)||'nao';
const devEntregue=k=>!!(dev.itens[k]&&dev.itens[k].e);
const devNoFiltro=k=>devFiltro==='todos'||(devFiltro==='ent'?devEntregue(k):devSit(k)===devFiltro);
async function devSalvar(){
  clearTimeout(devT);if(!devPend||!devRef) return;devPend=false;
  const json=JSON.stringify(dev),ref=devRef;
  if(dbh){try{await dbh.doc('devolucao/'+ref).set({json});return;}catch(e){toast('Não foi possível salvar no servidor.');}}
  try{localStorage.setItem('rhcrv-devolucao-'+ref,json);}catch(e){}
}
function devAgendar(){devPend=true;clearTimeout(devT);devT=setTimeout(devSalvar,600);}
async function devCarregar(){
  await devSalvar();
  devRef=devKey();dev={itens:{},baixas:{}};
  if(!devRef){devDesenhar();return;}
  const ref=devRef;let j=null;
  try{if(dbh){const d=await dbh.doc('devolucao/'+ref).get();if(d.exists) j=d.data().json;}}catch(e){toast('Não foi possível ler as marcações do servidor.');}
  if(j==null){try{j=localStorage.getItem('rhcrv-devolucao-'+ref);}catch(e){}}
  if(ref!==devRef) return;                      // o mês mudou durante a leitura
  try{const o=JSON.parse(j||'null');if(o&&o.itens&&typeof o.itens==='object') dev=o;}catch(e){}
  if(!dev.baixas||typeof dev.baixas!=='object') dev.baixas={};
  devDesenhar();
}
function devLinha(g){
  const it=dev.itens[g.k]||{},s=it.s||'nao',aberto=devAberto.has(g.k),L=devPessoasDe(g.k),bx=L.filter(p=>dev.baixas[pessoaId(p)]).length;
  const prog=L.length?`<div class="prog" title="Servidores com baixa no ponto"><div class="bar"><i style="width:${Math.round(bx*100/L.length)}%"></i></div><span>${bx}/${L.length}</span></div>`:'<div class="prog"><span>sem servidores</span></div>';
  const btns=['ok','pend','nao'].map(v=>`<button type="button" data-s="${v}" class="${s===v?'on':''}" aria-pressed="${s===v}">${DST[v]}</button>`).join('');
  const data=s!=='nao'?`<input type="date" data-f="d" value="${esc(it.d||'')}" aria-label="Data da devolução">`:'';
  const ph=s==='pend'?'Descreva as pendências…':'Observação (opcional)';
  const det=aberto?`<div class="ddet">
    <div class="st" data-l="Devolução do setor"><div class="seg" role="group" aria-label="Situação de ${esc(g.nome)}">${btns}</div>${data}</div>
    ${devRh(it)}
    <div class="obs" data-l="Observação"><textarea data-f="o" rows="1" placeholder="${ph}" aria-label="Observação de ${esc(g.nome)}">${esc(it.o||'')}</textarea></div>
    ${s==='pend'?devPendencias(g,it):''}
    ${devServidores(g,it,L)}
  </div>`:'';
  return `<div class="drow ${s}" data-k="${esc(g.k)}">
    <div class="dh"><div class="nm"><button type="button" class="nmbtn" data-open aria-expanded="${aberto}" title="Abrir o setor"><span class="car" aria-hidden="true">▶</span><b>${esc(g.nome)}</b></button></div>${prog}<span class="pill ${s}">${DST[s]}</span></div>
    ${det}
  </div>`;
}
/* lista dos servidores do setor/gabinete: botão de baixa no ponto em cada um; marca os que ficaram com pendência */
function devServidores(g,it,L){
  const pend=new Set(((it.s==='pend'&&it.ps)||[]).map(x=>x.i));
  if(!L.length) return '<div class="srvs"><b>Servidores</b><p class="muted" style="margin:4px 0 0">Nenhum servidor deste setor na Hierarquia de Pessoal.</p></div>';
  const bx=L.filter(p=>dev.baixas[pessoaId(p)]).length;
  return `<div class="srvs"><b>Servidores — ${bx} de ${L.length} com baixa no ponto</b><ul>${L.map(p=>{const id=pessoaId(p),b=dev.baixas[id],pd=pend.has(id);
    return `<li class="${b?'bx':''}${pd?' pd':''}"><span class="sn">${esc(p.n)}${p.m?' <small>mat. '+esc(p.m)+'</small>':''}${pd?' <em>pendente</em>':''}</span>`+
      (b?`<button type="button" class="btn sm feito" data-baixa="${esc(id)}" title="Desfazer a baixa de ${esc(p.n)}">✓ ${esc(brData(b.d).slice(0,5))}</button>`:`<button type="button" class="btn sm" data-baixa="${esc(id)}">Dar baixa</button>`)+'</li>';}).join('')}</ul></div>`;
}
/* servidores com pendência: escolhidos entre os do setor/gabinete na Hierarquia de Pessoal (guarda matrícula e nome) */
const pessoaId=p=>p.m?String(p.m):'n:'+norm(p.n);
function devPessoasDe(k){
  return ((pessoal&&pessoal.pessoas)||[]).filter(p=>p._k===k).sort((a,b)=>(a.o==null?1e6:a.o)-(b.o==null?1e6:b.o)||a.n.localeCompare(b.n));
}
function devPendencias(g,it){
  const ps=it.ps||[],marcados=new Set(ps.map(x=>x.i));
  const livres=devPessoasDe(g.k).filter(p=>!marcados.has(pessoaId(p)));
  const chips=ps.length?ps.map(x=>`<span class="chip">${esc(x.n)}${x.m?' · mat. '+esc(x.m):''}<button type="button" data-pend="rem" data-i="${esc(x.i)}" aria-label="Tirar ${esc(x.n)} da lista">×</button></span>`).join(''):'<span class="muted">Nenhum servidor marcado</span>';
  const sel=livres.length?`<select data-pend="add" aria-label="Adicionar servidor com pendência"><option value="">+ Adicionar servidor…</option>${livres.map(p=>`<option value="${esc(pessoaId(p))}">${esc(p.n)}${p.c?' — '+esc(p.c):''}</option>`).join('')}</select>`:(ps.length?'':'<span class="muted">Este setor não tem servidores na hierarquia.</span>');
  return `<div class="pendbox"><b>Servidores com pendência</b>${chips}${sel}</div>`;
}
/* entrega do espelho pelo RH ao setor: interruptor com data e com quem marcou (nome e matrícula) */
function devRh(it){
  const e=it.e;
  let h='<div class="rh" data-l="Entrega do RH ao setor"><label class="sw"><input type="checkbox" data-e="chk" aria-label="Espelho entregue pelo RH ao setor"'+(e?' checked':'')+'><span>'+(e?'Entregue ao setor':'Não entregue ao setor')+'</span></label>';
  if(e) h+=`<div class="rh2"><input type="date" data-e="d" value="${esc(e.d||'')}" aria-label="Data da entrega pelo RH"><span class="quem">registrado por ${esc(e.p&&e.p.n||'—')}${e.p&&e.p.m?' (mat. '+esc(e.p.m)+')':''}</span></div>`;
  return h+'</div>';
}
function devResumo(L){
  const c={ok:0,pend:0,nao:0,ent:0};L.forEach(g=>{c[devSit(g.k)]++;if(devEntregue(g.k)) c.ent++;});
  const bt=(v,t,n)=>`<button type="button" class="${devFiltro===v?'on':''}" data-flt="${v}">${t} <b>${n}</b></button>`;
  const todos=((pessoal&&pessoal.pessoas)||[]).filter(p=>p._k),feitas=todos.filter(p=>dev.baixas[pessoaId(p)]).length;
  $('#dSum').innerHTML=bt('todos','Todos',L.length)+bt('nao','Não devolvidos',c.nao)+bt('pend','Com pendências',c.pend)+bt('ok','Devolvidos',c.ok)+bt('ent','Entregues ao setor',c.ent)+(todos.length?`<span class="tot">Baixas no ponto: <b>${feitas}</b> de ${todos.length}</span>`:'');
}
function devDesenhar(){
  const box=$('#dLista');
  qUltimas();
  if(!pessoal||!GH.size){devResumo([]);
    box.innerHTML='<div class="empty" style="padding:24px"><h2>Hierarquia de pessoal não carregada</h2><p class="muted">Os setores vêm da Hierarquia de Pessoal. Abra-a e clique em <b>Atualizar do Centi</b> ao menos uma vez.</p></div>';
    return;}
  const L=devSetores();devResumo(L);
  const q=norm(devBusca);
  const V=L.filter(g=>devNoFiltro(g.k)&&(!q||norm(g.nome).includes(q)));
  box.innerHTML=V.length?V.map(devLinha).join(''):'<p class="muted" style="padding:18px">Nenhum setor nesta lista.</p>';
}
function devMudar(k,campos){
  const it=Object.assign({},dev.itens[k]||{},campos);
  if(it.e===null) delete it.e;                    // null = tirar a marca de entrega do RH
  it.s=it.s||'nao';
  if(it.s==='nao'){delete it.d;}
  else if(!it.d) it.d=hoje();
  const g=devSetores().find(x=>x.k===k);if(g) it.nome=g.nome;
  it.u=new Date().toISOString();
  if(it.s==='nao'&&!(it.o||'').trim()&&!it.e) delete dev.itens[k];else dev.itens[k]=it;
  devAgendar();
}
$('#dLista').addEventListener('click',async ev=>{
  const b=ev.target.closest('.seg button');if(!b) return;
  const row=b.closest('.drow'),k=row.dataset.k,sit=b.dataset.s;
  const o=row.querySelector('textarea');
  devMudar(k,{s:sit,o:o?o.value:''});
  const marcarEntrega=sit!=='nao'&&!devEntregue(k);     // se o setor devolveu o espelho, é porque o RH entregou
  devRedesenhaLinha(k);
  if(!marcarEntrega) return;
  let por=null;
  try{por=await devQuemSou();}catch(e){toast((e.message||'Não foi possível identificar quem registrou.')+' A entrega foi marcada sem o nome de quem registrou.');}
  if(devSit(k)==='nao'||devEntregue(k)) return;        // mudou de ideia enquanto isso
  const e={d:hoje()};if(por) e.p={n:por.nome,m:por.mat,u:por.user};
  devEntrega(k,()=>e);devRedesenhaLinha(k);
});
$('#dLista').addEventListener('click',ev=>{
  const b=ev.target.closest('.nmbtn');if(!b) return;
  const k=b.closest('.drow').dataset.k;
  if(devAberto.has(k)) devAberto.delete(k);else devAberto.add(k);
  devRedesenhaLinha(k);
});
$('#dLista').addEventListener('input',ev=>{
  const f=ev.target.dataset&&ev.target.dataset.f;if(!f) return;
  const k=ev.target.closest('.drow').dataset.k;
  devMudar(k,{[f]:ev.target.value,s:devSit(k)});
});
/* quem está marcando: nome completo do Centi e matrícula (buscada no Centi pelo nome; se não achar, pergunta uma vez e guarda neste navegador) */
async function devQuemSou(){
  if(!PB.centi.user){const h=await PB.connect();if(h&&!dbh) dbh=h;}
  const user=PB.centi.user;
  if(!user) throw new Error('Entre com o usuário do Centi para registrar a entrega.');
  const nome=PB.centi.nome||user,chave='rhcrv-mat-'+user;
  let mat='';try{mat=localStorage.getItem(chave)||'';}catch(e){}
  if(!mat){
    try{
      const r=await PB.centi.licencaBusca(nome),ex=((r&&r.Data)||[]).filter(x=>norm(x.Nome)===norm(nome));
      if(ex.length===1) mat=String(ex[0].Matricula||'');
    }catch(e){}
  }
  if(!mat){
    const v=prompt('Não encontramos sua matrícula no Centi. Digite sua matrícula (só números) para constar no registro:','');
    mat=digs(v);if(!mat) throw new Error('Informe a matrícula para registrar a entrega.');
  }
  try{localStorage.setItem(chave,mat);}catch(e){}
  return {nome:titulo(nome),mat,user};
}
function devRedesenhaLinha(k){
  if(!devNoFiltro(k)){devDesenhar();return;}                                    // saiu do filtro atual
  const row=[...document.querySelectorAll('#dLista .drow')].find(r=>r.dataset.k===k),g=devSetores().find(x=>x.k===k);
  if(row&&g){row.outerHTML=devLinha(g);devResumo(devSetores());}
}
function devRefaz(row,k){const g=devSetores().find(x=>x.k===k);if(g){row.outerHTML=devLinha(g);devResumo(devSetores());}}
function devEntrega(k,fn){const it=Object.assign({},dev.itens[k]||{});const e=fn(Object.assign({},it.e||{}));it.e=e||null;devMudar(k,it);}
$('#dLista').addEventListener('change',async ev=>{
  const t=ev.target,f=t.dataset&&t.dataset.e;if(!f) return;
  const row=t.closest('.drow'),k=row.dataset.k,it=dev.itens[k]||{};
  try{
    if(f==='chk'){
      if(t.checked){
        t.disabled=true;
        const p=await devQuemSou();
        devEntrega(k,()=>({d:hoje(),p:{n:p.nome,m:p.mat,u:p.user}}));
      }else{
        devEntrega(k,()=>null);
      }
      if(!devNoFiltro(k)) devDesenhar();else devRefaz(row,k);
    }else if(f==='d'){
      if(t.value) devEntrega(k,e=>Object.assign(e,{d:t.value}));
    }
  }catch(e){toast(e.message||String(e));devRefaz(row,k);}
});
$('#dLista').addEventListener('change',ev=>{
  const t=ev.target;if(!t.dataset||t.dataset.pend!=='add'||!t.value) return;
  const row=t.closest('.drow'),k=row.dataset.k,p=devPessoasDe(k).find(x=>pessoaId(x)===t.value);if(!p) return;
  const ps=((dev.itens[k]||{}).ps||[]).concat([{i:pessoaId(p),n:p.n,m:p.m?String(p.m):''}]);
  devMudar(k,{ps});devRefaz(row,k);
});
$('#dLista').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-pend=rem]');if(!b) return;
  const row=b.closest('.drow'),k=row.dataset.k;
  devMudar(k,{ps:((dev.itens[k]||{}).ps||[]).filter(x=>x.i!==b.dataset.i)});devRefaz(row,k);
});
/* ---------- baixa no ponto, por servidor ---------- */
let devPor=null;                                                       // quem está registrando (guardado depois da 1ª vez)
async function devPorGarantir(){
  if(devPor) return devPor;
  try{devPor=await devQuemSou();}catch(e){toast((e.message||'Não foi possível identificar quem registrou.')+' A baixa foi registrada sem o nome de quem registrou.');}
  return devPor;
}
const devPorReg=()=>devPor?{n:devPor.nome,m:devPor.mat,u:devPor.user}:undefined;
/* registra a baixa; devolve true se esta baixa completou o setor (e ele passou a "devolvido ao RH") */
function devBaixar(p){
  const id=pessoaId(p),k=p._k;
  dev.baixas[id]={n:p.n,m:p.m?String(p.m):'',k,d:hoje(),u:new Date().toISOString(),p:devPorReg()};
  devAgendar();
  const L=devPessoasDe(k);
  if(L.length&&L.every(x=>dev.baixas[pessoaId(x)])&&devSit(k)==='nao'){
    devMudar(k,{s:'ok'});
    if(!devEntregue(k)) devEntrega(k,()=>{const e={d:hoje()};const r=devPorReg();if(r) e.p=r;return e;});
    return true;
  }
  return false;
}
function devDesfazer(id){delete dev.baixas[id];devAgendar();}
const devPessoaPorId=id=>((pessoal&&pessoal.pessoas)||[]).find(p=>p._k&&pessoaId(p)===id);
function qUltimas(){
  const box=$('#qUlt');if(!box) return;
  const L=Object.entries(dev.baixas||{}).sort((a,b)=>(b[1].u||'').localeCompare(a[1].u||'')).slice(0,5);
  if(!L.length){box.innerHTML='';return;}
  box.innerHTML='<div class="qult"><b>Últimas baixas</b><ul>'+L.map(([id,b],i)=>{const g=GH.get(b.k);
    return `<li${qNovo===id?' class="novo"':''}><span>${esc(titulo(b.n))}<small> · ${esc(g?g.nome:'')} · ${esc(brData(b.d).slice(0,5))}</small></span><button type="button" class="btn sm" data-undo="${esc(id)}">Desfazer</button></li>`;}).join('')+'</ul></div>';
}
let qNovo='',qLista=[],qSel=0;
function qDesenhar(){
  const box=$('#qRes');
  if(!qLista.length){box.hidden=true;return;}
  box.innerHTML=qLista.map((p,i)=>{const b=dev.baixas[pessoaId(p)],g=GH.get(p._k);
    return `<button type="button" role="option" data-i="${i}" class="${i===qSel?'on':''}"><span><b>${esc(titulo(p.n))}</b><small>${p.m?'mat. '+esc(p.m)+' · ':''}${esc(g?g.nome:'')}</small></span>${b?'<span class="ja">já baixado '+esc(brData(b.d).slice(0,5))+'</span>':''}</button>`;}).join('');
  box.hidden=false;
}
function qBuscar(){
  const t=norm($('#qBusca').value),dig=digs(t);
  if(!pessoal){qLista=[];const box=$('#qRes');box.innerHTML='<p class="muted" style="padding:10px 12px;margin:0">Hierarquia de pessoal não carregada. Abra-a e clique em <b>Atualizar do Centi</b>.</p>';box.hidden=!t;return;}
  if(t.length<2){qLista=[];qDesenhar();return;}
  qLista=pessoal.pessoas.filter(p=>p._k&&(norm(p.n).includes(t)||(dig.length>=3&&p.m&&digs(p.m).includes(dig))))
    .sort((a,b)=>(norm(b.n).startsWith(t)-norm(a.n).startsWith(t))||a.n.localeCompare(b.n,'pt-BR')).slice(0,6);
  qSel=0;qDesenhar();
}
async function qConfirmar(p){
  if(!p) return;
  $('#qBusca').value='';qLista=[];qDesenhar();$('#qBusca').focus();
  const b=dev.baixas[pessoaId(p)];
  if(b){toast(titulo(p.n)+' já tinha baixa em '+brData(b.d)+'.');return;}
  await devPorGarantir();
  const completou=devBaixar(p);
  qNovo=pessoaId(p);qUltimas();devRedesenhaLinha(p._k);devResumo(devSetores());
  const g=GH.get(p._k);
  toast('Baixa no ponto: '+titulo(p.n)+(completou?' · '+(g?g.nome:'setor')+' completo, devolvido ao RH':''));
}
$('#qBusca').addEventListener('input',qBuscar);
$('#qBusca').addEventListener('keydown',ev=>{
  if(ev.key==='ArrowDown'&&qLista.length){qSel=(qSel+1)%qLista.length;qDesenhar();ev.preventDefault();}
  else if(ev.key==='ArrowUp'&&qLista.length){qSel=(qSel+qLista.length-1)%qLista.length;qDesenhar();ev.preventDefault();}
  else if(ev.key==='Enter'){ev.preventDefault();qConfirmar(qLista[qSel]);}
  else if(ev.key==='Escape'){$('#qBusca').value='';qLista=[];qDesenhar();}
});
$('#qRes').addEventListener('click',ev=>{const b=ev.target.closest('button[data-i]');if(b) qConfirmar(qLista[+b.dataset.i]);});
$('#qUlt').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-undo]');if(!b) return;
  const id=b.dataset.undo,reg=dev.baixas[id];devDesfazer(id);qNovo='';qUltimas();
  if(reg) devRedesenhaLinha(reg.k);devResumo(devSetores());
});
/* botão de baixa dentro do setor aberto */
$('#dLista').addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-baixa]');if(!b) return;
  const row=b.closest('.drow'),k=row.dataset.k,id=b.dataset.baixa;
  if(dev.baixas[id]){devDesfazer(id);}
  else{const p=devPessoasDe(k).find(x=>pessoaId(x)===id);if(!p) return;await devPorGarantir();qNovo=id;if(devBaixar(p)) toast('Setor completo: devolvido ao RH.');}
  qUltimas();devRedesenhaLinha(k);devResumo(devSetores());
});
$('#dSum').addEventListener('click',ev=>{const b=ev.target.closest('[data-flt]');if(!b) return;devFiltro=b.dataset.flt;devDesenhar();});
$('#dBusca').addEventListener('input',ev=>{devBusca=ev.target.value;devDesenhar();});
$('#dMes').addEventListener('change',devCarregar);$('#dAno').addEventListener('change',devCarregar);
window.addEventListener('pagehide',devSalvar);
$('#dCsv').addEventListener('click',()=>{
  if(!GH.size){toast('A hierarquia de pessoal não está carregada.');return;}
  const c=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const rows=[['Setor','Servidores','Situação','Data','Observação','Espelho entregue ao setor pelo RH','Data da entrega ao setor','Registrado por','Servidores com pendência','Baixas no ponto','Servidores sem baixa']].concat(devSetores().map(g=>{const it=dev.itens[g.k]||{},e=it.e||null;return [g.nome,
    g.n,DST[devSit(g.k)],brData(it.d),(it.o||'').replace(/\s*\n\s*/g,' '),e?'Sim':'Não',e?brData(e.d):'',e&&e.p?e.p.n+(e.p.m?' (mat. '+e.p.m+')':''):'',
    devSit(g.k)==='pend'?(it.ps||[]).map(x=>x.n+(x.m?' (mat. '+x.m+')':'')).join('; '):'',
    (()=>{const L=devPessoasDe(g.k);return L.filter(x=>dev.baixas[pessoaId(x)]).length+' de '+L.length;})(),
    devPessoasDe(g.k).filter(x=>!dev.baixas[pessoaId(x)]).map(x=>x.n+(x.m?' (mat. '+x.m+')':'')).join('; ')];}));
  const csv='﻿'+rows.map(r=>r.map(c).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='controle-devolucao-espelhos-'+(devRef||'mes')+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
});
(function(){
  const a=new Date();                                                     // padrão: mês atual (troque se quiser outro)
  $('#dMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#dMes').value=String(a.getMonth()+1);$('#dAno').value=a.getFullYear();
})();


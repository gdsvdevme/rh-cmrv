/* ---------- baixa no ponto: individual e por hierarquia ---------- */
let dev={itens:{},baixas:{}},devT=null,devRef='',devPend=false;
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
const pessoaId=p=>p.m?String(p.m):'n:'+norm(p.n);
function devPessoasDe(k){
  return ((pessoal&&pessoal.pessoas)||[]).filter(p=>p._k===k).sort((a,b)=>(a.o==null?1e6:a.o)-(b.o==null?1e6:b.o)||a.n.localeCompare(b.n));
}
/* as baixas ficam no registro do mês (devolucao/AAAA-MM, campo baixas); o resto do registro (campo itens, de versões anteriores) não é tocado */
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
  try{const o=JSON.parse(j||'null');if(o&&typeof o==='object') dev=o;}catch(e){}
  if(!dev.itens||typeof dev.itens!=='object') dev.itens={};
  if(!dev.baixas||typeof dev.baixas!=='object') dev.baixas={};
  devDesenhar();
}
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

let devPor=null;                                                       // quem está registrando (guardado depois da 1ª vez)
async function devPorGarantir(){
  if(devPor) return devPor;
  try{devPor=await devQuemSou();}catch(e){toast((e.message||'Não foi possível identificar quem registrou.')+' A baixa foi registrada sem o nome de quem registrou.');}
  return devPor;
}
const devPorReg=()=>devPor?{n:devPor.nome,m:devPor.mat,u:devPor.user}:undefined;
function devBaixar(p,emLote){
  dev.baixas[pessoaId(p)]={n:p.n,m:p.m?String(p.m):'',k:p._k,d:hoje(),u:new Date().toISOString(),p:devPorReg(),h:emLote?1:undefined};
  devAgendar();
}
function devDesfazer(id){delete dev.baixas[id];devAgendar();}
function devDesenhar(){qUltimas();hDesenhar();}

/* ---------- bloco 1: baixa individual ---------- */
let qNovo='',qLista=[],qSel=0;
function qUltimas(){
  const box=$('#qUlt');if(!box) return;
  const L=Object.entries(dev.baixas||{}).filter(([,b])=>!b.h).sort((a,b)=>(b[1].u||'').localeCompare(a[1].u||'')).slice(0,5);   // só as individuais (as em lote têm o próprio bloco)
  if(!L.length){box.innerHTML='';return;}
  box.innerHTML='<div class="qult"><b>Últimas baixas</b><ul>'+L.map(([id,b])=>{const g=GH.get(b.k);
    return `<li${qNovo===id?' class="novo"':''}><span>${esc(titulo(b.n))}<small> · ${esc(g?g.nome:'')} · ${esc(brData(b.d).slice(0,5))}</small></span><button type="button" class="btn sm" data-undo="${esc(id)}">Desfazer</button></li>`;}).join('')+'</ul></div>';
}
function qDesenhar(){
  const box=$('#qRes');
  if(!qLista.length){box.hidden=true;return;}
  box.innerHTML=qLista.map((p,i)=>{const b=dev.baixas[pessoaId(p)],g=GH.get(p._k);
    return `<div class="qrow${i===qSel?' on':''}" data-i="${i}"><span class="qn"><b>${esc(titulo(p.n))}</b><small>${p.m?'mat. '+esc(p.m)+' · ':''}${esc(g?g.nome:'')}</small></span><label class="sw"><input type="checkbox" data-qi="${i}"${b?' checked':''} aria-label="Dar baixa no ponto de ${esc(p.n)}"><span>${b?'Baixado '+esc(brData(b.d).slice(0,5)):'Dar baixa'}</span></label></div>`;}).join('');
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
/* a baixa só acontece ao ligar o interruptor do servidor (clicar na linha não faz nada); desligar desfaz */
async function qToggle(i,marcar){
  const p=qLista[i];if(!p) return;
  const id=pessoaId(p);
  if(!marcar){
    if(!dev.baixas[id]) return;
    devDesfazer(id);qNovo='';qUltimas();hDesenhar();qDesenhar();
    toast('Baixa desfeita: '+titulo(p.n));return;
  }
  if(dev.baixas[id]) return;
  await devPorGarantir();
  devBaixar(p);
  qNovo=id;qUltimas();hDesenhar();
  if(qLista[i]===p) qDesenhar();                                       // mostra o interruptor ligado
  toast('Baixa no ponto: '+titulo(p.n));
  setTimeout(()=>{if(qLista[i]===p){$('#qBusca').value='';qLista=[];qDesenhar();$('#qBusca').focus();}},900);   // pronto para o próximo
}
$('#qRes').addEventListener('change',ev=>{const t=ev.target;if(t.dataset&&t.dataset.qi!=null) qToggle(+t.dataset.qi,t.checked);});
$('#qBusca').addEventListener('input',qBuscar);
$('#qBusca').addEventListener('keydown',ev=>{
  if(ev.key==='ArrowDown'&&qLista.length){qSel=(qSel+1)%qLista.length;qDesenhar();ev.preventDefault();}
  else if(ev.key==='ArrowUp'&&qLista.length){qSel=(qSel+qLista.length-1)%qLista.length;qDesenhar();ev.preventDefault();}
  else if(ev.key==='Enter'){
    ev.preventDefault();const p=qLista[qSel];if(!p) return;
    const b=dev.baixas[pessoaId(p)];
    if(b){toast(titulo(p.n)+' já tinha baixa em '+brData(b.d)+'.');$('#qBusca').value='';qLista=[];qDesenhar();return;}
    qToggle(qSel,true);
  }
  else if(ev.key==='Escape'){$('#qBusca').value='';qLista=[];qDesenhar();}
});
$('#qUlt').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-undo]');if(!b) return;
  devDesfazer(b.dataset.undo);qNovo='';qUltimas();hDesenhar();
});

/* ---------- bloco 2: baixa por hierarquia ---------- */
let hK='';
function hDesenhar(){
  const sel=$('#hSel'),L=devSetores();
  if(!pessoal||!GH.size){
    sel.innerHTML='<option value="">Hierarquia de pessoal não carregada</option>';sel.disabled=true;
    $('#hInfo').textContent='Abra a Hierarquia de Pessoal e clique em Atualizar do Centi.';$('#hBaixar').disabled=true;$('#hDesfazer').hidden=true;return;
  }
  sel.disabled=false;
  sel.innerHTML='<option value="">Escolha a hierarquia…</option>'+L.map(g=>{const bx=devPessoasDe(g.k).filter(p=>dev.baixas[pessoaId(p)]).length;
    return `<option value="${esc(g.k)}"${g.k===hK?' selected':''}>${esc(g.nome)} — ${bx} de ${g.n} baixados</option>`;}).join('');
  const P=hK?devPessoasDe(hK):[],falta=P.filter(p=>!dev.baixas[pessoaId(p)]).length,feitas=P.length-falta;
  $('#hInfo').innerHTML=!hK?'Escolha a hierarquia para dar baixa em todos os servidores dela de uma vez.':!P.length?'Esta hierarquia não tem servidores na Hierarquia de Pessoal.':
    falta?`<b>${falta}</b> servidor${falta===1?'':'es'} sem baixa${feitas?` · ${feitas} já baixado${feitas===1?'':'s'}`:''}.`:'Todos os servidores desta hierarquia já têm baixa.';
  $('#hBaixar').disabled=!falta;
  $('#hBaixar').textContent=falta?'Dar baixa em todos ('+falta+')':'Dar baixa em todos';
  $('#hDesfazer').hidden=!feitas;
}
$('#hSel').addEventListener('change',ev=>{hK=ev.target.value;hDesenhar();});
$('#hBaixar').addEventListener('click',async()=>{
  const k=hK;if(!k) return;
  const g=devSetores().find(x=>x.k===k),P=devPessoasDe(k).filter(p=>!dev.baixas[pessoaId(p)]);
  if(!g||!P.length) return;
  if(!confirm('Dar baixa no ponto de '+P.length+' servidor'+(P.length===1?'':'es')+' de '+g.nome+'?')) return;
  await devPorGarantir();
  P.forEach(p=>devBaixar(p,true));
  hDesenhar();qUltimas();
  toast('Baixa registrada: '+P.length+' servidor'+(P.length===1?'':'es')+' de '+g.nome+'.');
});
$('#hDesfazer').addEventListener('click',()=>{
  const k=hK;if(!k) return;
  const g=devSetores().find(x=>x.k===k),B=devPessoasDe(k).filter(p=>dev.baixas[pessoaId(p)]);
  if(!g||!B.length) return;
  if(!confirm('Desfazer a baixa de '+B.length+' servidor'+(B.length===1?'':'es')+' de '+g.nome+'?')) return;
  B.forEach(p=>devDesfazer(pessoaId(p)));
  hDesenhar();qUltimas();toast('Baixas desfeitas: '+g.nome+'.');
});

$('#dMes').addEventListener('change',devCarregar);$('#dAno').addEventListener('change',devCarregar);
window.addEventListener('pagehide',devSalvar);
(function(){
  const a=new Date();                                                     // padrão: mês atual (troque se quiser outro)
  $('#dMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#dMes').value=String(a.getMonth()+1);$('#dAno').value=a.getFullYear();
})();

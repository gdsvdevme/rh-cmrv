/* ---------- baixa no ponto: individual e por hierarquia ---------- */
let dev={itens:{},baixas:{},retiradas:{}},devT=null,devRef='',devPend=false;
const devKey=()=>{const m=+$('#dMes').value,a=+$('#dAno').value;return(a>=2000&&a<=2100)?a+'-'+String(m).padStart(2,'0'):'';};
const hoje=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const brData=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'';
/* espelhos emitidos (carimbados e salvos em Carimbar), por mês do espelho: {'2026-11':{ids:[...],u,p}}; só eles liberam baixa e retirada */
let devOk=false,devPronto=false;                                         // devOk: referência confirmada nesta entrada na tela; devPronto: dados iniciais carregados
let emit={},emitOk=false;
async function emitLer(){
  let j=null;
  try{if(dbh){const d=await dbh.doc('devolucao/emitidos').get();if(d.exists) j=d.data().json;}}catch(e){}
  if(j==null){try{j=localStorage.getItem('rhcrv-emitidos');}catch(e){}}
  try{const o=JSON.parse(j||'null');if(o&&typeof o==='object') return o;}catch(e){}
  return {};
}
async function emitSalvar(o){
  const json=JSON.stringify(o);
  if(dbh){try{await dbh.doc('devolucao/emitidos').set({json});return;}catch(e){toast('Não foi possível registrar a emissão no servidor.');}}
  try{localStorage.setItem('rhcrv-emitidos',json);}catch(e){}
}
const maisComum=L=>{const c=new Map();L.filter(Boolean).forEach(k=>c.set(k,(c.get(k)||0)+1));const t=[...c.entries()].sort((a,b)=>b[1]-a[1])[0];return t?t[0]:'';};
/* referência do espelho = o mês impresso no topo do PDF (é o que se escolhe no Centi e no Controle de devolução); sem ele, o mês do período, depois o escolhido na tela */
function ymDoPdf(){
  const ref=maisComum(entradas.map(e=>e.ref));if(ref) return ref;
  const per=maisComum(entradas.map(e=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(e.periodo||'');return m?m[3]+'-'+m[2]:'';}));if(per) return per;
  const a=+$('#cAno').value,m=+$('#cMes').value;return(a>=2000&&a<=2100&&m>=1&&m<=12)?a+'-'+String(m).padStart(2,'0'):'';
}
/* chamado ao salvar o PDF carimbado: libera a baixa dos servidores que estão nele (e só deles) no mês do espelho */
async function emitDoPdf(lista){
  const ym=ymDoPdf();if(!ym) return '';
  const ids=[];
  lista.forEach(g=>g.entradas.forEach(e=>{if(e.pessoa&&!e.pag.every(p=>over.get(p)==='skip')) ids.push(pessoaId(e.pessoa));}));
  const cur=await emitLer(),r=cur[ym]||{ids:[]};
  r.ids=[...new Set((r.ids||[]).concat(ids))];r.u=new Date().toISOString();r.p={n:PB.centi.nome||'',u:PB.centi.user||''};
  const per=maisComum(entradas.map(e=>e.periodo));if(per) r.per=per;                      // período impresso (informativo)
  cur[ym]=r;emit=cur;emitOk=true;await emitSalvar(cur);
  return ' Espelho de '+MESES[+ym.slice(5)-1]+'/'+ym.slice(0,4)+(r.per?' (período '+r.per+')':'')+' registrado como emitido: '+r.ids.length+' servidor'+(r.ids.length===1?'':'es')+' liberado'+(r.ids.length===1?'':'s')+' para baixa.';
}
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
const devEmitido=()=>emit[devRef]||null;
const devLegado=()=>Object.keys(dev.baixas||{}).length+Object.keys(dev.retiradas||{}).length>0;   // mês já usado antes desta regra: segue liberado
const devLiberado=()=>!!devEmitido()||devLegado();
function devElegivel(p){const e=devEmitido();if(!e) return devLegado();return(e.ids||[]).includes(pessoaId(p));}
const devMesNome=ym=>MESES[+ym.slice(5)-1]+'/'+ym.slice(0,4);
/* a folha fecha no mês seguinte: a referência 11/2026 traz os pontos de outubro */
const devMesPontos=ym=>{let a=+ym.slice(0,4),m=+ym.slice(5)-1;if(m<1){m=12;a--;}return a+'-'+String(m).padStart(2,'0');};
function devAviso(){
  const av=$('#dAviso'),lib=devLiberado(),e=devEmitido();
  $('#abaDev').classList.toggle('bloqueado',!lib);$('#abaDev').classList.toggle('semref',!devOk);
  const cf=$('#dConf');cf.className='refconf '+(devOk?'ok':'nao');cf.textContent=devOk?'✓ Referência confirmada':'Confirmar referência';cf.onclick=devOk?null:devPedirReferencia;
  $('#dEmit').textContent=(devRef?'Pontos de '+devMesNome(devMesPontos(devRef))+' · ':'')+(e?'espelho emitido em '+new Date(e.u).toLocaleDateString('pt-BR')+' · '+(e.ids||[]).length+' servidores':'espelho não emitido');
  if(lib){av.hidden=true;return;}
  const ms=Object.keys(emit).sort().reverse().slice(0,4);
  av.innerHTML='O espelho de <b>'+esc(devRef?devMesNome(devRef):'este mês')+'</b> ainda não foi carimbado e salvo, então não dá para dar baixa nem marcar retirada. Faça isso em <a href="#carimbar"><b>Carimbar</b></a>.'+
    (ms.length?'<div class="mm">Meses com espelho emitido: '+ms.map(m=>'<button type="button" data-ym="'+m+'">'+devMesNome(m)+'</button>').join('')+'</div>':'');
  av.hidden=false;
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
  if(!emitOk){                                                           // 1ª vez: abre no último mês com espelho emitido (não no mês do calendário)
    emit=await emitLer();emitOk=true;
    const ms=Object.keys(emit).sort();
    if(ms.length){const ym=ms[ms.length-1];$('#dMes').value=String(+ym.slice(5));$('#dAno').value=ym.slice(0,4);}
  }
  devRef=devKey();dev={itens:{},baixas:{},retiradas:{}};
  if(!devRef){devDesenhar();return;}
  const ref=devRef;let j=null;
  try{if(dbh){const d=await dbh.doc('devolucao/'+ref).get();if(d.exists) j=d.data().json;}}catch(e){toast('Não foi possível ler as marcações do servidor.');}
  if(j==null){try{j=localStorage.getItem('rhcrv-devolucao-'+ref);}catch(e){}}
  if(ref!==devRef) return;                      // o mês mudou durante a leitura
  try{const o=JSON.parse(j||'null');if(o&&typeof o==='object') dev=o;}catch(e){}
  if(!dev.itens||typeof dev.itens!=='object') dev.itens={};
  if(!dev.baixas||typeof dev.baixas!=='object') dev.baixas={};
  if(!dev.retiradas||typeof dev.retiradas!=='object') dev.retiradas={};
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
function devDesenhar(){devAviso();qUltimas();hDesenhar();rDesenhar();if(!$('#dRel').hidden) relDesenhar();}

/* ---------- bloco 1: baixa individual ---------- */
let qNovo='',qLista=[],qSel=0,qUltAberto=false;                       // 'Últimas baixas' abre recolhida
function qUltimas(){
  const box=$('#qUlt');if(!box) return;
  const L=Object.entries(dev.baixas||{}).filter(([,b])=>!b.h).sort((a,b)=>(b[1].u||'').localeCompare(a[1].u||'')).slice(0,5);   // só as individuais (as em lote têm o próprio bloco)
  if(!L.length){box.innerHTML='';return;}
  box.innerHTML='<details class="qult"'+(qUltAberto?' open':'')+'><summary>Últimas baixas <span>'+L.length+'</span></summary><ul>'+L.map(([id,b])=>{const g=GH.get(b.k);
    return `<li${qNovo===id?' class="novo"':''}><span>${esc(titulo(b.n))}<small> · ${esc(g?g.nome:'')} · ${esc(brData(b.d).slice(0,5))}</small></span><button type="button" class="btn sm" data-undo="${esc(id)}">Desfazer</button></li>`;}).join('')+'</ul></details>';
}
function qDesenhar(){
  const box=$('#qRes');
  if(!qLista.length){box.hidden=true;return;}
  box.innerHTML=qLista.map((p,i)=>{const b=dev.baixas[pessoaId(p)],g=GH.get(p._k);
    const ok=devElegivel(p)||b;
    return `<div class="qrow${i===qSel?' on':''}" data-i="${i}"><span class="qn"><b>${esc(titulo(p.n))}</b><small>${p.m?'mat. '+esc(p.m)+' · ':''}${esc(g?g.nome:'')}</small></span>${ok?'':'<span class="off">sem espelho carimbado neste mês</span>'}<label class="sw"${ok?'':' hidden'}><input type="checkbox" data-qi="${i}"${b?' checked':''} aria-label="Dar baixa no ponto de ${esc(p.n)}"><span>${b?'Baixado '+esc(brData(b.d).slice(0,5)):'Dar baixa'}</span></label></div>`;}).join('');
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
  if(!devGuardaRef()){qDesenhar();return;}
  const p=qLista[i];if(!p) return;
  const id=pessoaId(p);
  if(!marcar){
    if(!dev.baixas[id]) return;
    devDesfazer(id);qNovo='';qUltimas();hDesenhar();qDesenhar();
    toast('Baixa desfeita: '+titulo(p.n));return;
  }
  if(dev.baixas[id]) return;
  if(!devLiberado()||!devElegivel(p)){toast(titulo(p.n)+' não tem espelho carimbado neste mês.');qDesenhar();return;}
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
$('#qUlt').addEventListener('toggle',ev=>{if(ev.target.tagName==='DETAILS') qUltAberto=ev.target.open;},true);
$('#qUlt').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-undo]');if(!b) return;
  if(!devGuardaRef()) return;
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
  const elegiveis=k=>devPessoasDe(k).filter(p=>devElegivel(p)||dev.baixas[pessoaId(p)]);
  sel.innerHTML='<option value="">Escolha a hierarquia…</option>'+L.map(g=>{const E=elegiveis(g.k),bx=E.filter(p=>dev.baixas[pessoaId(p)]).length;
    return `<option value="${esc(g.k)}"${g.k===hK?' selected':''}>${esc(g.nome)} — ${bx} de ${E.length} baixados</option>`;}).join('');
  const T=hK?devPessoasDe(hK):[],P=hK?elegiveis(hK):[],falta=P.filter(p=>!dev.baixas[pessoaId(p)]).length,feitas=P.length-falta,semEsp=T.length-P.length;
  $('#hInfo').innerHTML=!hK?'Escolha a hierarquia para dar baixa em todos os servidores dela de uma vez.':!T.length?'Esta hierarquia não tem servidores na Hierarquia de Pessoal.':!P.length?'Nenhum servidor desta hierarquia tem espelho carimbado neste mês.':
    (falta?`<b>${falta}</b> servidor${falta===1?'':'es'} sem baixa${feitas?` · ${feitas} já baixado${feitas===1?'':'s'}`:''}.`:'Todos os servidores desta hierarquia já têm baixa.')+(semEsp?` ${semEsp} sem espelho carimbado neste mês (não entram).`:'');
  $('#hBaixar').disabled=!falta;
  $('#hBaixar').textContent=falta?'Dar baixa em todos ('+falta+')':'Dar baixa em todos';
  $('#hDesfazer').hidden=!feitas;
}
$('#hSel').addEventListener('change',ev=>{hK=ev.target.value;hDesenhar();});
$('#hBaixar').addEventListener('click',async()=>{
  if(!devGuardaRef()) return;
  const k=hK;if(!k) return;
  if(!devLiberado()){toast('O espelho deste mês ainda não foi carimbado e salvo.');return;}
  const g=devSetores().find(x=>x.k===k),P=devPessoasDe(k).filter(p=>devElegivel(p)&&!dev.baixas[pessoaId(p)]);
  if(!g||!P.length) return;
  if(!confirm('Dar baixa no ponto de '+P.length+' servidor'+(P.length===1?'':'es')+' de '+g.nome+'?')) return;
  await devPorGarantir();
  P.forEach(p=>devBaixar(p,true));
  hDesenhar();qUltimas();
  toast('Baixa registrada: '+P.length+' servidor'+(P.length===1?'':'es')+' de '+g.nome+'.');
});
$('#hDesfazer').addEventListener('click',()=>{
  if(!devGuardaRef()) return;
  const k=hK;if(!k) return;
  const g=devSetores().find(x=>x.k===k),B=devPessoasDe(k).filter(p=>dev.baixas[pessoaId(p)]);
  if(!g||!B.length) return;
  if(!confirm('Desfazer a baixa de '+B.length+' servidor'+(B.length===1?'':'es')+' de '+g.nome+'?')) return;
  B.forEach(p=>devDesfazer(pessoaId(p)));
  hDesenhar();qUltimas();toast('Baixas desfeitas: '+g.nome+'.');
});

/* ---------- bloco 3: retirada do espelho impresso (qual setor veio buscar) ---------- */
function rDesenhar(){
  const box=$('#rLista');if(!box) return;
  if(!pessoal||!GH.size){$('#rCont').textContent='';box.innerHTML='<p class="muted" style="margin:0">Os setores vêm da Hierarquia de Pessoal. Abra-a e clique em <b>Atualizar do Centi</b>.</p>';return;}
  const L=devSetores(),R=dev.retiradas||{},feitos=L.filter(g=>R[g.k]).length;
  $('#rCont').innerHTML='<b>'+feitos+'</b> de '+L.length+' setores já retiraram o espelho.';
  box.innerHTML=L.map(g=>{const r=R[g.k];
    const ok=!!r||devPessoasDe(g.k).some(devElegivel);
    return `<div class="rrow${r?' ok':''}" data-k="${esc(g.k)}"><span class="rn"><b>${esc(g.nome)}</b>${r&&r.p&&r.p.n?'<small>registrado por '+esc(titulo(r.p.n))+'</small>':''}</span>${r?`<input type="date" data-rd value="${esc(r.d||'')}" aria-label="Data da retirada de ${esc(g.nome)}">`:''}<label class="sw"><input type="checkbox" data-r${r?' checked':''}${ok?'':' disabled'} aria-label="${esc(g.nome)} retirou o espelho impresso"><span>${r?'Retirou':ok?'Não retirou':'Sem espelho emitido'}</span></label></div>`;}).join('');
}
$('#rLista').addEventListener('change',async ev=>{
  const t=ev.target,row=t.closest('.rrow');if(!row) return;
  if(!devGuardaRef()){rDesenhar();return;}
  const k=row.dataset.k;
  if(t.dataset.rd!==undefined){                                         // ajustar a data
    if(t.value&&dev.retiradas[k]){dev.retiradas[k].d=t.value;dev.retiradas[k].u=new Date().toISOString();devAgendar();}
    return;
  }
  if(t.dataset.r===undefined) return;
  if(t.checked){
    if(!devLiberado()||!devPessoasDe(k).some(devElegivel)){t.checked=false;toast('Este setor não tem espelho carimbado neste mês.');return;}
    t.disabled=true;await devPorGarantir();
    dev.retiradas[k]={d:hoje(),u:new Date().toISOString(),p:devPorReg()};
    const g=devSetores().find(x=>x.k===k);toast('Retirada registrada: '+(g?g.nome:'setor')+'.');
  }else delete dev.retiradas[k];
  devAgendar();rDesenhar();
});
/* ---------- confirmação da referência: pedida a cada entrada na tela, antes de qualquer baixa ---------- */
function devGuardaRef(){
  if(devOk) return true;
  toast('Confirme a referência (mês e ano) antes de dar baixa.');devPedirReferencia();return false;
}
function rfAtualizar(){
  const a=+$('#rfAno').value,m=+$('#rfMes').value,box=$('#rfInfo');
  const ym=(a>=2000&&a<=2100)?a+'-'+String(m).padStart(2,'0'):'',e=ym?emit[ym]:null,ms=Object.keys(emit).sort(),ult=ms[ms.length-1];
  if(!ym){box.className='aviso';box.textContent='Informe um ano válido.';$('#rfPontos').textContent='';$('#rfOk').disabled=true;return;}
  $('#rfOk').disabled=false;
  $('#rfPontos').innerHTML='Referência <b>'+esc(devMesNome(ym))+'</b> → pontos de <b>'+esc(devMesNome(devMesPontos(ym)))+'</b> <span>(a folha fecha no mês seguinte)</span>';
  const outro=ult&&ult!==ym?` O último espelho emitido foi o de <b>${esc(devMesNome(ult))}</b>.`:'';
  if(e){box.className='ok';box.innerHTML='Espelho de <b>'+esc(devMesNome(ym))+'</b>'+(e.per?' (período '+esc(e.per)+')':'')+' emitido em '+esc(new Date(e.u).toLocaleDateString('pt-BR'))+' · '+(e.ids||[]).length+' servidores.'+outro;}
  else{box.className='aviso';box.innerHTML='O espelho de <b>'+esc(devMesNome(ym))+'</b> ainda não foi carimbado e salvo, então não será possível dar baixa.'+outro+(ult&&!e?'<div style="margin-top:8px"><button type="button" class="btn sm" id="rfMover" data-de="'+ult+'" data-para="'+ym+'">Já emiti este: mover o registro de '+esc(devMesNome(ult))+' para '+esc(devMesNome(ym))+'</button></div>':'');}
}
function devPedirReferencia(){
  const d=$('#dlgRef');if(d.open) return;
  $('#rfMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#rfMes').value=$('#dMes').value;$('#rfAno').value=$('#dAno').value;
  rfAtualizar();d.showModal();
}
/* corrige um registro feito pelo mês do período (regra antiga): passa os servidores liberados de um mês para o outro */
$('#rfInfo').addEventListener('click',async ev=>{
  const b=ev.target.closest('#rfMover');if(!b) return;
  const de=b.dataset.de,para=b.dataset.para;
  if(!confirm('Mover o espelho emitido registrado como '+devMesNome(de)+' para '+devMesNome(para)+'?\n\nUse só se o espelho que você já carimbou e salvou é o de '+devMesNome(para)+'.')) return;
  const cur=await emitLer();if(!cur[de]) return;
  const r=cur[para]||{ids:[]};r.ids=[...new Set((r.ids||[]).concat(cur[de].ids||[]))];r.u=cur[de].u;r.p=cur[de].p;if(cur[de].per) r.per=cur[de].per;
  cur[para]=r;delete cur[de];emit=cur;await emitSalvar(cur);rfAtualizar();
  toast('Registro movido: o espelho agora consta como '+devMesNome(para)+'.');
});
$('#rfMes').addEventListener('change',rfAtualizar);$('#rfAno').addEventListener('input',rfAtualizar);
$('#rfOk').addEventListener('click',async()=>{
  const a=+$('#rfAno').value,m=$('#rfMes').value;if(!(a>=2000&&a<=2100)) return;
  const mudou=$('#dMes').value!==m||+$('#dAno').value!==a;
  $('#dMes').value=m;$('#dAno').value=a;
  $('#dlgRef').close();
  if(mudou) await devCarregar();
  devOk=true;devDesenhar();
  toast('Referência confirmada: '+MESES[+m-1]+'/'+a+'.');
});
$('#rfVoltar').addEventListener('click',()=>{$('#dlgRef').close();location.hash='';});                  // desistiu: volta ao menu
$('#dlgRef').addEventListener('cancel',ev=>{ev.preventDefault();});                                    // Esc não fecha sem confirmar

/* ---------- relatório do mês (aba lateral): abre o relatório e recolhe os blocos de baixa ---------- */
let relFiltro='todos',relBusca='';const relAberto=new Set();
function relDados(){
  const R=dev.retiradas||{},B=dev.baixas||{};
  return devSetores().map(g=>{
    const E=devPessoasDe(g.k).filter(p=>devElegivel(p)||B[pessoaId(p)]);
    const feitos=E.filter(p=>B[pessoaId(p)]),falta=E.filter(p=>!B[pessoaId(p)]);
    return {g,E,feitos,falta,ret:R[g.k]||null};
  }).filter(x=>x.E.length||x.ret);
}
function relDesenhar(){
  const D=relDados();
  const tot=D.reduce((s,x)=>s+x.E.length,0),bx=D.reduce((s,x)=>s+x.feitos.length,0),ret=D.filter(x=>x.ret).length;
  const mes=devRef?devMesNome(devRef):'';
  $('#relCards').innerHTML=`<div><small>Espelhos emitidos</small><b>${tot}</b></div><div class="ok"><small>Com baixa</small><b>${bx}</b></div><div class="pend"><small>Sem baixa</small><b>${tot-bx}</b></div><div><small>Setores que retiraram</small><b>${ret}</b> <span class="muted">de ${D.length}</span></div>`;
  const bt=(v,t,n)=>`<button type="button" class="${relFiltro===v?'on':''}" data-rf="${v}">${t} <b>${n}</b></button>`;
  $('#relFlt').innerHTML=bt('todos','Todos',D.length)+bt('falta','Faltam baixas',D.filter(x=>x.falta.length).length)+bt('semret','Não retiraram',D.filter(x=>!x.ret).length)+bt('ok','Completos',D.filter(x=>!x.falta.length&&x.ret).length);
  const q=norm(relBusca);
  const V=D.filter(x=>(relFiltro==='todos'||(relFiltro==='falta'?x.falta.length:relFiltro==='semret'?!x.ret:(!x.falta.length&&x.ret)))&&(!q||norm(x.g.nome).includes(q)));
  $('#relLista').innerHTML=!D.length?`<p class="muted" style="padding:16px;margin:0">${mes?'Nenhum espelho emitido em '+esc(mes)+' ainda.':'Escolha o mês.'}</p>`:
    V.length?V.map(x=>{const k=x.g.k,aberto=relAberto.has(k),pc=x.E.length?Math.round(x.feitos.length*100/x.E.length):0;
      return `<div class="relrow${aberto?' aberto':''}" data-k="${esc(k)}"><button type="button" class="relh" aria-expanded="${aberto}"><span class="rn">${esc(x.g.nome)}</span><div class="prog"><div class="bar"><i style="width:${pc}%"></i></div><span>${x.feitos.length}/${x.E.length}</span></div><span class="pill ${x.falta.length?'pend':'ok'}">${x.falta.length?x.falta.length+' sem baixa':'Baixas completas'}</span><span class="pill ${x.ret?'ok':'nao'}">${x.ret?'Retirou '+esc(brData(x.ret.d).slice(0,5)):'Não retirou'}</span></button>`+
        (aberto?`<div class="reldet"><div><b>Sem baixa (${x.falta.length})</b><ul>${x.falta.map(p=>`<li>${esc(titulo(p.n))}${p.m?' <small>mat. '+esc(p.m)+'</small>':''}</li>`).join('')||'<li class="muted">Ninguém.</li>'}</ul></div><div><b>Com baixa (${x.feitos.length})</b><ul>${x.feitos.map(p=>{const b=dev.baixas[pessoaId(p)];return `<li>${esc(titulo(p.n))} <small>${esc(brData(b.d).slice(0,5))}${b.p&&b.p.n?' · '+esc(titulo(b.p.n)):''}</small></li>`;}).join('')||'<li class="muted">Ninguém.</li>'}</ul></div></div>`:'')+'</div>';}).join(''):'<p class="muted" style="padding:16px;margin:0">Nenhum setor nesta lista.</p>';
}
function relAlternar(ligar){
  const rel=$('#dRel'),btn=$('#relBtn');
  const on=ligar==null?rel.hidden:ligar;
  rel.hidden=!on;$('#dBaixas').hidden=on;                                // abre o relatório e recolhe as baixas (e vice-versa)
  btn.textContent=on?'Voltar às baixas':'Ver relatório';btn.setAttribute('aria-expanded',on?'true':'false');
  if(on) relDesenhar();
}
$('#relBtn').addEventListener('click',()=>relAlternar());
$('#relFlt').addEventListener('click',ev=>{const b=ev.target.closest('[data-rf]');if(!b) return;relFiltro=b.dataset.rf;relDesenhar();});
$('#relBusca').addEventListener('input',ev=>{relBusca=ev.target.value;relDesenhar();});
$('#relLista').addEventListener('click',ev=>{const h=ev.target.closest('.relh');if(!h) return;const k=h.closest('.relrow').dataset.k;if(relAberto.has(k)) relAberto.delete(k);else relAberto.add(k);relDesenhar();});
$('#relCsv').addEventListener('click',()=>{
  const D=relDados();if(!D.length){toast('Não há espelhos emitidos neste mês.');return;}
  const c=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const rows=[['Setor ou gabinete','Servidor','Matrícula','Cargo','Baixa no ponto','Data da baixa','Baixa registrada por','Setor retirou o espelho impresso','Data da retirada']];
  D.forEach(x=>x.E.forEach(p=>{const b=dev.baixas[pessoaId(p)];rows.push([x.g.nome,titulo(p.n),p.m||'',p.c?titulo(p.c):'',b?'Sim':'Não',b?brData(b.d):'',b&&b.p&&b.p.n?titulo(b.p.n):'',x.ret?'Sim':'Não',x.ret?brData(x.ret.d):'']);}));
  const csv='﻿'+rows.map(r=>r.map(c).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='relatorio-devolucao-espelhos-'+(devRef||'mes')+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
});
$('#dAviso').addEventListener('click',ev=>{const b=ev.target.closest('[data-ym]');if(!b) return;$('#dMes').value=String(+b.dataset.ym.slice(5));$('#dAno').value=b.dataset.ym.slice(0,4);devCarregar();});
const devTrocouRef=()=>{devOk=false;devCarregar().then(devPedirReferencia);};   // escolher outro mês também pede confirmação
$('#dMes').addEventListener('change',devTrocouRef);$('#dAno').addEventListener('change',devTrocouRef);
window.addEventListener('pagehide',devSalvar);
(function(){
  const a=new Date();                                                     // padrão: mês atual (troque se quiser outro)
  $('#dMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#dMes').value=String(a.getMonth()+1);$('#dAno').value=a.getFullYear();
})();

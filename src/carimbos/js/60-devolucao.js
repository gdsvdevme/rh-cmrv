/* ---------- controle de devolução ---------- */
const DST={nao:'Não devolvido',ok:'Devolvido ao RH',pend:'Devolvido com pendências'};
const DST_EM={ok:'devolvido ao RH',pend:'devolvido com pendências'};   // frase da linha do setor (não dá para só baixar as maiúsculas: "RH")
let dev={itens:{}},devFiltro='todos',devBusca='',devT=null,devRef='',devPend=false;
const devKey=()=>{const m=+$('#dMes').value,a=+$('#dAno').value;return(a>=2000&&a<=2100)?a+'-'+String(m).padStart(2,'0'):'';};
const hoje=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const brData=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'';
function devSetores(){
  const cont=new Map();
  ((pessoal&&pessoal.pessoas)||[]).forEach(p=>{if(p._k) cont.set(p._k,(cont.get(p._k)||0)+1);});
  return [...GH.values()].sort((a,b)=>a.ramo-b.ramo||a.sort.localeCompare(b.sort)).map(g=>({k:g.k,nome:g.nome,n:cont.get(g.k)||0}));
}
const devSit=k=>(dev.itens[k]&&dev.itens[k].s)||'nao';
async function devSalvar(){
  clearTimeout(devT);if(!devPend||!devRef) return;devPend=false;
  const json=JSON.stringify(dev),ref=devRef;
  if(dbh){try{await dbh.doc('devolucao/'+ref).set({json});return;}catch(e){toast('Não foi possível salvar no servidor.');}}
  try{localStorage.setItem('rhcrv-devolucao-'+ref,json);}catch(e){}
}
function devAgendar(){devPend=true;clearTimeout(devT);devT=setTimeout(devSalvar,600);}
let devLimpou=false;
async function devCarregar(){
  await devSalvar();
  if(!devLimpou){devLimpou=true;try{if(PB.recibos.ok) await PB.recibos.limparVencidos();}catch(e){}}
  devRef=devKey();dev={itens:{}};
  if(!devRef){devDesenhar();return;}
  const ref=devRef;let j=null;
  try{if(dbh){const d=await dbh.doc('devolucao/'+ref).get();if(d.exists) j=d.data().json;}}catch(e){toast('Não foi possível ler as marcações do servidor.');}
  if(j==null){try{j=localStorage.getItem('rhcrv-devolucao-'+ref);}catch(e){}}
  if(ref!==devRef) return;                      // o mês mudou durante a leitura
  try{const o=JSON.parse(j||'null');if(o&&o.itens&&typeof o.itens==='object') dev=o;}catch(e){}
  devDesenhar();
}
function devLinha(g){
  const it=dev.itens[g.k]||{},s=it.s||'nao';
  return `<div class="drow ${s}" data-k="${esc(g.k)}">
    <div class="nm"><b>${esc(g.nome)}</b><span>${g.n} servidor${g.n===1?'':'es'}${it.d?' · '+esc(DST_EM[s])+' em '+esc(brData(it.d)):''}</span></div>
    <div class="seg" role="group" aria-label="Situação de ${esc(g.nome)}">${['ok','pend','nao'].map(v=>`<button type="button" data-s="${v}" class="${s===v?'on':''}" aria-pressed="${s===v}">${DST[v]}</button>`).join('')}</div>
    <div class="obs">${s!=='nao'?`<input type="date" data-f="d" value="${esc(it.d||'')}" aria-label="Data da devolução">`:''}<textarea data-f="o" rows="1" placeholder="${s==='pend'?'Descreva as pendências…':'Observação (opcional)'}" aria-label="Observação de ${esc(g.nome)}">${esc(it.o||'')}</textarea></div>
    ${devRh(it)}
  </div>`;
}
/* entrega do espelho pelo RH ao setor: marca com data, quem marcou (nome e matrícula) e o recibo em PDF (opcional, guardado por 90 dias) */
const DIAS_RECIBO=90;
function devRh(it){
  const e=it.e,agora=new Date().toISOString();
  let h='<div class="rh"><label class="ck2"><input type="checkbox" data-e="chk"'+(e?' checked':'')+'> Espelho entregue pelo RH ao setor</label>';
  if(e){
    h+=`<input type="date" data-e="d" value="${esc(e.d||'')}" aria-label="Data da entrega pelo RH"><span class="quem">registrado por ${esc(e.p&&e.p.n||'—')}${e.p&&e.p.m?' (mat. '+esc(e.p.m)+')':''}</span>`;
    const r=e.r;
    if(r&&r.x>agora) h+=`<span class="rec"><a href="#" data-e="ver">Recibo (PDF)</a><small class="muted">guardado até ${esc(brData(r.x.slice(0,10)))}</small><button class="btn sm" type="button" data-e="anexar">Trocar</button><button class="btn sm danger" type="button" data-e="rem">Remover</button></span>`;
    else if(r) h+=`<span class="rec exp">Recibo removido do servidor (prazo de ${DIAS_RECIBO} dias)</span><button class="btn sm" type="button" data-e="anexar">Anexar outro</button>`;
    else h+='<button class="btn sm" type="button" data-e="anexar">Anexar recibo (PDF, opcional)</button>';
    h+='<input type="file" accept="application/pdf,.pdf" data-e="file" hidden>';
  }
  return h+'</div>';
}
function devResumo(L){
  const c={ok:0,pend:0,nao:0};L.forEach(g=>c[devSit(g.k)]++);
  const bt=(v,t,n,cl)=>`<button type="button" class="${cl||''} ${devFiltro===v?'on':''}" data-flt="${v}"><small>${t}</small><b>${n}</b></button>`;
  $('#dSum').innerHTML=bt('todos','Todos os setores',L.length,'')+bt('ok','Devolvidos ao RH',c.ok,'ok')+bt('pend','Com pendências',c.pend,'pend')+bt('nao','Não devolvidos',c.nao,'nao');
}
function devDesenhar(){
  const box=$('#dLista');
  if(!pessoal||!GH.size){devResumo([]);box.innerHTML='<div class="empty" style="padding:24px"><h2>Hierarquia de pessoal não carregada</h2><p class="muted">Os setores vêm da Hierarquia de Pessoal. Abra-a e clique em <b>Atualizar do Centi</b> ao menos uma vez.</p></div>';return;}
  const L=devSetores();devResumo(L);
  const q=norm(devBusca);
  const V=L.filter(g=>(devFiltro==='todos'||devSit(g.k)===devFiltro)&&(!q||norm(g.nome).includes(q)));
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
$('#dLista').addEventListener('click',ev=>{
  const b=ev.target.closest('.seg button');if(!b) return;
  const row=b.closest('.drow'),k=row.dataset.k;
  const o=row.querySelector('textarea');
  devMudar(k,{s:b.dataset.s,o:o?o.value:''});
  const g=devSetores().find(x=>x.k===k);if(!g) return;
  if(devFiltro!=='todos'&&devFiltro!==devSit(k)){devDesenhar();return;}     // saiu do filtro atual
  row.outerHTML=devLinha(g);devResumo(devSetores());
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
        if(it.e&&it.e.r&&it.e.r.x>new Date().toISOString()){
          if(!confirm('Desmarcar a entrega também apaga o recibo anexado. Continuar?')){t.checked=true;return;}
          try{await PB.recibos.apagar(it.e.r.id);}catch(e){toast('Não foi possível apagar o recibo do servidor.');t.checked=true;return;}
        }
        devEntrega(k,()=>null);
      }
      devRefaz(row,k);
    }else if(f==='d'){
      if(t.value) devEntrega(k,e=>Object.assign(e,{d:t.value}));
    }else if(f==='file'){
      const file=t.files&&t.files[0];t.value='';if(!file) return;
      if(!(/pdf$/i.test(file.name)||file.type==='application/pdf')){toast('Escolha um arquivo PDF.');return;}
      if(file.size>10*1024*1024){toast('O PDF tem mais de 10 MB. Reduza o arquivo e tente de novo.');return;}
      if(!PB.recibos.ok){toast('Para anexar o recibo é preciso estar conectado ao servidor.');return;}
      const g=devSetores().find(x=>x.k===k),por=it.e&&it.e.p?{nome:it.e.p.n,mat:it.e.p.m,user:it.e.p.u}:await devQuemSou();
      carga(true,'Enviando o recibo…',file.name,0.4);
      try{
        const r=await PB.recibos.enviar(devRef,g?g.nome:k,file,por,DIAS_RECIBO);
        const antigo=it.e&&it.e.r;
        devEntrega(k,e=>Object.assign(e,{r:{id:r.id,f:file.name,x:r.expira_em}}));
        if(antigo&&antigo.id){try{await PB.recibos.apagar(antigo.id);}catch(e){}}
        toast('Recibo anexado. Fica guardado por '+DIAS_RECIBO+' dias.');
      }finally{carga(false);}
      devRefaz(row,k);
    }
  }catch(e){toast(e.message||String(e));devRefaz(row,k);}
});
$('#dLista').addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-e]');if(!b||b.tagName==='INPUT') return;
  const f=b.dataset.e,row=b.closest('.drow'),k=row.dataset.k,it=dev.itens[k]||{};
  if(f==='anexar'){ev.preventDefault();row.querySelector('input[data-e=file]').click();return;}
  if(f==='ver'){
    ev.preventDefault();
    try{const u=await PB.recibos.url(it.e.r);window.open(u,'_blank','noopener');}
    catch(e){toast('Não foi possível abrir o recibo: '+(e.message||e));}
    return;
  }
  if(f==='rem'){
    ev.preventDefault();if(!confirm('Remover o recibo anexado?')) return;
    try{await PB.recibos.apagar(it.e.r.id);}catch(e){toast('Não foi possível apagar o recibo do servidor.');return;}
    devEntrega(k,e=>{delete e.r;return e;});devRefaz(row,k);
  }
});
$('#dSum').addEventListener('click',ev=>{const b=ev.target.closest('[data-flt]');if(!b) return;devFiltro=b.dataset.flt;devDesenhar();});
$('#dBusca').addEventListener('input',ev=>{devBusca=ev.target.value;devDesenhar();});
$('#dMes').addEventListener('change',devCarregar);$('#dAno').addEventListener('change',devCarregar);
window.addEventListener('pagehide',devSalvar);
$('#dCsv').addEventListener('click',()=>{
  if(!GH.size){toast('A hierarquia de pessoal não está carregada.');return;}
  const c=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const rows=[['Setor','Servidores','Situação','Data','Observação','Entregue pelo RH','Data da entrega pelo RH','Registrado por','Recibo anexado']].concat(devSetores().map(g=>{const it=dev.itens[g.k]||{},e=it.e||null,ag=new Date().toISOString();return [g.nome,g.n,DST[devSit(g.k)],brData(it.d),(it.o||'').replace(/\s*\n\s*/g,' '),e?'Sim':'Não',e?brData(e.d):'',e&&e.p?e.p.n+(e.p.m?' (mat. '+e.p.m+')':''):'',e&&e.r?(e.r.x>ag?'Sim':'Removido após '+DIAS_RECIBO+' dias'):''];}));
  const csv='﻿'+rows.map(r=>r.map(c).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='controle-devolucao-espelhos-'+(devRef||'mes')+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
});
(function(){
  const a=new Date();                                                     // padrão: mês atual (troque se quiser outro)
  $('#dMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#dMes').value=String(a.getMonth()+1);$('#dAno').value=a.getFullYear();
})();


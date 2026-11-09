/* ---------- leitura do PDF ---------- */
async function iniciarPdfjs(){
  if(iniciarPdfjs.ok) return;
  try{const r=await fetch(WORKER_URL);if(!r.ok) throw 0;pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([await r.text()],{type:'text/javascript'}));}
  catch(e){pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER_URL;}
  iniciarPdfjs.ok=true;
}
function lerCabecalho(txt){
  const m=/\b(\d{4,})\s+-\s+(.+?)\s+CPF:/.exec(txt);if(!m) return null;
  const cargo=/Cargo:\s*(.+?)(?:\s+(?:Órgão|Lotação|Horário|Período|Dossiê):|$)/.exec(txt),per=/Período:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/.exec(txt);
  return {mat:m[1],nome:titulo(m[2]),cargo:cargo?titulo(cargo[1]):'',periodo:per?per[1]+' a '+per[2]:''};
}
/* ---------- gerar o espelho direto do Centi (FP170) ---------- */
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
(function iniciarCentiUi(){
  const a=new Date();                                                       // padrão: mês atual (troque se quiser outro)
  $('#cMes').innerHTML=MESES.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
  $('#cMes').value=String(a.getMonth()+1);$('#cAno').value=a.getFullYear();
  $('#cGerar').addEventListener('click',gerarDoCenti);
  $('#cUm').addEventListener('change',()=>{$('#cPessoaBox').hidden=!$('#cUm').checked;if(!$('#cUm').checked) pessoaUnica=null;rotuloGerar();if($('#cUm').checked&&!pessoaUnica) $('#cBusca').focus();});
  $('#cTrocar').addEventListener('click',()=>{pessoaUnica=null;rotuloGerar();$('#cBusca').focus();});
  let tb=null;
  $('#cBusca').addEventListener('input',()=>{clearTimeout(tb);tb=setTimeout(buscarPessoa,450);});
  $('#cRes').addEventListener('click',ev=>{const li=ev.target.closest('li[data-i]');if(!li) return;pessoaUnica=achados[+li.dataset.i];$('#cBusca').value='';$('#cRes').hidden=true;rotuloGerar();});
})();
/* ---------- gerar só de uma pessoa ---------- */
let pessoaUnica=null,achados=[],proximaUnica=false,origemUnica=false;   // origemUnica: o PDF aberto foi gerado de uma pessoa só (sai sem capa)
function rotuloGerar(){
  const p=pessoaUnica,um=$('#cUm').checked;
  $('#cEscolhida').hidden=!p;$('#cBuscaBox').hidden=!!p;
  if(p) $('#cEscNome').innerHTML='<b>'+esc(titulo(p.Nome))+'</b><br><span class="muted">mat. '+esc(p.Matricula)+(p.Cargo?' · '+esc(titulo(p.Cargo)):'')+'</span>';
  $('#cGerar').textContent=um?(p?'Gerar espelho de '+titulo(p.Nome).split(' ')[0]+' no Centi':'Escolha a pessoa acima'):'Gerar espelhos no Centi';
}
/* matrículas ativas na referência (cubo funcionário do Centi), guardadas por mês; null se não der para consultar */
const ativosMesCache=new Map();
async function matriculasAtivasDoMes(mes,ano){
  if(!(mes>=1&&mes<=12&&ano>=2000&&ano<=2100)) return null;
  const k=mes+'/'+ano;
  if(ativosMesCache.has(k)) return ativosMesCache.get(k);
  try{
    const r=await PB.centi.cubo(mes,ano),set=new Set(((r&&r.Data)||[]).map(x=>digs(x.MATRICULA)).filter(Boolean));
    if(!set.size) return null;
    ativosMesCache.set(k,set);return set;
  }catch(e){return null;}
}
async function buscarPessoa(){
  const t=$('#cBusca').value.trim(),box=$('#cRes');
  if(t.length<3&&!/^\d{1,12}$/.test(t)){box.hidden=true;return;}
  try{
    if(!PB.centi.user){const h=await PB.connect();if(h&&!dbh) dbh=h;}
    if(!PB.centi.user) return;
    const r=await PB.centi.licencaBusca(t);
    if($('#cBusca').value.trim()!==t) return;                          // a pessoa já digitou outra coisa
    /* só ativos, e só quem consta no quadro do mês escolhido (quem tem espelho nele): rescindidos e inativos ficam de fora */
    let lista=((r&&r.Data)||[]).filter(x=>/^ativo$/i.test(x.Situacao||''));
    const ativosMes=await matriculasAtivasDoMes(+$('#cMes').value,+$('#cAno').value);
    if(ativosMes) lista=lista.filter(x=>ativosMes.has(digs(x.Matricula)));
    if($('#cBusca').value.trim()!==t) return;
    achados=lista.slice(0,10);
    box.innerHTML=achados.length?'<ul class="g-l">'+achados.map((x,i)=>`<li data-i="${i}" style="padding-left:12px"><div class="nm">${esc(titulo(x.Nome))}${/^ativo$/i.test(x.Situacao)?'':'<span class="tag nao" style="margin-left:6px;display:inline-block;width:auto">'+esc(x.Situacao||'inativo')+'</span>'}<span>mat. ${esc(x.Matricula)}${x.Cargo?' · '+esc(titulo(x.Cargo)):''}</span></div></li>`).join('')+'</ul>':'<div class="empty" style="padding:14px">Ninguém encontrado.</div>';
    box.hidden=false;
  }catch(e){toast('Não foi possível buscar: '+(e&&e.message||e));}
}
/* deixa só as páginas da pessoa (o Centi pode devolver o órgão inteiro); null se ela não tem espelho */
async function soDaPessoa(pdf,p){
  await iniciarPdfjs();
  const doc=await pdfjsLib.getDocument({data:pdf.slice()}).promise,manter=[];let atual=false;
  for(let i=1;i<=doc.numPages;i++){
    const tc=await (await doc.getPage(i)).getTextContent();
    const h=lerCabecalho(tc.items.map(x=>x.str).join(' ').replace(/\s+/g,' '));
    if(h) atual=(!!digs(h.mat)&&digs(h.mat)===digs(p.Matricula))||norm(h.nome)===norm(p.Nome);
    if(atual) manter.push(i-1);
  }
  if(!manter.length) return null;
  if(manter.length===doc.numPages) return pdf;
  const src=await PDFLib.PDFDocument.load(pdf,{ignoreEncryption:true}),out=await PDFLib.PDFDocument.create();
  (await out.copyPages(src,manter)).forEach(pg=>out.addPage(pg));
  return out.save();
}
async function gerarDoCenti(){
  const mes=+$('#cMes').value,ano=+$('#cAno').value,um=$('#cUm').checked?pessoaUnica:null;
  if(!(ano>=2000&&ano<=2100)){toast('Informe um ano válido.');return;}
  if($('#cUm').checked&&!um){toast('Escolha a pessoa na busca.');$('#cBusca').focus();return;}
  if(!PB.centi.user){const h=await PB.connect();if(h&&!dbh) dbh=h;}
  if(!PB.centi.user){toast('Entre com o acesso do Centi para gerar o espelho.');return;}
  $('#cGerar').disabled=true;
  carga(true,'Gerando no Centi…','Espelho de ponto de '+(um?titulo(um.Nome)+' · ':'')+MESES[mes-1]+'/'+ano+' (FP170).'+(um?'':' Leva cerca de 1 minuto.'),0.15);
  try{
    let pdf;
    try{pdf=await PB.centi.espelho(mes,ano,um?um.Id:'');}
    catch(e){
      if(e.status!==502&&e.status!==504) throw e;                       // falha momentânea do servidor ou do Centi: tenta mais uma vez
      carga(true,'Gerando no Centi…','O servidor não respondeu; tentando de novo. Leva cerca de 1 minuto.',0.15);
      pdf=await PB.centi.espelho(mes,ano,um?um.Id:'');
    }
    if(um){
      carga(true,null,'Separando as páginas de '+titulo(um.Nome)+'…',0.7);
      pdf=await soDaPessoa(pdf,um);
      if(!pdf){carga(false);toast(titulo(um.Nome)+' não tem espelho de '+MESES[mes-1]+'/'+ano+' no Centi.');return;}
    }
    const nome='Espelho-de-ponto-'+String(mes).padStart(2,'0')+'-'+ano+(um?'-'+nomeSeguro(um.Nome):'')+'.pdf';
    await iniciarPdfjs();
    const doc=await pdfjsLib.getDocument({data:pdf.slice()}).promise;
    if(!um&&doc.numPages<2){carga(false);toast('O Centi ainda não tem o espelho de '+MESES[mes-1]+'/'+ano+' (veio sem servidores). Escolha outro mês.');return;}
    carga(false);
    proximaUnica=!!um;
    await abrirPdf(new File([pdf],nome,{type:'application/pdf'}));
  }catch(e){
    carga(false);console.error(e);
    toast('Não foi possível gerar no Centi: '+(e&&e.message||e));
  }finally{$('#cGerar').disabled=false;}
}
async function abrirPdf(file){
  if(!file) return;
  origemUnica=proximaUnica;proximaUnica=false;
  if(!/pdf$/i.test(file.name)&&file.type!=='application/pdf'){toast('Escolha um arquivo PDF.');return;}
  carga(true,'Lendo o PDF…','Abrindo '+file.name,0);
  try{
    await iniciarPdfjs();
    bytes=new Uint8Array(await file.arrayBuffer());
    pdfDoc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
    N=pdfDoc.numPages;nomeArq=file.name.replace(/\.pdf$/i,'');
    entradas=[];porPag=[];over.clear();
    let ult=null;
    for(let i=1;i<=N;i++){
      const pg=await pdfDoc.getPage(i),tc=await pg.getTextContent();
      const h=lerCabecalho(tc.items.map(x=>x.str).join(' ').replace(/\s+/g,' '));
      let e;
      if(h){e=Object.assign({pag:[i-1],pessoa:null,manual:null},h);entradas.push(e);ult=e;}
      else if(ult){ult.pag.push(i-1);e=ult;}                          // página de continuação do mesmo servidor
      else{e={nome:'Página '+i+' (sem cabeçalho)',mat:'',cargo:'',periodo:'',pag:[i-1],pessoa:null,manual:null};entradas.push(e);ult=e;}
      porPag[i-1]=e;
      if(i%8===0||i===N){carga(true,null,'Identificando servidores: página '+i+' de '+N,i/N);await pausa();}
    }
    vincular();cur=0;
    $('#dropS').textContent=file.name;
    $('#saveAll').disabled=false;
    $('#vazio').hidden=true;$('#viewBox').hidden=false;$('#treePanel').hidden=false;
    $('#pgNum').max=N;$('#pgTot').textContent='de '+N;
    resumo();arvore();opcoesGrupo();
    carga(false);
    await mostrar(0);
    const nao=entradas.filter(e=>!e.pessoa&&!e.manual).length;
    toast(entradas.length+' servidores em '+N+' páginas.'+(nao?' '+nao+' não foram encontrados na hierarquia.':''));
  }catch(e){
    carga(false);console.error(e);
    toast('Não foi possível ler este PDF: '+(e&&e.message||e));
  }
}

function resumo(){
  const nao=entradas.filter(e=>gkDe(e)==='nao').length,g=grupos().length;
  const usados=new Set(entradas.map(e=>e.pessoa).filter(Boolean));
  const semEsp=pessoal?pessoal.pessoas.filter(p=>!usados.has(p)):[];
  $('#resumo').innerHTML=`<div class="sum"><div><small>Páginas</small><b>${N}</b></div><div><small>Servidores</small><b>${entradas.length}</b></div><div><small>Hierarquias</small><b>${g}</b></div></div>`+
   (!pessoal?`<div class="banner">A hierarquia de pessoal não foi carregada, então todos ficam em um só grupo. Abra a <b>Hierarquia de Pessoal</b>, clique em <b>Atualizar do Centi</b> e volte aqui.</div>`:
    nao?`<div class="banner"><b>${nao}</b> página(s) com servidor que não está na hierarquia. Elas ficam no grupo <b>Não identificados</b>; use <b>Hierarquia desta página</b> para colocá-las no lugar certo.</div>`:
    `<div class="banner ok">Todos os servidores do PDF foram encontrados na hierarquia.</div>`)+
   (semEsp.length?`<div class="row" style="margin-top:8px"><button class="btn sm" id="semEsp" type="button">${semEsp.length} servidor(es) da hierarquia sem espelho no PDF</button></div>`:'');
  const b=$('#semEsp');if(b) b.addEventListener('click',()=>dlgSemEspelho(semEsp));
}
function dlgSemEspelho(L){
  const d=$('#dlg');
  d.innerHTML=`<form method="dialog"><h3>Na hierarquia, mas sem espelho no PDF</h3><p class="muted" style="margin:0">Podem ser servidores sem ponto no período, ou com a matrícula diferente no relatório.</p><ul>${L.map(p=>`<li>${esc(p.n)}${p.m?' · mat. '+esc(p.m):''} <span class="muted">· ${esc(grupoInfo(p.g).nome)}</span></li>`).join('')}</ul><div class="row"><button class="btn primary" value="x">Fechar</button></div></form>`;
  d.showModal();
}


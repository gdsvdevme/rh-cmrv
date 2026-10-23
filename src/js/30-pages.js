/* =====================================================================
   Interface: menu, páginas e ações
   ===================================================================== */
const NAV=[
  {k:'home',t:'Painel Inicial',i:'home'},
  {k:'org',t:'Organograma do RH',i:'org'},
  {k:'comp',t:'Competências das Unidades',i:'list'},
  {k:'geral',t:'Fluxograma Geral',i:'flow'},
  {k:'gestao',t:'Gestão Funcional',i:'users'},
  {k:'folha',t:'Folha de Pagamento',i:'calc'},
  {k:'freq',t:'Frequência e Benefícios',i:'calendar'},
  {k:'arquivo',t:'Arquivo e Documentação',i:'archive'},
  {k:'desenv',t:'Desenvolvimento e Capacitação',i:'cap'},
  {k:'matriz',t:'Matriz de Responsabilidades',i:'grid'},
  {k:'manual',t:'Manual de Procedimentos',i:'book'},
  {k:'kpi',t:'Indicadores de Desempenho',i:'chart'},
  {k:'config',t:'Configurações',i:'gear'}
];
const ui={page:'home',flowSel:{},chap:null,prev:false,kpiYear:2026,kpiView:'mensal',kpiSel:null,versions:null};
let curEd=null;
const U=id=>state.units.find(u=>u.id===id);
const FL=id=>state.flows.find(f=>f.id===id);
const mainEl=()=>$('#main');
const rr=()=>{const y=window.scrollY;renderPage();window.scrollTo(0,y);};
const head=(t,d,act)=>`<div class="pagehead"><div><h2>${esc(t)}</h2>${d?`<p class="hint">${esc(d)}</p>`:''}</div>${act?`<div class="row">${act}</div>`:''}</div>`;
const moveItem=(arr,i,d)=>{const j=i+d;if(i<0||j<0||j>=arr.length) return false;[arr[i],arr[j]]=[arr[j],arr[i]];return true;};
const fnum=v=>v==null||v===''?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});

/* ---------- estrutura geral ---------- */
function buildShell(){
  $('#app').innerHTML=`<div class="shell" id="shell">
    <aside class="side" aria-label="Menu principal">
      <div class="brand"><div class="logo">${icon('building',22)}</div><div><b id="brandName"></b><span id="brandSub"></span></div></div>
      <nav class="nav">${NAV.map(n=>`<button data-a="nav" data-p="${n.k}">${icon(n.i)}<span>${esc(n.t)}</span></button>`).join('')}</nav>
      <div class="side-foot"><a class="homelink" href="/*HOME_URL*/" target="_top">${icon('home',14)}Sistema Interno do RH</a><div id="brandOrg"></div></div>
    </aside>
    <div class="backdrop" data-a="nav-close"></div>
    <div class="workspace">
      <header class="topbar">
        <button class="ibtn menu-btn" data-a="nav-toggle" aria-label="Abrir menu">${icon('menu')}</button>
        <h1 id="pageTitle"></h1>
        <span class="hint hide-sm" id="lastChange"></span>
        <span class="pill" id="saveState">Carregando…</span>
        <button class="btn sm primary" data-a="save">${icon('save',14)}Salvar</button>
      </header>
      <main class="main" id="main"></main>
      <footer class="legal"><b>Observação institucional.</b> ${esc(LEGAL)}</footer>
    </div></div>`;
  updateBrand();
}
function updateBrand(){
  const i=state.inst;
  $('#brandName').textContent=i.nome; $('#brandSub').textContent=i.sub; $('#brandOrg').textContent=i.orgao;
  document.title=i.nome;
  const t=$('#lastChange'); if(t) t.textContent='Última alteração: '+fmtDT(state.meta.atualizado);
}
function go(p){
  ui.page=p; $('#shell').classList.remove('nav-open'); renderPage(); window.scrollTo(0,0);
}
function renderPage(){
  if(curEd){curEd.api.destroy();curEd=null;}
  const n=NAV.find(x=>x.k===ui.page)||NAV[0];
  $$('.nav button').forEach(b=>{if(b.dataset.p===ui.page) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');});
  $('#pageTitle').textContent=n.t;
  const k=ui.page;
  if(k==='home') pageHome();
  else if(k==='org') pageOrg();
  else if(k==='comp') pageComp();
  else if(PAGES_FLOW[k]) pageFlows(k);
  else if(k==='matriz') pageMatriz();
  else if(k==='manual') pageManual();
  else if(k==='kpi') pageKpi();
  else pageConfig();
}
function afterRestore(){
  ui.flowSel={};ui.chap=null;ui.versions=null;
  updateBrand(); renderPage();
}

/* ---------- indicadores: cálculo ---------- */
const mkey=(y,m)=>y+'-'+String(m).padStart(2,'0');
function kpiPeriods(k,year,view){
  if(view==='mensal') return MESES.map((_,i)=>{const v=k.vals[mkey(year,i+1)];return v===''||v==null?null:Number(v);});
  return [0,1,2,3].map(q=>{
    const vs=[1,2,3].map(j=>k.vals[mkey(year,q*3+j)]).filter(v=>v!==''&&v!=null).map(Number);
    if(!vs.length) return null;
    const s=vs.reduce((a,b)=>a+b,0);
    return k.tipo==='pct'?Math.round(s/vs.length*10)/10:s;
  });
}
function kpiLatest(k,year){
  for(let m=12;m>=1;m--){const v=k.vals[mkey(year,m)];if(v!==''&&v!=null) return {m,v:Number(v)};}
  return null;
}
function kpiOk(k,v){
  if(v==null||k.meta===''||k.meta==null) return null;
  return k.dir==='maior'?v>=Number(k.meta):v<=Number(k.meta);
}
const fmtKpi=(k,v)=>v==null?'—':fnum(v)+(k.tipo==='pct'?'%':'');
function kpiTag(k,v){
  const ok=kpiOk(k,v);
  return ok==null?'<span class="tag">Sem meta</span>':ok?'<span class="tag ok">Meta atingida</span>':'<span class="tag bad">Fora da meta</span>';
}
function niceMax(v){
  const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;
  return (n<=1?1:n<=2?2:n<=5?5:10)*p;
}
function chartSvg(k,year,view){
  const vals=kpiPeriods(k,year,view),labels=view==='mensal'?MESES:['T1','T2','T3','T4'];
  const W=720,H=290,L=48,R=16,T=20,B=34,pw=W-L-R,ph=H-T-B,n=vals.length;
  const meta=k.meta===''||k.meta==null?null:Number(k.meta);
  let max=Math.max(k.tipo==='pct'?100:0,...vals.filter(v=>v!=null),meta||0);
  if(max<=0) max=1; max=niceMax(max);
  const y=v=>T+ph*(1-v/max);
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(k.nome)}, ${year}">`;
  for(let i=0;i<=4;i++){
    const v=max/4*i,yy=y(v);
    s+=`<line class="ax" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-7}" y="${yy+4}" text-anchor="end">${fnum(v)}</text>`;
  }
  const bw=Math.min(40,pw/n*0.58);
  vals.forEach((v,i)=>{
    const cx=L+(i+0.5)*pw/n;
    s+=`<text x="${cx}" y="${H-12}" text-anchor="middle">${labels[i]}</text>`;
    if(v==null) return;
    const bad=kpiOk(k,v)===false,yy=y(v);
    s+=`<rect class="bar${bad?' bad':''}" x="${cx-bw/2}" y="${yy}" width="${bw}" height="${Math.max(1,T+ph-yy)}" rx="2"/><text class="val" x="${cx}" y="${yy-5}" text-anchor="middle">${fnum(v)}</text>`;
  });
  if(meta!=null) s+=`<line class="meta" x1="${L}" x2="${W-R}" y1="${y(meta)}" y2="${y(meta)}"/><text x="${W-R}" y="${y(meta)-5}" text-anchor="end" style="fill:var(--danger);font-weight:600">Meta ${fnum(meta)}</text>`;
  return s+'</svg>';
}

/* ---------- Painel inicial ---------- */
function pageHome(){
  const rh=state.units.filter(u=>!u.externa).length;
  const etapas=state.flows.reduce((a,f)=>a+f.nodes.length,0);
  const base=curPal(),pal=Object.assign({},base,{bg:base.surface});
  const mini=sceneStandalone(state.org,'org',pal,{units:state.units,title:'',mid:'hm'});
  const kp=state.kpis.slice(0,6).map(k=>{
    const l=kpiLatest(k,ui.kpiYear);
    return `<tr><td>${esc(k.nome)}</td><td class="num"><b>${fmtKpi(k,l?l.v:null)}</b></td><td class="num">${k.meta===''||k.meta==null?'—':fmtKpi(k,Number(k.meta))}</td><td>${kpiTag(k,l?l.v:null)}</td></tr>`;
  }).join('');
  mainEl().innerHTML=`
    ${head(state.inst.nome,state.inst.orgao+' · '+state.inst.sub,`<button class="btn" data-a="inst-edit">Editar dados institucionais</button>`)}
    <div class="grid g4">
      <div class="card stat"><b>${rh}</b><span>Unidades administrativas do RH</span></div>
      <div class="card stat"><b>${state.flows.length}</b><span>Fluxogramas cadastrados</span></div>
      <div class="card stat"><b>${state.manual.length}</b><span>Procedimentos no manual · ${etapas} etapas mapeadas</span></div>
      <div class="card stat"><b style="font-size:1.15rem;line-height:1.5">${esc(fmtDT(state.meta.atualizado))}</b><span>Última atualização</span></div>
    </div>
    <div class="grid g2">
      <section class="card"><div class="ch"><h2>Organograma resumido</h2><button class="btn sm" data-a="nav" data-p="org">Abrir organograma</button></div>
        <div><div>${mini.svg.replace('<svg ','<svg style="max-width:100%;height:auto;display:block" ')}</div></div></section>
      <section class="card"><div class="ch"><h2>Indicadores de desempenho</h2><button class="btn sm" data-a="nav" data-p="kpi">Ver todos</button></div>
        ${state.meta.demo?'<div class="banner info" style="margin-bottom:10px">Dados demonstrativos. Substitua pelos resultados reais na página de indicadores.</div>':''}
        <div class="scroll"><table><thead><tr><th>Indicador</th><th class="num">Último</th><th class="num">Meta</th><th>Situação</th></tr></thead><tbody>${kp}</tbody></table></div></section>
    </div>
    <section class="card"><div class="ch"><h2>Atalhos para os fluxogramas</h2></div>
      <div class="chips">${state.flows.map(f=>`<button class="chip" data-a="flow-go" data-id="${esc(f.id)}">${esc(f.nome)}<br><span class="hint" style="color:inherit;opacity:.75">${esc(PAGES_FLOW[f.page])}</span></button>`).join('')}</div></section>`;
}

/* ---------- Organograma ---------- */
function pageOrg(){
  mainEl().innerHTML=`${head('Organograma do Departamento de RH','Estrutura editável: arraste, conecte, renomeie e altere a hierarquia. Selecione uma unidade para editar nome, descrição, cor e observações.')}
    <div class="banner info">Os Núcleos Operacionais de Frequência e Benefícios e de Desenvolvimento e Capacitação são divisões internas de trabalho (borda tracejada), sem criação automática de novos cargos.</div>
    <div id="edHost"></div>`;
  curEd=createEditor($('#edHost'),{kind:'org',doc:state.org,title:()=>'Organograma do RH — '+state.inst.orgao,onChange:changed});
}

/* ---------- Competências ---------- */
function compListHtml(u){
  const rows=u.comp.map((c,i)=>`<div class="lrow" data-i="${i}"><input data-pf="u.comp" data-id="${esc(u.id)}" data-i="${i}" value="${esc(c)}" aria-label="Competência ${i+1}"><button class="ibtn" data-a="comp-up" data-id="${esc(u.id)}" data-i="${i}" aria-label="Subir"${i===0?' disabled':''}>${icon('up',14)}</button><button class="ibtn" data-a="comp-down" data-id="${esc(u.id)}" data-i="${i}" aria-label="Descer"${i===u.comp.length-1?' disabled':''}>${icon('down',14)}</button><button class="ibtn danger" data-a="comp-del" data-id="${esc(u.id)}" data-i="${i}" aria-label="Excluir competência">${icon('x',14)}</button></div>`).join('');
  return `<div class="list">${rows||'<p class="hint">Nenhuma competência cadastrada.</p>'}</div><div style="margin-top:8px"><button class="btn sm" data-a="comp-add" data-id="${esc(u.id)}">${icon('plus',14)}Adicionar competência</button></div>`;
}
function unitCardFull(u){
  const hues=HUES.map(h=>`<button class="sw" style="--h:${h}" data-a="u-hue" data-id="${esc(u.id)}" data-h="${h}" aria-pressed="${u.hue===h}" aria-label="Cor ${h}"></button>`).join('');
  return `<section class="card" data-uid="${esc(u.id)}">
    <div class="ch"><div class="row" style="flex:1;min-width:260px"><span class="uicon" style="--h:${u.hue}">${icon(u.icone,20)}</span><input data-pf="u.nome" data-id="${esc(u.id)}" value="${esc(u.nome)}" aria-label="Nome da unidade" style="font-weight:700;font-size:1.02rem"></div>
      <button class="btn sm danger" data-a="u-del" data-id="${esc(u.id)}">Excluir unidade</button></div>
    <div class="grid g2" style="margin-bottom:10px">
      <label class="fld"><span>Descrição</span><textarea rows="2" data-pf="u.desc" data-id="${esc(u.id)}">${esc(u.desc)}</textarea></label>
      <div class="grid" style="gap:10px">
        <div class="r2"><label class="fld"><span>Sigla</span><input data-pf="u.sigla" data-id="${esc(u.id)}" value="${esc(u.sigla)}"></label>
        <label class="fld"><span>Ícone</span><select data-pf="u.icone" data-id="${esc(u.id)}">${Object.keys(UNIT_ICONS).map(k=>`<option value="${k}"${k===u.icone?' selected':''}>${esc(UNIT_ICONS[k])}</option>`).join('')}</select></label></div>
        <label class="fld"><span>Página de fluxogramas associada</span><select data-pf="u.page" data-id="${esc(u.id)}"><option value="">— nenhuma —</option>${Object.keys(PAGES_FLOW).map(k=>`<option value="${k}"${k===u.page?' selected':''}>${esc(PAGES_FLOW[k])}</option>`).join('')}</select></label>
      </div></div>
    <label class="row" style="margin-bottom:10px"><input type="checkbox" data-pf="u.divisao" data-id="${esc(u.id)}"${u.divisao?' checked':''}><span>Divisão interna de trabalho (não cria cargos automaticamente)</span></label>
    <div class="lbl" style="margin-bottom:6px">Competências</div>
    ${compListHtml(u)}
    <div class="grid g2" style="margin-top:12px">
      <label class="fld"><span>Observações</span><textarea rows="2" data-pf="u.obs" data-id="${esc(u.id)}">${esc(u.obs)}</textarea></label>
      <div class="fld"><span>Cor da unidade nos diagramas</span><div class="swatches">${hues}</div></div>
    </div></section>`;
}
function pageComp(){
  const rh=state.units.filter(u=>!u.externa),ext=state.units.filter(u=>u.externa);
  mainEl().innerHTML=`${head('Competências das unidades','Cadastro e edição das competências de cada unidade. As alterações valem para o organograma, os fluxogramas e o manual.',`<button class="btn primary" data-a="u-add">${icon('plus',14)}Adicionar unidade</button>`)}
    <div class="list" style="gap:14px">${rh.map(unitCardFull).join('')}</div>
    <section class="card"><div class="ch"><div><h2>Autoridades e unidades externas ao RH</h2><p class="hint">Aparecem como opção de unidade nos fluxogramas e na matriz.</p></div><button class="btn sm" data-a="u-add-ext">${icon('plus',14)}Adicionar</button></div>
      <div class="list">${ext.map(u=>`<div class="lrow"><span class="dot" style="--h:${u.hue}"></span><input data-pf="u.nome" data-id="${esc(u.id)}" value="${esc(u.nome)}" aria-label="Nome"><input data-pf="u.desc" data-id="${esc(u.id)}" value="${esc(u.desc)}" aria-label="Descrição" placeholder="Descrição"><button class="ibtn danger" data-a="u-del" data-id="${esc(u.id)}" aria-label="Excluir">${icon('x',14)}</button></div>`).join('')||'<p class="hint">Nenhuma cadastrada.</p>'}</div></section>`;
}
function deleteUnit(id){
  const u=U(id); if(!u) return;
  destructive('Unidade excluída: '+u.nome,()=>{
    state.units=state.units.filter(x=>x.id!==id);
    const gone=state.org.nodes.filter(n=>n.unitId===id).map(n=>n.id);
    state.org.nodes=state.org.nodes.filter(n=>n.unitId!==id);
    state.org.edges=state.org.edges.filter(e=>!gone.includes(e.from)&&!gone.includes(e.to));
    state.flows.forEach(f=>f.nodes.forEach(n=>{if(n.unit===id) n.unit='';}));
  });
  rr();
}

/* ---------- Fluxogramas por página ---------- */
function paramsCard(){
  const rows=state.params.map((p,i)=>`<div class="edge-row" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) auto" data-i="${i}"><input data-pf="p.nome" data-id="${esc(p.id)}" value="${esc(p.nome)}" aria-label="Parâmetro"><input data-pf="p.valor" data-id="${esc(p.id)}" value="${esc(p.valor)}" placeholder="Definir conforme a legislação municipal" aria-label="Valor"><input data-pf="p.obs" data-id="${esc(p.id)}" value="${esc(p.obs)}" placeholder="Observações" aria-label="Observações"><button class="ibtn danger" data-a="p-del" data-id="${esc(p.id)}" aria-label="Excluir">${icon('x',14)}</button></div>`).join('');
  return `<section class="card"><div class="ch"><div><h2>Parâmetros e regras de férias</h2><p class="hint">Sem valores pré-definidos. Preencha somente o que estiver previsto na legislação municipal e nos atos normativos da Câmara.</p></div><button class="btn sm" data-a="p-add">${icon('plus',14)}Adicionar parâmetro</button></div>
    <div class="scroll"><div class="list" style="min-width:560px">${rows||'<p class="hint">Nenhum parâmetro cadastrado.</p>'}</div></div></section>`;
}
function newFlow(page){
  return {id:uid('fl-'),page,nome:'Novo fluxograma',desc:'',nodes:[nd('n1','ini','INÍCIO'),nd('n2','proc','Primeira etapa'),nd('n3','fim','ENCERRAMENTO')],edges:[ed('n1','n2'),ed('n2','n3')]};
}
function pageFlows(key){
  const unit=state.units.find(u=>u.page===key&&!u.externa);
  const flows=state.flows.filter(f=>f.page===key);
  if(!ui.flowSel[key]||!flows.some(f=>f.id===ui.flowSel[key])) ui.flowSel[key]=flows[0]?flows[0].id:null;
  const f=flows.find(x=>x.id===ui.flowSel[key]);
  const desc=key==='geral'?'Visão geral do funcionamento do RH, do recebimento da demanda ao arquivamento.':(unit?unit.desc:'');
  let h=head(PAGES_FLOW[key],desc);
  if(unit){
    h+=`<section class="card"><div class="ch"><div class="row"><span class="uicon" style="--h:${unit.hue}">${icon(unit.icone,20)}</span><div><h2>${esc(unit.nome)}</h2>${unit.divisao?'<span class="tag warn">Divisão interna de trabalho</span>':''}</div></div></div>
      <details><summary style="cursor:pointer;font-weight:600">Competências (${unit.comp.length})</summary><div style="margin-top:10px">${compListHtml(unit)}</div></details></section>`;
  }
  h+=`<div class="chips">${flows.map(x=>`<button class="chip${f&&x.id===f.id?' on':''}" data-a="flow-pick" data-id="${esc(x.id)}">${esc(x.nome||'Sem título')}</button>`).join('')}<button class="chip add" data-a="flow-add" data-p="${key}">+ Novo fluxograma</button></div>`;
  if(f){
    h+=`<section class="card"><div class="grid g2" style="margin-bottom:10px">
      <label class="fld"><span>Nome do fluxograma</span><input data-pf="f.nome" data-id="${esc(f.id)}" value="${esc(f.nome)}"></label>
      <label class="fld"><span>Página do menu</span><select data-pf="f.page" data-id="${esc(f.id)}">${Object.keys(PAGES_FLOW).map(k=>`<option value="${k}"${k===f.page?' selected':''}>${esc(PAGES_FLOW[k])}</option>`).join('')}</select></label>
      <label class="fld" style="grid-column:1/-1"><span>Descrição</span><textarea rows="2" data-pf="f.desc" data-id="${esc(f.id)}">${esc(f.desc)}</textarea></label></div>
      <div class="row" style="margin-bottom:12px"><button class="btn sm" data-a="flow-dup" data-id="${esc(f.id)}">Duplicar fluxograma</button><button class="btn sm danger" data-a="flow-del" data-id="${esc(f.id)}">Excluir fluxograma</button></div>
      <div id="edHost"></div></section>`;
  }else h+='<div class="card empty">Nenhum fluxograma nesta página. Crie o primeiro com o botão acima.</div>';
  if(key==='gestao') h+=paramsCard();
  mainEl().innerHTML=h;
  if(f) curEd=createEditor($('#edHost'),{kind:'flow',doc:f,title:()=>f.nome||'Fluxograma',onChange:changed});
}

/* ---------- Matriz de responsabilidades ---------- */
function matrizRows(){return [['Atividade','Responsável principal','Supervisão','Observações']].concat(state.matriz.map(m=>[m.ativ,m.resp,m.sup,m.obs]));}
function pageMatriz(){
  const names=[...new Set(state.units.map(u=>u.nome).concat(state.matriz.map(m=>m.resp),state.matriz.map(m=>m.sup)))].filter(Boolean);
  const rows=state.matriz.map((m,i)=>`<tr data-id="${esc(m.id)}"><td class="num">${i+1}</td>
    <td style="min-width:200px"><input data-pf="m.ativ" data-id="${esc(m.id)}" value="${esc(m.ativ)}" aria-label="Atividade"></td>
    <td style="min-width:190px"><input list="dlNomes" data-pf="m.resp" data-id="${esc(m.id)}" value="${esc(m.resp)}" aria-label="Responsável principal"></td>
    <td style="min-width:190px"><input list="dlNomes" data-pf="m.sup" data-id="${esc(m.id)}" value="${esc(m.sup)}" aria-label="Supervisão"></td>
    <td style="min-width:180px"><input data-pf="m.obs" data-id="${esc(m.id)}" value="${esc(m.obs)}" aria-label="Observações"></td>
    <td><div class="lrow"><button class="ibtn" data-a="m-up" data-id="${esc(m.id)}" aria-label="Subir"${i===0?' disabled':''}>${icon('up',14)}</button><button class="ibtn" data-a="m-down" data-id="${esc(m.id)}" aria-label="Descer"${i===state.matriz.length-1?' disabled':''}>${icon('down',14)}</button><button class="ibtn danger" data-a="m-del" data-id="${esc(m.id)}" aria-label="Excluir">${icon('x',14)}</button></div></td></tr>`).join('');
  mainEl().innerHTML=`${head('Matriz de responsabilidades','Quem executa e quem supervisiona cada atividade. Edite os campos diretamente na tabela.',
    `<button class="btn" data-a="m-csv">CSV</button><button class="btn" data-a="m-xlsx">Excel</button><button class="btn" data-a="m-pdf">PDF</button>`)}
    <section class="card"><datalist id="dlNomes">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
      <div class="scroll"><table><thead><tr><th class="num">#</th><th>Atividade</th><th>Responsável principal</th><th>Supervisão</th><th>Observações</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="margin-top:12px"><button class="btn primary" data-a="m-add">${icon('plus',14)}Adicionar atividade</button></div></section>`;
}

/* ---------- Manual ---------- */
function richHtml(text){
  const out=[];let list=null;
  const close=()=>{if(list){out.push(`</${list}>`);list=null;}};
  String(text||'').split(/\r?\n/).forEach(line=>{
    let m;
    if(!line.trim()){close();return;}
    if((m=/^#\s+(.*)/.exec(line))){close();out.push(`<h4>${esc(m[1])}</h4>`);}
    else if((m=/^\s*[-*]\s+(.*)/.exec(line))){if(list!=='ul'){close();out.push('<ul>');list='ul';}out.push(`<li>${esc(m[1])}</li>`);}
    else if((m=/^(\d+)\.\s+(.*)/.exec(line))){if(list!=='ol'){close();out.push('<ol>');list='ol';}out.push(`<li>${esc(m[2])}</li>`);}
    else{close();out.push(`<p>${esc(line)}</p>`);}
  });
  close(); return out.join('');
}
function pageManual(){
  if(!state.manual.length) state.manual.push({id:uid('mc'),titulo:'Novo capítulo',texto:'',auto:''});
  if(!ui.chap||!state.manual.some(c=>c.id===ui.chap)) ui.chap=state.manual[0].id;
  const c=state.manual.find(x=>x.id===ui.chap);
  const list=state.manual.map((x,i)=>`<div class="chap${x.id===ui.chap?' on':''}" data-a="chap-pick" data-id="${esc(x.id)}"><span>${i+1}. ${esc(x.titulo||'Sem título')}</span>
    <button class="ibtn" data-a="chap-up" data-id="${esc(x.id)}" aria-label="Subir"${i===0?' disabled':''}>${icon('up',14)}</button><button class="ibtn" data-a="chap-down" data-id="${esc(x.id)}" aria-label="Descer"${i===state.manual.length-1?' disabled':''}>${icon('down',14)}</button></div>`).join('');
  mainEl().innerHTML=`${head('Manual de procedimentos administrativos','Edite o texto de cada capítulo, reordene e exporte. Capítulos ligados aos dados podem ser atualizados com um clique.',
    `<button class="btn" data-a="man-md">Markdown</button><button class="btn primary" data-a="man-pdf">Exportar PDF</button>`)}
    <div class="manual">
      <section class="card"><div class="ch"><h2>Capítulos</h2><button class="btn sm" data-a="chap-add">${icon('plus',14)}Capítulo</button></div><div class="list">${list}</div></section>
      <section class="card">
        <div class="ch"><input data-pf="c.titulo" data-id="${esc(c.id)}" value="${esc(c.titulo)}" aria-label="Título do capítulo" style="font-weight:700;font-size:1.05rem;flex:1;min-width:220px">
          <div class="row"><div class="seg"><button data-a="man-edit" aria-pressed="${!ui.prev}">Editar</button><button data-a="man-prev" aria-pressed="${ui.prev}">Visualizar</button></div>
          <button class="btn sm danger" data-a="chap-del" data-id="${esc(c.id)}">Excluir</button></div></div>
        ${c.auto?`<div class="banner info" style="margin-bottom:10px"><span>Este capítulo foi gerado a partir dos dados do sistema. Pode editar livremente; para trazer os dados atuais de volta, use o botão.</span><button class="btn sm" data-a="chap-regen" data-id="${esc(c.id)}">Atualizar com os dados do sistema</button></div>`:''}
        ${ui.prev?`<div class="preview">${richHtml(c.texto)||'<p class="hint">Capítulo vazio.</p>'}</div>`
          :`<textarea data-pf="c.texto" data-id="${esc(c.id)}" rows="22" style="font-family:var(--f-mono);font-size:13px;line-height:1.55" aria-label="Texto do capítulo">${esc(c.texto)}</textarea>
          <p class="hint" style="margin-top:6px">Formatação simples: "# " no início da linha cria um subtítulo, "- " cria um item de lista e "1. " cria um item numerado.</p>`}
      </section></div>`;
}
function manualPdf(){
  const pdf=new PdfDoc({footer:state.inst.nome+' · Manual de procedimentos'});
  pdf.gap(60);
  pdf.text(state.inst.orgao,pdf.m,pdf.y,11,false,0.4);pdf.y-=30;
  pdf.text('Manual de Procedimentos Administrativos',pdf.m,pdf.y,22,true,0.1);pdf.y-=26;
  pdf.text(state.inst.setor||'Departamento de Recursos Humanos',pdf.m,pdf.y,13,false,0.3);pdf.y-=20;
  pdf.text('Gerado em '+new Date().toLocaleDateString('pt-BR'),pdf.m,pdf.y,10,false,0.45);pdf.y-=40;
  pdf.text('Sumário',pdf.m,pdf.y,12,true,0.1);pdf.y-=20;
  state.manual.forEach((c,i)=>{pdf.text((i+1)+'. '+c.titulo,pdf.m+8,pdf.y,10.5,false,0.2);pdf.y-=16;});
  state.manual.forEach((c,i)=>{pdf.newPage();pdf.h1((i+1)+'. '+c.titulo);pdfRichText(pdf,c.texto);});
  pdf.newPage();pdf.h1('Observação institucional');pdf.para(LEGAL);
  return saveFile('manual-de-procedimentos-rh.pdf',pdf.build(),'application/pdf');
}
function manualMd(){
  const L=['# Manual de Procedimentos Administrativos','',state.inst.orgao+' — '+(state.inst.setor||'Departamento de Recursos Humanos'),''];
  state.manual.forEach((c,i)=>{L.push('## '+(i+1)+'. '+c.titulo,'',String(c.texto||'').replace(/^#\s+/gm,'### '),'');});
  L.push('## Observação institucional','',LEGAL,'');
  return saveFile('manual-de-procedimentos-rh.md',L.join('\n'),'text/markdown');
}

/* ---------- Indicadores ---------- */
function kpiTableRows(){
  const yr=ui.kpiYear,view=ui.kpiView;
  const head=['Indicador','Tipo','Meta','Melhor quando'].concat(view==='mensal'?MESES.map(m=>m+'/'+yr):['T1/'+yr,'T2/'+yr,'T3/'+yr,'T4/'+yr]);
  return [head].concat(state.kpis.map(k=>[k.nome,k.tipo==='pct'?'Percentual':'Quantidade',k.meta==null?'':k.meta,k.dir==='maior'?'Maior':'Menor'].concat(kpiPeriods(k,yr,view).map(v=>v==null?'':v))));
}
function kpiOutputs(){
  const k=state.kpis.find(x=>x.id===ui.kpiSel); if(!k) return;
  const cards=state.kpis.map(x=>{const l=kpiLatest(x,ui.kpiYear);return `<button class="kpi-card${x.id===ui.kpiSel?' on':''}" data-a="kpi-pick" data-id="${esc(x.id)}"><span class="nm">${esc(x.nome)}</span><span class="vl">${fmtKpi(x,l?l.v:null)}</span><span>${kpiTag(x,l?l.v:null)}<span class="hint"> ${l?'· '+MESES[l.m-1]+'/'+ui.kpiYear:''}</span></span></button>`;}).join('');
  $('#kpiCards').innerHTML=cards;
  $('#kpiChartT').textContent=k.nome+' — '+ui.kpiYear+' ('+(ui.kpiView==='mensal'?'por mês':'por trimestre')+')';
  $('#kpiChart').innerHTML=chartSvg(k,ui.kpiYear,ui.kpiView);
}
function pageKpi(){
  if(!ui.kpiSel||!state.kpis.some(k=>k.id===ui.kpiSel)) ui.kpiSel=state.kpis[0]?state.kpis[0].id:null;
  const yr=ui.kpiYear,view=ui.kpiView;
  const years=[2025,2026,2027,2028];
  const rows=state.kpis.map(k=>{
    const per=kpiPeriods(k,yr,view);
    const cells=view==='mensal'
      ?MESES.map((_,i)=>`<td><input type="number" step="any" data-pf="k.val" data-id="${esc(k.id)}" data-m="${i+1}" value="${k.vals[mkey(yr,i+1)]==null?'':esc(k.vals[mkey(yr,i+1)])}" aria-label="${esc(k.nome)} ${MESES[i]}" style="min-width:64px;text-align:right"></td>`).join('')
      :per.map(v=>`<td class="num">${v==null?'—':fnum(v)}</td>`).join('');
    return `<tr><td style="min-width:240px">${esc(k.nome)}</td><td><input type="number" step="any" data-pf="k.meta" data-id="${esc(k.id)}" value="${k.meta==null?'':esc(k.meta)}" aria-label="Meta" style="min-width:70px;text-align:right"></td>${cells}</tr>`;
  }).join('');
  const sel=state.kpis.find(k=>k.id===ui.kpiSel);
  mainEl().innerHTML=`${head('Indicadores de desempenho','Cadastre metas e resultados por mês. A visão trimestral consolida os meses (média para percentuais, soma para quantidades).',
    `<button class="btn" data-a="kpi-csv">CSV</button><button class="btn" data-a="kpi-xlsx">Excel</button>`)}
    ${state.meta.demo?`<div class="banner"><span><b>Dados demonstrativos.</b> Os valores abaixo são fictícios e servem só para mostrar o funcionamento. Não representam o RH da Câmara.</span><button class="btn sm" data-a="demo-clear">Limpar dados demonstrativos</button></div>`:''}
    <div class="row"><label class="row"><span class="lbl">Ano</span><select data-pf="kpi.year" style="width:auto">${years.map(y=>`<option value="${y}"${y===yr?' selected':''}>${y}</option>`).join('')}</select></label>
      <div class="seg"><button data-a="kpi-view" data-v="mensal" aria-pressed="${view==='mensal'}">Mensal</button><button data-a="kpi-view" data-v="trimestral" aria-pressed="${view==='trimestral'}">Trimestral</button></div></div>
    <div class="grid g4" id="kpiCards"></div>
    <section class="card"><div class="ch"><h2 id="kpiChartT"></h2></div><div id="kpiChart"></div></section>
    <section class="card"><div class="ch"><h2>Metas e resultados</h2><button class="btn sm" data-a="kpi-add">${icon('plus',14)}Adicionar indicador</button></div>
      <div class="scroll"><table><thead><tr><th>Indicador</th><th>Meta</th>${(view==='mensal'?MESES:['T1','T2','T3','T4']).map(m=>`<th class="num">${m}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      ${view==='trimestral'?'<p class="hint" style="margin-top:8px">Na visão trimestral os valores são calculados. Mude para Mensal para lançar resultados.</p>':''}</section>
    ${sel?`<section class="card"><div class="ch"><h2>Editar indicador selecionado</h2><button class="btn sm danger" data-a="kpi-del" data-id="${esc(sel.id)}">Excluir indicador</button></div>
      <div class="grid g2"><label class="fld"><span>Nome</span><input data-pf="k.nome" data-id="${esc(sel.id)}" value="${esc(sel.nome)}"></label>
      <div class="r2"><label class="fld"><span>Tipo</span><select data-pf="k.tipo" data-id="${esc(sel.id)}"><option value="pct"${sel.tipo==='pct'?' selected':''}>Percentual</option><option value="qtd"${sel.tipo==='qtd'?' selected':''}>Quantidade</option></select></label>
      <label class="fld"><span>Melhor quando</span><select data-pf="k.dir" data-id="${esc(sel.id)}"><option value="maior"${sel.dir==='maior'?' selected':''}>O valor é maior</option><option value="menor"${sel.dir==='menor'?' selected':''}>O valor é menor</option></select></label></div></div></section>`:''}`;
  kpiOutputs();
}

/* ---------- Configurações ---------- */
async function loadVersionList(){
  ui.versions=await listVersions();
  const box=$('#verList'); if(box) box.innerHTML=versionsHtml();
}
function versionsHtml(){
  const v=ui.versions;
  if(!v) return '<p class="hint">Carregando…</p>';
  if(!v.length) return '<p class="hint">Nenhuma cópia criada ainda.</p>';
  return `<div class="scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th></th></tr></thead><tbody>${v.map(x=>`<tr><td>${esc(fmtDT(x.at))}</td><td>${esc(x.label)}</td><td><div class="row" style="justify-content:flex-end"><button class="btn sm" data-a="ver-restore" data-id="${esc(x.id)}">Restaurar</button><button class="btn sm danger" data-a="ver-del" data-id="${esc(x.id)}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function pageConfig(){
  const i=state.inst;
  mainEl().innerHTML=`${head('Configurações','Dados institucionais, parâmetros, cópias de segurança e importação/exportação.')}
    <section class="card"><div class="ch"><h2>Dados institucionais</h2></div>
      <div class="grid g2"><label class="fld"><span>Nome do sistema</span><input data-pf="inst.nome" value="${esc(i.nome)}"></label>
      <label class="fld"><span>Subtítulo</span><input data-pf="inst.sub" value="${esc(i.sub)}"></label>
      <label class="fld"><span>Órgão</span><input data-pf="inst.orgao" value="${esc(i.orgao)}"></label>
      <label class="fld"><span>Setor responsável pelo sistema</span><input data-pf="inst.setor" value="${esc(i.setor)}"></label>
      <label class="fld" style="grid-column:1/-1"><span>Observações</span><textarea rows="2" data-pf="inst.obs">${esc(i.obs)}</textarea></label></div></section>
    ${paramsCard()}
    <section class="card"><div class="ch"><div><h2>Cópias de segurança e versões</h2><p class="hint">Uma cópia automática é criada no primeiro salvamento de cada dia. Restaurar substitui os dados atuais, e dá para desfazer logo em seguida.</p></div></div>
      <div class="row" style="margin-bottom:12px"><input id="verLabel" placeholder="Descrição da cópia (opcional)" style="max-width:340px"><button class="btn primary" data-a="ver-new">Criar cópia agora</button></div>
      <div id="verList">${versionsHtml()}</div></section>
    <section class="card"><div class="ch"><h2>Dados</h2></div>
      <div class="row" style="margin-bottom:10px"><button class="btn" data-a="json-export">Exportar JSON</button><button class="btn" data-a="json-import">Importar JSON</button><button class="btn danger" data-a="reset">Restaurar modelo inicial</button></div>
      <p class="hint" id="storeInfo"></p></section>
    <section class="card"><div class="ch"><h2>Observação institucional</h2></div><p>${esc(LEGAL)}</p>
      <p class="hint" style="margin-top:8px">O sistema não autoriza nomeações, exonerações, pagamentos ou concessões de direitos. A autoridade competente permanece responsável pelas decisões administrativas. Não cadastre dados pessoais reais de servidores.</p></section>`;
  $('#storeInfo').textContent=dbh
    ?'Os dados ficam salvos neste documento, no banco do próprio sistema, e acompanham quem abrir o mesmo link com permissão de edição. Uma cópia local também fica neste navegador.'
    :'Os dados ficam salvos somente neste navegador, neste computador. Não existe sincronização automática entre computadores: use Exportar JSON e Importar JSON para levar os dados para outro lugar.';
  if(!ui.versions) loadVersionList();
}

/* ---------- campos de página (input) ---------- */
const PF={
  'inst.nome':el=>{state.inst.nome=el.value;updateBrand();},
  'inst.sub':el=>{state.inst.sub=el.value;updateBrand();},
  'inst.orgao':el=>{state.inst.orgao=el.value;updateBrand();},
  'inst.setor':el=>{state.inst.setor=el.value;},
  'inst.obs':el=>{state.inst.obs=el.value;},
  'u.nome':(el,id)=>{const u=U(id);if(u) u.nome=el.value;},
  'u.sigla':(el,id)=>{const u=U(id);if(u) u.sigla=el.value;},
  'u.desc':(el,id)=>{const u=U(id);if(u) u.desc=el.value;},
  'u.obs':(el,id)=>{const u=U(id);if(u) u.obs=el.value;},
  'u.icone':(el,id)=>{const u=U(id);if(u){u.icone=el.value;return 'rr';}},
  'u.page':(el,id)=>{const u=U(id);if(u) u.page=el.value;},
  'u.divisao':(el,id)=>{const u=U(id);if(u){u.divisao=el.checked;state.org.nodes.forEach(n=>{if(n.unitId===id) n.tipo=el.checked?'nucleo':(n.tipo==='nucleo'?'unidade':n.tipo);});}},
  'u.comp':(el,id,i)=>{const u=U(id);if(u) u.comp[Number(i)]=el.value;},
  'f.nome':(el,id)=>{const f=FL(id);if(f){f.nome=el.value;const c=$('.chip.on',mainEl());if(c) c.textContent=f.nome||'Sem título';}},
  'f.desc':(el,id)=>{const f=FL(id);if(f) f.desc=el.value;},
  'f.page':(el,id)=>{const f=FL(id);if(f){f.page=el.value;ui.flowSel[f.page]=f.id;toast('Fluxograma movido para '+PAGES_FLOW[f.page]+'.');setTimeout(()=>go(f.page),0);return 'keep';}},
  'p.nome':(el,id)=>{const p=state.params.find(x=>x.id===id);if(p) p.nome=el.value;},
  'p.valor':(el,id)=>{const p=state.params.find(x=>x.id===id);if(p) p.valor=el.value;},
  'p.obs':(el,id)=>{const p=state.params.find(x=>x.id===id);if(p) p.obs=el.value;},
  'm.ativ':(el,id)=>{const m=state.matriz.find(x=>x.id===id);if(m) m.ativ=el.value;},
  'm.resp':(el,id)=>{const m=state.matriz.find(x=>x.id===id);if(m) m.resp=el.value;},
  'm.sup':(el,id)=>{const m=state.matriz.find(x=>x.id===id);if(m) m.sup=el.value;},
  'm.obs':(el,id)=>{const m=state.matriz.find(x=>x.id===id);if(m) m.obs=el.value;},
  'c.titulo':(el,id)=>{const c=state.manual.find(x=>x.id===id);if(c){c.titulo=el.value;const s=$(`.chap[data-id="${id}"] span`,mainEl());if(s){const i=state.manual.indexOf(c);s.textContent=(i+1)+'. '+(c.titulo||'Sem título');}}},
  'c.texto':(el,id)=>{const c=state.manual.find(x=>x.id===id);if(c) c.texto=el.value;},
  'k.nome':(el,id)=>{const k=state.kpis.find(x=>x.id===id);if(k){k.nome=el.value;kpiOutputs();}},
  'k.tipo':(el,id)=>{const k=state.kpis.find(x=>x.id===id);if(k){k.tipo=el.value;return 'rr';}},
  'k.dir':(el,id)=>{const k=state.kpis.find(x=>x.id===id);if(k){k.dir=el.value;kpiOutputs();}},
  'k.meta':(el,id)=>{const k=state.kpis.find(x=>x.id===id);if(k){k.meta=el.value===''?null:Number(el.value);kpiOutputs();}},
  'k.val':(el,id)=>{const k=state.kpis.find(x=>x.id===id);if(k){const key=mkey(ui.kpiYear,Number(el.dataset.m));if(el.value==='') delete k.vals[key]; else k.vals[key]=Number(el.value);state.meta.demo=state.meta.demo;kpiOutputs();}},
  'kpi.year':el=>{ui.kpiYear=Number(el.value);setTimeout(rr,0);return 'keep';}
};
document.addEventListener('input',ev=>{
  const el=ev.target,k=el.dataset&&el.dataset.pf;
  if(!k||!PF[k]||!el.closest('#app')) return;
  const r=PF[k](el,el.dataset.id,el.dataset.i);
  if(r!=='keep') changed();
  if(r==='rr') rr();
});

/* ---------- ações (cliques) ---------- */
const ACT={
  'nav':b=>go(b.dataset.p),
  'nav-toggle':()=>$('#shell').classList.toggle('nav-open'),
  'nav-close':()=>$('#shell').classList.remove('nav-open'),
  'save':()=>{clearTimeout(saveT);doSave(true);},
  'inst-edit':()=>openModal('Dados institucionais',
    `<label class="fld"><span>Nome do sistema</span><input name="nome" value="${esc(state.inst.nome)}"></label>
     <label class="fld"><span>Subtítulo</span><input name="sub" value="${esc(state.inst.sub)}"></label>
     <label class="fld"><span>Órgão</span><input name="orgao" value="${esc(state.inst.orgao)}"></label>
     <label class="fld"><span>Setor responsável</span><input name="setor" value="${esc(state.inst.setor)}"></label>`,
    f=>{state.inst.nome=f.nome.value.trim()||state.inst.nome;state.inst.sub=f.sub.value.trim();state.inst.orgao=f.orgao.value.trim();state.inst.setor=f.setor.value.trim();changed();updateBrand();renderPage();}),
  'flow-go':b=>{const f=FL(b.dataset.id);if(f){ui.flowSel[f.page]=f.id;go(f.page);}},
  'flow-pick':b=>{const f=FL(b.dataset.id);if(f){ui.flowSel[f.page]=f.id;rr();}},
  'flow-add':b=>{const f=newFlow(b.dataset.p);state.flows.push(f);ui.flowSel[f.page]=f.id;changed();rr();},
  'flow-dup':b=>{const f=FL(b.dataset.id);if(f){const c=clone(f);c.id=uid('fl-');c.nome=f.nome+' (cópia)';state.flows.push(c);ui.flowSel[c.page]=c.id;changed();rr();}},
  'flow-del':b=>{const f=FL(b.dataset.id);if(f) destructive('Fluxograma excluído: '+f.nome,()=>{state.flows=state.flows.filter(x=>x.id!==f.id);});rr();},
  'u-add':()=>{state.units.push({id:uid('u-'),nome:'Nova unidade',sigla:'',icone:'users',hue:HUES[state.units.length%HUES.length],page:'',externa:false,divisao:false,desc:'',obs:'',comp:[]});changed();rr();},
  'u-add-ext':()=>{state.units.push({id:uid('u-'),nome:'Nova autoridade ou unidade externa',sigla:'',icone:'building',hue:HUES[state.units.length%HUES.length],page:'',externa:true,divisao:false,desc:'',obs:'',comp:[]});changed();rr();},
  'u-del':b=>deleteUnit(b.dataset.id),
  'u-hue':b=>{const u=U(b.dataset.id);if(u){u.hue=Number(b.dataset.h);changed();rr();}},
  'comp-add':b=>{const u=U(b.dataset.id);if(u){u.comp.push('');changed();rr();const ins=$$(`input[data-pf="u.comp"][data-id="${b.dataset.id}"]`);if(ins.length) ins[ins.length-1].focus();}},
  'comp-del':b=>{const u=U(b.dataset.id);if(u){u.comp.splice(Number(b.dataset.i),1);changed();rr();}},
  'comp-up':b=>{const u=U(b.dataset.id);if(u&&moveItem(u.comp,Number(b.dataset.i),-1)){changed();rr();}},
  'comp-down':b=>{const u=U(b.dataset.id);if(u&&moveItem(u.comp,Number(b.dataset.i),1)){changed();rr();}},
  'p-add':()=>{state.params.push({id:uid('p'),nome:'Novo parâmetro',valor:'',obs:''});changed();rr();},
  'p-del':b=>{state.params=state.params.filter(p=>p.id!==b.dataset.id);changed();rr();},
  'm-add':()=>{state.matriz.push({id:uid('m'),ativ:'Nova atividade',resp:'',sup:'Diretoria de Gestão de Pessoas',obs:''});changed();rr();},
  'm-del':b=>{const m=state.matriz.find(x=>x.id===b.dataset.id);if(m) destructive('Atividade excluída.',()=>{state.matriz=state.matriz.filter(x=>x.id!==m.id);});rr();},
  'm-up':b=>{if(moveItem(state.matriz,state.matriz.findIndex(x=>x.id===b.dataset.id),-1)){changed();rr();}},
  'm-down':b=>{if(moveItem(state.matriz,state.matriz.findIndex(x=>x.id===b.dataset.id),1)){changed();rr();}},
  'm-csv':()=>saveFile('matriz-de-responsabilidades.csv',toCsv(matrizRows()),'text/csv'),
  'm-xlsx':()=>exportXlsx('matriz-de-responsabilidades.xlsx',[{name:'Matriz',rows:matrizRows()}]),
  'm-pdf':()=>{
    const pdf=new PdfDoc({w:842,h:595,margin:40,footer:state.inst.nome+' · Matriz de responsabilidades'});
    pdf.h1('Matriz de responsabilidades');pdf.para(state.inst.orgao+' — '+(state.inst.setor||''),{gray:0.4});
    pdf.table([{label:'Atividade',w:3},{label:'Responsável principal',w:3},{label:'Supervisão',w:3},{label:'Observações',w:3}],state.matriz.map(m=>[m.ativ,m.resp,m.sup,m.obs]));
    pdf.para(LEGAL,{size:8,gray:0.45});
    saveFile('matriz-de-responsabilidades.pdf',pdf.build(),'application/pdf');
  },
  'chap-pick':(b,ev)=>{if(ev.target.closest('.ibtn')) return;ui.chap=b.dataset.id;rr();},
  'chap-add':()=>{const c={id:uid('mc'),titulo:'Novo capítulo',texto:'',auto:''};state.manual.push(c);ui.chap=c.id;ui.prev=false;changed();rr();},
  'chap-del':b=>{const c=state.manual.find(x=>x.id===b.dataset.id);if(c) destructive('Capítulo excluído.',()=>{state.manual=state.manual.filter(x=>x.id!==c.id);});ui.chap=null;rr();},
  'chap-up':b=>{if(moveItem(state.manual,state.manual.findIndex(x=>x.id===b.dataset.id),-1)){changed();rr();}},
  'chap-down':b=>{if(moveItem(state.manual,state.manual.findIndex(x=>x.id===b.dataset.id),1)){changed();rr();}},
  'chap-regen':b=>{const c=state.manual.find(x=>x.id===b.dataset.id);if(c) destructive('Capítulo atualizado com os dados do sistema.',()=>{c.texto=genAuto(state,c.auto);});rr();},
  'man-edit':()=>{ui.prev=false;rr();},
  'man-prev':()=>{ui.prev=true;rr();},
  'man-pdf':()=>manualPdf(),
  'man-md':()=>manualMd(),
  'kpi-pick':b=>{ui.kpiSel=b.dataset.id;rr();},
  'kpi-view':b=>{ui.kpiView=b.dataset.v;rr();},
  'kpi-add':()=>{const k={id:uid('k'),nome:'Novo indicador',tipo:'qtd',dir:'maior',meta:null,vals:{}};state.kpis.push(k);ui.kpiSel=k.id;changed();rr();},
  'kpi-del':b=>{const k=state.kpis.find(x=>x.id===b.dataset.id);if(k) destructive('Indicador excluído.',()=>{state.kpis=state.kpis.filter(x=>x.id!==k.id);});ui.kpiSel=null;rr();},
  'kpi-csv':()=>saveFile('indicadores-'+ui.kpiYear+'-'+ui.kpiView+'.csv',toCsv(kpiTableRows()),'text/csv'),
  'kpi-xlsx':()=>exportXlsx('indicadores-'+ui.kpiYear+'.xlsx',[{name:'Mensal',rows:(()=>{const v=ui.kpiView;ui.kpiView='mensal';const r=kpiTableRows();ui.kpiView=v;return r;})()},{name:'Trimestral',rows:(()=>{const v=ui.kpiView;ui.kpiView='trimestral';const r=kpiTableRows();ui.kpiView=v;return r;})()}]),
  'demo-clear':()=>destructive('Dados demonstrativos removidos.',()=>{state.kpis.forEach(k=>{k.vals={};k.meta=null;});state.meta.demo=false;}),
  'ver-new':async()=>{const l=$('#verLabel');await createVersion((l&&l.value.trim())||'Cópia manual');ui.versions=null;rr();},
  'ver-del':async b=>{await removeVersion(b.dataset.id);ui.versions=null;rr();},
  'ver-restore':b=>{
    const v=(ui.versions||[]).find(x=>x.id===b.dataset.id); if(!v) return;
    const d=parseState(v.json); if(!d){toast('Esta cópia não pôde ser lida.');return;}
    destructive('Versão restaurada: '+fmtDT(v.at),()=>{state=d;});afterRestore();
  },
  'json-export':()=>saveFile('rh-camara-rio-verde-'+todayKey()+'.json',JSON.stringify(state,null,2),'application/json'),
  'json-import':()=>$('#fileIn').click(),
  'reset':()=>{destructive('Modelo inicial restaurado.',()=>{state=buildDefault();layoutAll(state);});afterRestore();}
};
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-a]'); if(!b||!b.closest('#app')) return;
  if(b.closest('.ed')) return;
  const f=ACT[b.dataset.a]; if(f) f(b,ev);
});
$('#fileIn').addEventListener('change',ev=>{
  const file=ev.target.files&&ev.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=()=>{
    const d=parseState(String(r.result));
    if(!d){toast('Arquivo inválido. Use um JSON exportado por este sistema.');return;}
    destructive('Dados importados.',()=>{state=d;});afterRestore();
  };
  r.onerror=()=>toast('Não foi possível ler o arquivo.');
  r.readAsText(file); ev.target.value='';
});

/* ---------- tema e início ---------- */
function onTheme(){
  if(curEd) curEd.api.theme();
  if(ui.page==='home') rr();
}
try{
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',onTheme);
  new MutationObserver(onTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}catch(e){}

function init(){
  state=buildDefault(); layoutAll(state);
  buildShell(); renderPage(); setStatus('load');
  const h=(location.hash||'').replace('#','');
  if(NAV.some(n=>n.k===h)) go(h);
  (async()=>{
    try{if(window.claude&&window.claude.use) window.__dl=await window.claude.use('downloads');}catch(e){}
    try{if(window.claude&&window.claude.use) dbh=await window.claude.use('db');}catch(e){dbh=null;}
    let loaded=null;
    try{if(dbh){const s=await dbh.doc('rh/estado').get();if(s.exists){const d=s.data();loaded=parseState(d&&d.json);}}}catch(e){}
    if(!loaded){try{loaded=parseState(localStorage.getItem(LS_STATE));}catch(e){}}
    if(loaded&&!touched){state=loaded;afterRestore();}
    setStatus(dbh?'ok':'local');
  })();
}
init();

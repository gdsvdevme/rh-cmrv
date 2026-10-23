/* =====================================================================
   Textos do manual gerados a partir dos dados do sistema
   ===================================================================== */
function orgDisp(n,units){
  const u=n.unitId&&units.find(x=>x.id===n.unitId);
  if(u) return {t:u.nome,desc:u.desc,hue:u.hue,icone:u.icone||n.icone||'file'};
  return {t:n.t,desc:n.desc,hue:n.hue,icone:n.icone||'building'};
}
function stepsOrdered(flow){
  const byId=new Map(flow.nodes.map(n=>[n.id,n]));
  const seen=new Set(),order=[];
  const starts=flow.nodes.filter(n=>n.tipo==='ini').map(n=>n.id).concat(flow.nodes.filter(n=>!flow.edges.some(e=>e.to===n.id)).map(n=>n.id));
  const q=[...new Set(starts)];
  while(q.length){
    const id=q.shift();
    if(seen.has(id)||!byId.has(id)) continue;
    seen.add(id); order.push(byId.get(id));
    flow.edges.filter(e=>e.from===id).forEach(e=>q.push(e.to));
  }
  flow.nodes.forEach(n=>{if(!seen.has(n.id)) order.push(n);});
  return order;
}
function genFlow(st,flow){
  const L=[];
  if(flow.desc) L.push(flow.desc,'');
  const ord=stepsOrdered(flow); const idx=new Map(ord.map((n,i)=>[n.id,i+1]));
  const byId=new Map(flow.nodes.map(n=>[n.id,n]));
  ord.forEach((n,i)=>{
    const u=st.units.find(x=>x.id===n.unit);
    const parts=[];
    if(u) parts.push('unidade: '+u.nome);
    if(n.resp) parts.push('responsável: '+n.resp);
    if(n.prazo) parts.push('prazo: '+n.prazo);
    if(n.docs) parts.push('documentos: '+oneLine(n.docs));
    if(n.status) parts.push('status: '+n.status);
    L.push((i+1)+'. '+oneLine(n.t)+(n.tipo==='dec'?' (decisão)':'')+(parts.length?' — '+parts.join('; '):''));
    const outs=flow.edges.filter(e=>e.from===n.id&&idx.has(e.to));
    if(n.tipo==='dec'||outs.length>1) outs.forEach(e=>L.push('  - '+(e.l||'Segue')+': etapa '+idx.get(e.to)+' ('+oneLine(byId.get(e.to).t)+')'));
    if(n.obs) L.push('  - Observações: '+oneLine(n.obs));
  });
  return L.join('\n');
}
function genOrg(st){
  const nodes=st.org.nodes,edges=st.org.edges,L=[];
  const roots=nodes.filter(n=>!edges.some(e=>e.to===n.id));
  const seen=new Set();
  const walk=(n,d)=>{
    if(seen.has(n.id)) return; seen.add(n.id);
    const x=orgDisp(n,st.units);
    L.push('  '.repeat(d)+'- '+oneLine(x.t)+(n.tipo==='nucleo'?' (divisão interna de trabalho)':'')+(x.desc?' — '+oneLine(x.desc):''));
    edges.filter(e=>e.from===n.id).forEach(e=>{const c=nodes.find(k=>k.id===e.to);if(c) walk(c,d+1);});
  };
  roots.forEach(r=>walk(r,0));
  return 'Estrutura do Departamento de Recursos Humanos, da autoridade superior às unidades subordinadas:\n\n'+L.join('\n')+'\n\nOs núcleos operacionais são divisões internas de trabalho e não criam cargos automaticamente.';
}
function genUnit(st,u){
  const L=[];
  if(u.desc) L.push(u.desc,'');
  if(u.obs) L.push(u.obs,'');
  L.push('# Competências');
  if(!u.comp.length) L.push('(nenhuma competência cadastrada)');
  u.comp.forEach(c=>L.push('- '+c));
  const fl=st.flows.filter(f=>f.page===u.page&&u.page);
  if(fl.length){L.push('','# Fluxogramas relacionados');fl.forEach(f=>L.push('- '+f.nome));}
  return L.join('\n');
}
function genComp(st){
  const L=[];
  st.units.filter(u=>!u.externa).forEach(u=>{
    L.push('# '+u.nome);
    if(u.divisao) L.push('(Divisão interna de trabalho, sem criação automática de novos cargos.)');
    if(!u.comp.length) L.push('(nenhuma competência cadastrada)');
    u.comp.forEach(c=>L.push('- '+c));
    L.push('');
  });
  return L.join('\n').trim();
}
function genMatriz(st){
  return st.matriz.map(m=>'- '+m.ativ+' — responsável principal: '+(m.resp||'—')+'; supervisão: '+(m.sup||'—')+(m.obs?'; observações: '+m.obs:'')).join('\n');
}
function genFluxos(st){
  return st.flows.map(f=>'- '+f.nome+' ('+PAGES_FLOW[f.page]+', '+f.nodes.length+' elementos)'+(f.desc?': '+f.desc:'')).join('\n');
}
function genKpis(st){
  return st.kpis.map(k=>'- '+k.nome+' — meta: '+(k.meta==null||k.meta===''?'não definida':k.meta+(k.tipo==='pct'?'%':''))+' ('+(k.dir==='maior'?'quanto maior, melhor':'quanto menor, melhor')+')').join('\n');
}
function genFerias(st){
  const L=[genFlow(st,st.flows.find(f=>f.id==='fl-ferias')||{desc:'',nodes:[],edges:[]}),'','# Parâmetros de férias (definir conforme a legislação municipal)'];
  if(!st.params.length) L.push('(nenhum parâmetro cadastrado)');
  st.params.forEach(p=>L.push('- '+p.nome+': '+(oneLine(p.valor)||'a definir')+(p.obs?' ('+oneLine(p.obs)+')':'')));
  return L.join('\n');
}
function genAuto(st,auto){
  if(auto==='org') return genOrg(st);
  if(auto==='comp') return genComp(st);
  if(auto==='matriz') return genMatriz(st);
  if(auto==='fluxos') return genFluxos(st);
  if(auto==='kpis') return genKpis(st);
  if(auto==='ferias') return genFerias(st);
  if(auto.indexOf('flow:')===0){
    const f=st.flows.find(x=>x.id===auto.slice(5));
    return f?genFlow(st,f):'(fluxograma não encontrado)';
  }
  if(auto.indexOf('unit:')===0){
    const u=st.units.find(x=>x.id===auto.slice(5));
    return u?genUnit(st,u):'(unidade não encontrada)';
  }
  return '';
}
function defaultManual(st){
  const defs=[
    ['Organização do RH','org'],
    ['Competências das unidades','comp'],
    ['Procedimentos de nomeação e exoneração','flow:fl-nomeacao'],
    ['Procedimentos de folha de pagamento','flow:fl-folha'],
    ['Procedimentos de férias e licenças','ferias'],
    ['Controle de frequência','unit:u-freq'],
    ['Gestão documental','unit:u-arq'],
    ['Desenvolvimento e capacitação','unit:u-desenv'],
    ['Matriz de responsabilidades','matriz'],
    ['Fluxogramas','fluxos'],
    ['Indicadores','kpis']
  ];
  return defs.map((d,i)=>({id:'mc'+(i+1),titulo:d[0],auto:d[1],texto:genAuto(st,d[1])}));
}

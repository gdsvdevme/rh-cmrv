/* Testes do motor das Conferências (src/conferencias-engine.js). Rodar: node --test tests/ */
const test=require('node:test');
const assert=require('node:assert/strict');
const CF=require('../src/conferencias-engine.js');
const cat=(l,m=10,a=2026)=>CF.classificar(Object.assign({Recorrencia:'Determinada',Inicio:'01/01/2026',Fim:''},l),m,a).cat;

test('datas: lê DD/MM/AAAA e formata de volta',()=>{
  assert.equal(CF.fmt(CF.D('30/10/2026')),'30/10/2026');
  assert.equal(CF.D(''),null);assert.equal(CF.D('2026-10-01'),null);
});

test('indeterminada, mesmo com data inicial antiga',()=>{
  assert.equal(cat({Recorrencia:'Indeterminada',Inicio:'01/10/2025'}),'indeterminada');
});

test('determinada só no mês: início e fim dentro do mês de referência (01/10/2026 a 30/10/2026)',()=>{
  assert.equal(cat({Inicio:'01/10/2026',Fim:'30/10/2026'}),'so_mes');
  assert.equal(cat({Inicio:'10/10/2026',Fim:'20/10/2026'}),'so_mes');
  assert.equal(CF.classificar({Recorrencia:'Determinada',Inicio:'01/10/2026',Fim:'30/10/2026'},11,2026).vencida,true);   // em novembro já passou
});

test('vence no mês: começou antes e termina dentro do mês',()=>{
  assert.equal(cat({Inicio:'01/10/2025',Fim:'30/10/2026'}),'vence_mes');
});

test('determinada que termina depois do mês, até 2099 e sem data final',()=>{
  assert.equal(cat({Inicio:'01/10/2025',Fim:'31/03/2027'}),'determinada');
  assert.equal(cat({Inicio:'01/10/2025',Fim:'31/10/2099'}),'ate_2099');
  assert.equal(cat({Inicio:'01/10/2025',Fim:''}),'sem_data');
});

test('começa depois do mês de referência',()=>{
  assert.equal(cat({Inicio:'01/11/2026',Fim:'30/11/2026'}),'futura');
  assert.equal(cat({Recorrencia:'Indeterminada',Inicio:'01/12/2026'}),'futura');
});

test('já vencida antes do mês fica marcada (não deveria vir do Centi)',()=>{
  const c=CF.classificar({Recorrencia:'Determinada',Inicio:'01/01/2026',Fim:'30/09/2026'},10,2026);
  assert.equal(c.vencida,true);
});

test('resumo por evento agrupa pelo código e conta por categoria',()=>{
  const it=(cod,nome,c)=>({l:{Codigo:cod,Evento:nome},c:{cat:c}});
  const r=CF.porEvento([it('656','PAGA IPARV','indeterminada'),it('656','PAGA IPARV','so_mes'),it('644','CUMPRIMENTO','determinada')]);
  assert.deepEqual(r.map(x=>[x.codigo,x.total]),[['644',1],['656',2]]);
  assert.deepEqual(r[1].porCat,{indeterminada:1,so_mes:1});
});

/* ---------- remuneração ---------- */
const fi=(prov,desc,evs,folha)=>({Folha:folha||'MENSAL',Prov:prov,Desc:desc,Liq:Math.round((prov-desc)*100)/100,Eventos:evs});
const ev=(id,nome,p,d)=>({Id:id,Nome:nome,P:p,D:d});

test('remuneração igual nos dois meses',()=>{
  const f=()=>[fi(5000,1000,[ev(50,'SALÁRIO',5000,0),ev(52,'INSS',0,1000)])];
  const c=CF.compararFichas(f(),f());
  assert.equal(c.status,'igual');assert.deepEqual(c.mudancas,[]);
});

test('bruto mudou: aponta o evento que explica a diferença',()=>{
  const ant=[fi(5000,1000,[ev(50,'SALÁRIO',5000,0),ev(52,'INSS',0,1000)])];
  const atu=[fi(6000,1000,[ev(50,'SALÁRIO',5000,0),ev(149,'QUINQUÊNIO',1000,0),ev(52,'INSS',0,1000)])];
  const c=CF.compararFichas(atu,ant);
  assert.equal(c.status,'bruto');assert.equal(c.d.prov,1000);assert.equal(c.d.liq,1000);
  assert.deepEqual(c.mudancas.map(m=>[m.id,m.tipo,m.efeito]),[['149','novo',1000]]);
});

test('só descontos mudaram (bruto igual): consignação nova',()=>{
  const ant=[fi(5000,1000,[ev(50,'SALÁRIO',5000,0),ev(52,'INSS',0,1000)])];
  const atu=[fi(5000,1366.02,[ev(50,'SALÁRIO',5000,0),ev(52,'INSS',0,1000),ev(913,'PENHORA',0,366.02)])];
  const c=CF.compararFichas(atu,ant);
  assert.equal(c.status,'desconto');assert.equal(c.d.liq,-366.02);
  assert.deepEqual(c.mudancas.map(m=>[m.id,m.tipo,m.efeito]),[['913','novo',-366.02]]);
});

test('evento que saiu da ficha e valor que mudou',()=>{
  const ant=[fi(5000,1100,[ev(50,'SALÁRIO',5000,0),ev(91,'CONVENIO',0,100),ev(52,'INSS',0,1000)])];
  const atu=[fi(5000,1050,[ev(50,'SALÁRIO',5000,0),ev(52,'INSS',0,1050)])];
  const c=CF.compararFichas(atu,ant);
  assert.deepEqual(c.mudancas.map(m=>[m.id,m.tipo]),[['91','saiu'],['52','mudou']]);
});

test('novo na folha, saiu da folha, sem ficha',()=>{
  const f=[fi(5000,1000,[])];
  assert.equal(CF.compararFichas(f,[]).status,'novo');
  assert.equal(CF.compararFichas([],f).status,'saiu');
  assert.equal(CF.compararFichas([],[]).status,'sem');
});

test('tolerância: diferenças pequenas não contam; 13º entra como outra folha',()=>{
  const ant=[fi(5000,1000,[])],atu=[fi(5000.5,1000,[])];
  assert.equal(CF.compararFichas(atu,ant,0).status,'bruto');
  assert.equal(CF.compararFichas(atu,ant,1).status,'igual');
  const c=CF.compararFichas([fi(5000,1000,[ev(50,'SAL',5000,0)]),fi(5000,0,[ev(8,'13º SALÁRIO',5000,0)],'13º SALÁRIO')],[fi(5000,1000,[ev(50,'SAL',5000,0)])]);
  assert.equal(c.status,'bruto');assert.match(c.mudancas[0].nome,/13º/);
});

test('a conferência marcada deixa de valer se os valores mudarem depois',()=>{
  const c=CF.compararFichas([fi(5000,1000,[])],[fi(4000,1000,[])]);
  assert.equal(CF.conferenciaValida({prov:5000,liq:4000},c),true);
  assert.equal(CF.conferenciaValida({prov:5000,liq:3900},c),false);
  assert.equal(CF.conferenciaValida(null,c),false);
});

test('descreverMudanca: entrou, saiu, aumentou e diminuiu, com a natureza (provento ou desconto)',()=>{
  const c=CF.compararFichas(
    [fi(7000,1500,[ev(50,'SAL',5000,0),ev(917,'INDENIZAÇÃO',2000,0),ev(913,'PENHORA',0,500),ev(52,'INSS',0,1000)])],
    [fi(6000,1100,[ev(50,'SAL',5000,0),ev(662,'13º ADIANT.',1000,0),ev(52,'INSS',0,800),ev(91,'CONVENIO',0,300)])]);
  const d=id=>CF.descreverMudanca(c.mudancas.find(m=>m.id===id));
  assert.deepEqual(d('917'),{verbo:'Entrou',natureza:'provento',de:0,para:2000});
  assert.deepEqual(d('662'),{verbo:'Saiu',natureza:'provento',de:1000,para:0});
  assert.deepEqual(d('913'),{verbo:'Entrou',natureza:'desconto',de:0,para:500});
  assert.deepEqual(d('52'),{verbo:'Aumentou',natureza:'desconto',de:800,para:1000});
  assert.equal(d('91').verbo,'Saiu');
  assert.equal(c.todos.length,6);                               // todos os eventos dos dois meses
  assert.equal(c.todos.find(m=>m.id==='50').mudou,false);       // o salário base não mudou
  assert.equal(c.todos[0].id==='50'||c.todos[0].id==='917',true);   // proventos primeiro
});

test('nome do evento: a folha só aparece entre parênteses quando acrescenta informação',()=>{
  const un=(nome,folha)=>CF.compararFichas([fi(100,0,[ev(917,nome,100,0)],folha)],[]).todos[0].nome;
  assert.equal(un('INDENIZAÇÃO LICENÇA PRÊMIO.','INDENIZAÇÃO LICENÇA PRÊMIO'),'INDENIZAÇÃO LICENÇA PRÊMIO.');   // repete o nome: sem parênteses
  assert.equal(un('13º SALÁRIO ADIANTAMENTO','13º SALÁRIO'),'13º SALÁRIO ADIANTAMENTO');
  assert.equal(un('SALÁRIO BASE','MENSAL'),'SALÁRIO BASE');
  assert.equal(un('SALÁRIO BASE','FOLHA COMPLEMENTAR'),'SALÁRIO BASE (FOLHA COMPLEMENTAR)');
  assert.equal(un('SALÁRIO BASE',''),'SALÁRIO BASE');
});

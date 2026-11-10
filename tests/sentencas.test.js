/* Testes do motor de sentenças (src/sentencas-engine.js). Rodar: node --test tests/ */
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/sentencas-engine.js');

test('competências: soma de meses, virada de ano e intervalo',()=>{
  assert.equal(S.somaMes('2026-11',1),'2026-12');
  assert.equal(S.somaMes('2026-12',1),'2027-01');
  assert.equal(S.somaMes('2026-01',-1),'2025-12');
  assert.deepEqual(S.meses('2026-11','2027-02'),['2026-11','2026-12','2027-01','2027-02']);
  assert.deepEqual(S.meses('2027-02','2026-11'),[]);
  assert.equal(S.fmtKey('2026-03'),'03/2026');
});

test('valor do evento: soma as folhas do mês e ignora outros eventos',()=>{
  const fichas=[{Eventos:[{Id:50,Desconto:0},{Id:913,Desconto:366.02},{Id:52,Desconto:988.07}]},{Eventos:[{Id:913,Desconto:100.01}]}];
  assert.deepEqual(S.valorDoEvento(fichas,913),{valor:466.03,achou:true});
  assert.deepEqual(S.valorDoEvento(fichas,'913'),{valor:466.03,achou:true});
  assert.deepEqual(S.valorDoEvento(fichas,777),{valor:0,achou:false});
  assert.deepEqual(S.valorDoEvento([],913),{valor:0,achou:false});
});

const h=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{v}]));

test('por valor: saldo, parcela, meses restantes e previsão de término',()=>{
  const it={modo:'valor',total:3660.2,antes:0,desde:'2026-08',hist:h({'2026-08':366.02,'2026-09':366.02,'2026-10':366.02})};
  const r=S.calcular(it,'2026-11');
  assert.equal(r.pago,1098.06);
  assert.equal(r.falta,2562.14);
  assert.equal(r.parcela,366.02);
  assert.equal(r.mesesRest,7);
  assert.equal(r.termino,'2027-05');          // último mês lido (10/2026) + 7
  assert.deepEqual(r.pendentes,['2026-11']);   // a folha de novembro ainda não existe
  assert.equal(r.situacao,'andamento');
  assert.equal(Math.round(r.pct),30);
});

test('por valor: "já descontado antes" entra no total pago e a última parcela menor quita',()=>{
  const it={modo:'valor',total:1000,antes:700,desde:'2026-10',hist:h({'2026-10':200,'2026-11':100})};
  const r=S.calcular(it,'2026-11');
  assert.equal(r.pago,1000);
  assert.equal(r.falta,0);
  assert.equal(r.quitada,true);
  assert.equal(r.quitadaEm,'2026-11');
  assert.equal(r.situacao,'quitada');
});

test('por valor: faltando até 2 parcelas fica "final"; desconto passando do total é "atenção"',()=>{
  assert.equal(S.calcular({modo:'valor',total:1000,desde:'2026-09',hist:h({'2026-09':400,'2026-10':400})},'2026-10').situacao,'final');
  const r=S.calcular({modo:'valor',total:1000,desde:'2026-09',hist:h({'2026-09':600,'2026-10':600})},'2026-10');
  assert.equal(r.quitada,true);
  assert.equal(r.excedeu,200);
  assert.equal(r.situacao,'atencao');
});

test('evento que parou de descontar antes de quitar vira "atenção"',()=>{
  const r=S.calcular({modo:'valor',total:5000,desde:'2026-08',hist:h({'2026-08':500,'2026-09':500,'2026-10':0})},'2026-10');
  assert.equal(r.semDesconto,true);
  assert.equal(r.situacao,'atencao');
  assert.equal(r.parcela,500);   // usa a última parcela que realmente descontou
});

test('por parcelas: conta só meses com desconto',()=>{
  const it={modo:'parcelas',parcelas:12,parcelasAntes:2,desde:'2026-06',hist:h({'2026-06':300,'2026-07':300,'2026-08':0,'2026-09':300})};
  const r=S.calcular(it,'2026-09');
  assert.equal(r.parcelasPagas,5);
  assert.equal(r.faltaParcelas,7);
  assert.equal(r.falta,2100);
  assert.equal(r.termino,'2027-04');
  assert.equal(r.quitada,false);
});

test('por parcelas: quitada na última parcela',()=>{
  const r=S.calcular({modo:'parcelas',parcelas:2,desde:'2026-09',hist:h({'2026-09':300,'2026-10':300})},'2026-10');
  assert.equal(r.quitada,true);
  assert.equal(r.quitadaEm,'2026-10');
});

test('sem total nem parcelas: só soma o que foi descontado',()=>{
  const r=S.calcular({modo:'valor',total:0,desde:'2026-09',hist:h({'2026-09':300,'2026-10':300})},'2026-10');
  assert.equal(r.modo,'livre');
  assert.equal(r.pago,600);
  assert.equal(r.falta,null);
  assert.equal(r.situacao,'livre');
});

test('meses antes do início ou depois de hoje não entram na soma',()=>{
  const r=S.calcular({modo:'valor',total:1000,desde:'2026-09',hist:h({'2026-07':999,'2026-09':100,'2026-12':999})},'2026-10');
  assert.equal(r.pago,100);
});

test('lerFichas: lê só o que falta (e relê os dois últimos) e guarda o valor do evento',async()=>{
  const it={mat:'1',evento:{id:'913'},desde:'2026-07',hist:h({'2026-07':100,'2026-08':100,'2026-09':100})};
  const lidos=[];
  const buscar=async(mat,k)=>{lidos.push(k);return k==='2026-11'?[]:[{Eventos:[{Id:913,Desconto:150}]}];};
  const r=await S.lerFichas(it,'2026-11',buscar);
  assert.deepEqual(lidos.sort(),['2026-08','2026-09','2026-10','2026-11']);   // 07 já estava lido e não é um dos dois últimos
  assert.equal(r.lidos,3);assert.equal(r.erro,null);
  assert.equal(it.hist['2026-10'].v,150);
  assert.equal(it.hist['2026-07'].v,100);
  assert.ok(!('2026-11' in it.hist));   // folha ainda não existe
  assert.ok(it.lidoEm);
});

test('lerFichas: erro de leitura para e não marca a hora da leitura',async()=>{
  const it={mat:'1',evento:{id:'913'},desde:'2026-10',hist:{}};
  const r=await S.lerFichas(it,'2026-11',async()=>{throw new Error('Centi fora');});
  assert.equal(r.erro.message,'Centi fora');
  assert.equal(it.lidoEm,undefined);
});

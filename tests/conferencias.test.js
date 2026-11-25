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

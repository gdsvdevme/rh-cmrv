const test=require('node:test'),assert=require('node:assert');
const E=require('../src/extenso.js');
test('valor por extenso',()=>{
  const c=[[2300,'dois mil e trezentos reais'],[1000,'mil reais'],[1,'um real'],[0.5,'cinquenta centavos'],[0.01,'um centavo'],
    [1500.5,'mil e quinhentos reais e cinquenta centavos'],[1101,'mil cento e um reais'],[1250,'mil duzentos e cinquenta reais'],
    [2000,'dois mil reais'],[100,'cem reais'],[101,'cento e um reais'],[2345.67,'dois mil trezentos e quarenta e cinco reais e sessenta e sete centavos'],
    [1000000,'um milhão de reais'],[2000000,'dois milhões de reais'],[1000001,'um milhão e um reais'],[12000,'doze mil reais'],[21000,'vinte e um mil reais'],
    [0,'zero real'],['2.300,00','dois mil e trezentos reais'],['R$ 2300,5','dois mil e trezentos reais e cinquenta centavos'],['2.300','dois mil e trezentos reais'],
    [19.99,'dezenove reais e noventa e nove centavos'],[1100000,'um milhão e cem mil reais'],[16,'dezesseis reais']];
  for(const [v,e] of c) assert.strictEqual(E.reais(v),e,String(v));
  assert.strictEqual(E.reais('abc'),'');
});
test('moeda',()=>{assert.strictEqual(E.moeda(2300),'2.300,00');assert.strictEqual(E.moeda('1234,5'),'1.234,50');assert.strictEqual(E.moeda(''),'');});

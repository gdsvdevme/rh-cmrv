/* Valor por extenso em reais (pt-BR), usado pelo Gerador de Documentos. Testes: tests/extenso.test.js */
(function(root){
'use strict';
const U=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const D=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const C=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
/* 1 a 999 */
function centena(n){
  if(n===100) return 'cem';
  const c=Math.floor(n/100),r=n%100,p=[];
  if(c) p.push(C[c]);
  if(r){ if(r<20) p.push(U[r]); else p.push(D[Math.floor(r/10)]+(r%10?' e '+U[r%10]:'')); }
  return p.join(' e ');
}
/* inteiro de 0 a 999.999.999.999 */
function inteiro(n){
  if(n===0) return 'zero';
  const g=[Math.floor(n/1e9)%1000,Math.floor(n/1e6)%1000,Math.floor(n/1e3)%1000,n%1000];
  const nomes=[['bilhão','bilhões'],['milhão','milhões'],['mil','mil'],['','']];
  const partes=[];
  g.forEach((v,i)=>{
    if(!v) return;
    if(i===2) partes.push(v===1?'mil':centena(v)+' mil');
    else if(i<2) partes.push(centena(v)+' '+nomes[i][v===1?0:1]);
    else partes.push(centena(v));
  });
  if(partes.length===1) return partes[0];
  /* "e" antes do último grupo quando ele é menor que 100 ou múltiplo de 100 (dois mil e trezentos; mil cento e um) */
  const ult=g[3]?g[3]:(g[2]?g[2]:g[1]);
  const liga=ult<100||ult%100===0;
  const ultimo=partes.pop();
  return partes.join(' ')+(liga?' e ':' ')+ultimo;
}
/* centavos: número (1234.5), ou texto "1.234,50" */
function paraCentavos(v){
  if(typeof v==='number') return isFinite(v)?Math.round(v*100):null;
  let s=String(v==null?'':v).replace(/[R$\s]/g,'');
  if(!s) return null;
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  if(!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s)*100);
}
/* 2300 -> "dois mil e trezentos reais" */
function reais(v){
  const c=paraCentavos(v);
  if(c==null||c<0||c>=1e14) return '';
  const r=Math.floor(c/100),cs=c%100,p=[];
  if(r){
    const milhaoExato=r>=1e6&&r%1e6===0;                 // "um milhão de reais"
    p.push(inteiro(r)+(milhaoExato?' de':'')+(r===1?' real':milhaoExato?' reais':' reais'));
  }
  if(cs) p.push(inteiro(cs)+(cs===1?' centavo':' centavos'));
  return p.length?p.join(' e '):'zero real';
}
/* 2300 -> "2.300,00" */
function moeda(v){
  const c=paraCentavos(v);
  if(c==null) return '';
  const r=String(Math.floor(c/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return r+','+String(c%100).padStart(2,'0');
}
const API={reais,moeda,inteiro,paraCentavos};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else root.EXT=API;
})(typeof window!=='undefined'?window:globalThis);

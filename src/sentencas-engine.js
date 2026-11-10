/* Motor de cálculo do acompanhamento de sentenças judiciais (penhora salarial, pensão, consignações por ordem judicial).
   Cada acompanhamento = um servidor + um evento da folha (ex.: 913 PENHORA SALARIAL) + o total devido (em R$ ou em parcelas).
   Todo mês o sistema lê a ficha financeira (FP024) e guarda quanto o evento descontou naquele mês; o saldo é
   "total - tudo que já foi descontado". Não depende de tela nem de rede: é inserido na página pelo build.py e carregado
   pelos testes (tests/sentencas.test.js). Competências são textos "AAAA-MM". */
(function(root){
const r2=n=>Math.round((Number(n)||0)*100)/100;
const key=(ano,mes)=>ano+'-'+String(mes).padStart(2,'0');
const parseKey=k=>{const m=/^(\d{4})-(\d{2})$/.exec(String(k||''));return m?{ano:+m[1],mes:+m[2]}:null;};
const somaMes=(k,n)=>{const p=parseKey(k);if(!p) return null;const t=p.ano*12+(p.mes-1)+n;return key(Math.floor(t/12),t%12+1);};
const fmtKey=k=>{const p=parseKey(k);return p?String(p.mes).padStart(2,'0')+'/'+p.ano:'';};
/* de..ate inclusive (limite de 600 meses por segurança) */
const meses=(de,ate)=>{const out=[];if(!parseKey(de)||!parseKey(ate)) return out;for(let k=de;k<=ate&&out.length<600;k=somaMes(k,1)) out.push(k);return out;};

/* quanto o evento descontou nas fichas do mês (pode haver mais de uma folha: mensal, 13º, complementar...).
   -> {valor, achou}; achou=false quando o evento nem aparece na ficha (o mês não teve desconto) */
function valorDoEvento(fichas,eventoId){
  let v=0,n=0;
  (fichas||[]).forEach(f=>(f.Eventos||[]).forEach(e=>{if(String(e.Id)===String(eventoId)){v+=Number(e.Desconto)||0;n++;}}));
  return {valor:r2(v),achou:n>0};
}

/* it: {modo:'valor'|'parcelas'|'livre', total, antes, parcelas, parcelasAntes, desde:'AAAA-MM', hist:{'AAAA-MM':{v}}}
   hoje: 'AAAA-MM' do mês corrente. */
function calcular(it,hoje){
  const hist=it.hist||{};
  const todos=Object.keys(hist).filter(k=>k>=(it.desde||'0000-00')&&k<=hoje).sort();
  const pagos=todos.filter(k=>Number(hist[k].v)>0);
  const pagoMeses=r2(pagos.reduce((s,k)=>s+Number(hist[k].v),0));
  const pago=r2((Number(it.antes)||0)+pagoMeses);
  const parcelasPagas=(Number(it.parcelasAntes)||0)+pagos.length;
  const ultimo=todos.length?todos[todos.length-1]:null;                 // último mês com ficha lida
  const ultimoPago=pagos.length?pagos[pagos.length-1]:null;
  const parcela=ultimoPago?r2(hist[ultimoPago].v):0;                    // valor do último desconto
  const pendentes=it.desde?meses(it.desde,hoje).filter(k=>!(k in hist)):[];
  const o={pago,parcelasPagas,ultimo,ultimoPago,parcela,pendentes,modo:it.modo||'livre',pct:null,falta:null,faltaParcelas:null,
    mesesRest:null,termino:null,quitada:false,quitadaEm:null,excedeu:0,semDesconto:false,situacao:'livre'};
  if(o.modo==='valor'&&Number(it.total)>0){
    const total=r2(it.total);
    o.falta=Math.max(0,r2(total-pago));o.pct=Math.min(100,pago/total*100);
    o.quitada=o.falta<0.005;o.excedeu=pago>total+0.005?r2(pago-total):0;
    if(o.quitada){   // em que mês o saldo chegou a zero
      let acc=Number(it.antes)||0;if(acc>=total-0.005) o.quitadaEm=it.desde;
      else for(const k of pagos){acc+=Number(hist[k].v);if(acc>=total-0.005){o.quitadaEm=k;break;}}
    }else if(parcela>0){o.mesesRest=Math.ceil(o.falta/parcela-1e-9);o.termino=ultimo?somaMes(ultimo,o.mesesRest):null;}
  }else if(o.modo==='parcelas'&&Number(it.parcelas)>0){
    const tot=Number(it.parcelas);
    o.faltaParcelas=Math.max(0,tot-parcelasPagas);o.pct=Math.min(100,parcelasPagas/tot*100);
    o.quitada=o.faltaParcelas===0;o.falta=parcela?r2(o.faltaParcelas*parcela):null;
    if(o.quitada){const need=tot-(Number(it.parcelasAntes)||0);o.quitadaEm=need<=0?it.desde:(pagos[need-1]||null);}
    else{o.mesesRest=o.faltaParcelas;o.termino=ultimo?somaMes(ultimo,o.faltaParcelas):null;}
  }else o.modo='livre';
  o.semDesconto=!o.quitada&&o.modo!=='livre'&&!!ultimo&&!(Number(hist[ultimo].v)>0);   // o evento parou de descontar antes de quitar
  o.situacao=o.modo==='livre'?'livre':o.quitada?(o.excedeu>0?'atencao':'quitada'):(o.semDesconto?'atencao':(o.mesesRest!=null&&o.mesesRest<=2?'final':'andamento'));
  return o;
}

/* Lê as fichas que faltam e guarda em it.hist o que o evento descontou em cada mês. Lê as competências sem ficha lida
   e relê as duas últimas (o Centi ainda pode reprocessar); tudo=true relê desde o início.
   buscar(matricula, 'AAAA-MM') -> Promise<fichas[]> (vazio = folha ainda não existe). Devolve {lidos, erro}. */
async function lerFichas(it,hoje,buscar,opc){
  opc=opc||{};
  it.hist=it.hist||{};
  const ultimos=Object.keys(it.hist).sort().slice(-2);
  const fila=meses(it.desde,hoje).filter(k=>opc.tudo||!(k in it.hist)||ultimos.includes(k));
  let lidos=0,erro=null,feitos=0;
  for(let i=0;i<fila.length&&!erro;i+=3){
    await Promise.all(fila.slice(i,i+3).map(async k=>{
      try{
        const fs=await buscar(it.mat,k);
        if(fs&&fs.length){const v=valorDoEvento(fs,it.evento.id);it.hist[k]={v:v.valor,f:fs.length};lidos++;}
      }catch(e){erro=erro||e;}
      feitos++;if(opc.andamento) opc.andamento(feitos,fila.length);
    }));
  }
  if(!erro) it.lidoEm=new Date().toISOString();
  return {lidos,erro};
}

const API={lerFichas,r2,key,parseKey,somaMes,fmtKey,meses,valorDoEvento,calcular};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else root.SP=API;
})(typeof window!=='undefined'?window:globalThis);

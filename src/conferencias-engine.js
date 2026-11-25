/* Motor das Conferências (hoje: Determinação de eventos). Classifica cada lançamento de evento de um servidor
   (FP001 > Eventos: recorrência, data inicial e data final) em relação ao mês de referência. Não depende de tela nem de rede:
   é inserido na página pelo build.py e carregado pelos testes (tests/conferencias.test.js). Datas "DD/MM/AAAA" viram dias em UTC. */
(function(root){
const D=s=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||'').trim());return m?Date.UTC(+m[3],+m[2]-1,+m[1]):null;};
const fmt=ms=>{if(ms==null) return '';const d=new Date(ms);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();};
const ANO_SEM_FIM=2090;   // data final em 2099 etc. é "sem fim" na prática

const CATEGORIAS={
  indeterminada:'Indeterminada',
  determinada:'Determinada (até a data final)',
  so_mes:'Determinada só no mês',
  vence_mes:'Vence no mês',
  ate_2099:'Determinada até 2099 (sem fim na prática)',
  futura:'Começa depois do mês',
  sem_data:'Determinada sem data final'
};
const ORDEM=['sem_data','so_mes','vence_mes','determinada','futura','ate_2099','indeterminada'];

/* l: {Recorrencia:'Determinada'|'Indeterminada', Inicio, Fim}; mes/ano: referência. -> {cat, ini, fim} */
function classificar(l,mes,ano){
  const ini=D(l.Inicio),fim=D(l.Fim);
  const m0=Date.UTC(ano,mes-1,1),m1=Date.UTC(ano,mes,0);
  const o={ini,fim,cat:'determinada'};
  if(ini!=null&&ini>m1){o.cat='futura';return o;}
  if(l.Recorrencia==='Indeterminada'){o.cat='indeterminada';return o;}
  if(fim==null){o.cat='sem_data';return o;}
  if(new Date(fim).getUTCFullYear()>=ANO_SEM_FIM){o.cat='ate_2099';return o;}
  if(fim<m0){o.cat='determinada';o.vencida=true;return o;}   // não deveria vir do Centi; fica marcado
  if(ini!=null&&ini>=m0&&fim<=m1){o.cat='so_mes';return o;}
  if(fim<=m1){o.cat='vence_mes';return o;}
  return o;
}

/* resumo por evento: {chave (código ou nome), codigo, nome, total, porCat:{cat:n}} ordenado por nome */
function porEvento(itens){
  const m=new Map();
  itens.forEach(x=>{
    const k=x.l.Codigo||x.l.Evento;
    if(!m.has(k)) m.set(k,{chave:k,codigo:x.l.Codigo||'',nome:x.l.Evento,total:0,porCat:{}});
    const e=m.get(k);e.total++;e.porCat[x.c.cat]=(e.porCat[x.c.cat]||0)+1;
  });
  return [...m.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}

const API={D,fmt,CATEGORIAS,ORDEM,classificar,porEvento};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else root.CF=API;
})(typeof window!=='undefined'?window:globalThis);

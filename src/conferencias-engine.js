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

/* ---------- Conferência de remuneração: ficha do mês x ficha do mês anterior ---------- */
const r2=n=>Math.round((Number(n)||0)*100)/100;
const soma=(fs,k)=>r2((fs||[]).reduce((t,f)=>t+(Number(f[k])||0),0));
/* atual / anterior: listas de fichas {Folha,Prov,Desc,Liq,Eventos:[{Id,Nome,P,D}]} (uma por folha: mensal, 13º...), ou vazias.
   tol: diferenças até esse valor (R$) não contam como divergência. 
   -> {status:'sem'|'novo'|'saiu'|'igual'|'bruto'|'desconto', a:{prov,desc,liq}, b:{...}, d:{prov,desc,liq}, mudancas:[{id,nome,tipo,pa,da,pb,db,efeito}]}
   'bruto' = os proventos mudaram; 'desconto' = só os descontos mudaram (o bruto é igual); 'novo'/'saiu' = há ficha em só um dos meses. */
function compararFichas(atual,anterior,tol){
  tol=Number(tol)||0;const t=tol+0.004;
  const a={prov:soma(atual,'Prov'),desc:soma(atual,'Desc'),liq:soma(atual,'Liq')},b={prov:soma(anterior,'Prov'),desc:soma(anterior,'Desc'),liq:soma(anterior,'Liq')};
  const d={prov:r2(a.prov-b.prov),desc:r2(a.desc-b.desc),liq:r2(a.liq-b.liq)};
  const mapa=new Map();
  const poe=(fs,lado)=>(fs||[]).forEach(f=>(f.Eventos||[]).forEach(e=>{
    const k=String(e.Id)+(/^mensal$/i.test(f.Folha||'')?'':'@'+(f.Folha||''));
    if(!mapa.has(k)) mapa.set(k,{id:String(e.Id),nome:e.Nome+(/^mensal$/i.test(f.Folha||'')?'':' ('+(f.Folha||'outra folha')+')'),pa:0,da:0,pb:0,db:0,ta:false,tb:false});
    const m=mapa.get(k);m['p'+lado]=r2(m['p'+lado]+(Number(e.P)||0));m['d'+lado]=r2(m['d'+lado]+(Number(e.D)||0));m['t'+lado]=true;
  }));
  poe(atual,'a');poe(anterior,'b');
  const mudancas=[...mapa.values()].filter(m=>Math.abs(m.pa-m.pb)>0.004||Math.abs(m.da-m.db)>0.004)
    .map(m=>Object.assign(m,{efeito:r2((m.pa-m.da)-(m.pb-m.db)),tipo:!m.tb?'novo':!m.ta?'saiu':'mudou'}))
    .sort((x,y)=>Math.abs(y.efeito)-Math.abs(x.efeito)||x.nome.localeCompare(y.nome,'pt-BR'));
  const temA=(atual||[]).length>0,temB=(anterior||[]).length>0;
  let status;
  if(!temA&&!temB) status='sem';else if(temA&&!temB) status='novo';else if(!temA&&temB) status='saiu';
  else if(Math.abs(d.prov)>t) status='bruto';
  else if(Math.abs(d.liq)>t||Math.abs(d.desc)>t) status='desconto';
  else status='igual';
  const todos=[...mapa.values()].map(m=>Object.assign(m,{mudou:Math.abs(m.pa-m.pb)>0.004||Math.abs(m.da-m.db)>0.004,efeito:r2((m.pa-m.da)-(m.pb-m.db)),tipo:!m.tb?'novo':!m.ta?'saiu':'mudou'}))
    .sort((x,y)=>((y.pa||y.pb)>0)-((x.pa||x.pb)>0)||Math.max(y.pa,y.da,y.pb,y.db)-Math.max(x.pa,x.da,x.pb,x.db));
  return {status,a,b,d,mudancas,todos};
}
/* texto claro de uma mudança de evento: {verbo:'Entrou'|'Saiu'|'Aumentou'|'Diminuiu', natureza:'provento'|'desconto', de, para} (valores do próprio evento) */
function descreverMudanca(m){
  const natureza=(m.pa>0||m.pb>0)?'provento':'desconto';
  const para=natureza==='provento'?m.pa:m.da,de=natureza==='provento'?m.pb:m.db;
  const verbo=m.tipo==='novo'?'Entrou':m.tipo==='saiu'?'Saiu':(para>de?'Aumentou':'Diminuiu');
  return {verbo,natureza,de,para};
}
const STATUS_REM={bruto:'Bruto mudou',desconto:'Só descontos mudaram',novo:'Novo na folha',saiu:'Saiu da folha',igual:'Igual',sem:'Sem ficha'};
/* a conferência feita vale enquanto os valores forem os mesmos de quando foi marcada */
const conferenciaValida=(rec,c)=>!!rec&&Math.abs((rec.prov||0)-c.a.prov)<0.005&&Math.abs((rec.liq||0)-c.a.liq)<0.005;

const API={D,fmt,CATEGORIAS,ORDEM,classificar,porEvento,compararFichas,descreverMudanca,STATUS_REM,conferenciaValida,r2};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else root.CF=API;
})(typeof window!=='undefined'?window:globalThis);

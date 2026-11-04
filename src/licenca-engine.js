/* Motor de cálculo da licença-prêmio – Câmara Municipal de Rio Verde/GO.
   Base: Estatuto dos Funcionários (Lei nº 3.968/2000, consolidada), arts. 194 a 197, seção "Da licença prêmio".
   Não depende de tela nem de rede: é inserido na página de licença-prêmio pelo build.py e também é carregado pelos testes
   (tests/licenca.test.js). Datas são sempre dias inteiros em UTC (milissegundos). */
(function(root){
'use strict';

const DAY=864e5;
const REGRA={
  AQUIS_ANOS:5,          // art. 194: a cada 5 anos de efetivo exercício
  DIAS:90,               // art. 194: licença de 90 dias
  JANELA_ANOS:5,         // art. 194, §4º: gozo nos 5 anos seguintes ao período aquisitivo
  REQUERER_DIAS:90,      // art. 194, §7º: depois da janela, 90 dias para requerer, sob pena de perda
  CONCEDER_DIAS:30,      // art. 194, §8º: a Administração tem 30 dias para conceder (ou propor indenização)
  PARCELA_MIN:15,        // art. 194, §5º: parcelas de no mínimo 15 dias…
  PARCELA_INTERVALO:30,  // …com 30 dias entre uma e outra
  LIM_FAMILIA:30,        // arts. 196, I e 197, I: doença em pessoa da família, até 30 dias suspende; acima disso interrompe
  LIM_FALTAS:10,         // arts. 196, IV e 197, III: faltas injustificadas, até 10 dias suspende; acima disso interrompe
  LC181:Date.UTC(2020,4,6) // LC 181/2020 criou o prazo de gozo e a perda do direito
};

/* ---------- datas ---------- */
const D=s=>{const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s==null?'':s).trim());return m?Date.UTC(+m[3],+m[2]-1,+m[1]):null;};
const isoMs=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s==null?'':s));return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null;};
const toIso=ms=>ms==null?'':new Date(ms).toISOString().slice(0,10);
const fmt=ms=>{if(ms==null) return '';const d=new Date(ms);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();};
const dias=(a,b)=>Math.round((b-a)/DAY)+1;   // dias corridos, contando os dois extremos
const addAnos=(ms,n)=>{const d=new Date(ms),y=d.getUTCFullYear()+n,m=d.getUTCMonth(),r=Date.UTC(y,m,d.getUTCDate());return new Date(r).getUTCMonth()!==m?Date.UTC(y,m+1,0):r;};   // 29/02 + 1 ano = 28/02
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/* ---------- o que cada tipo de afastamento do Centi faz com a contagem ---------- */
const EFEITOS={
  'licenca-premio':'Licença-prêmio (gozo)',
  suspende:'Suspende a contagem',
  interrompe:'Interrompe (recomeça do zero)',
  familia:'Doença na família (suspende até 30 dias; acima disso interrompe)',
  falta:'Falta injustificada (suspende até 10 dias; acima disso interrompe)',
  neutro:'Conta como exercício (não altera)',
  revisar:'A revisar (tratado como exercício até o RH classificar)'
};
/* ordem importa: vale a primeira regra que casar (texto sem acento e em minúsculas) */
const REGRAS_TIPO=[
  [/premio/,'licenca-premio'],
  [/familia/,'familia'],
  [/interesse particular/,'interrompe'],
  [/mandato eletivo/,'interrompe'],
  [/(suspens|suspenc).*(pad|disciplin|processo)|disciplinar/,'interrompe'],
  [/atividade politica|mandato classista|servico militar|curso|doutorado|mestrado|especializacao|capacitacao|treinamento|aperfeicoamento|formacao/,'suspende'],
  [/maternidade|paternidade|gestante|adocao|amamentacao/,'neutro'],
  [/disposicao|cessao|cedid/,'neutro'],
  [/exercicio.*cargo|cargo comissionado|funcao gratificada/,'neutro'],
  [/gala|casamento|nojo|luto|sangue|sessao|juri|ferias/,'neutro'],
  [/suspens|suspenc|judicial/,'revisar'],
  [/medica|inss|rpps|saude|doenca|acidente/,'suspende']
];
function classificarTipo(tipo,mapa){
  const n=norm(tipo);
  if(mapa&&mapa[n]&&EFEITOS[mapa[n]]) return {efeito:mapa[n],origem:'RH'};
  for(const r of REGRAS_TIPO) if(r[0].test(n)) return {efeito:r[1],origem:'padrão'};
  return {efeito:'revisar',origem:'padrão'};
}

/* ---------- cálculo ----------
   s: { adm:ms, eventos:[{tipo,efeito,ini,fim}] (afastamentos do Centi já classificados), registro:{...} }
   registro (guardado pelo RH): { inicio:'AAAA-MM-DD', conferido:bool, obs,
                                  eventos:[{id,tipo:'falta'|'suspende'|'interrompe'|'familia',ini,fim,obs}],
                                  gozos:[{id,tipo:'gozo'|'indenizacao',ini,fim,dias,obs}],
                                  periodos:{n:{acao:'quitada'|'indenizada'|'requerida',data,obs}} }
   cfg: { avisoDias } */
function calcular(s,hoje,cfg){
  cfg=cfg||{};
  const aviso=cfg.avisoDias==null?180:cfg.avisoDias;
  const reg=s.registro||{};
  const alertas=[];
  const inicio=reg.inicio?isoMs(reg.inicio):s.adm;
  if(inicio==null) return {erro:'Sem data de admissão.',per:[],ciclos:[],alertas,tags:{},situacao:{codigo:'erro',rotulo:'Sem data de admissão'}};

  /* eventos que mexem na contagem (os do Centi e os lançados à mão) */
  const evs=[];
  (s.eventos||[]).forEach(e=>{if(e.ini!=null&&e.fim!=null) evs.push(Object.assign({origem:'centi'},e));});
  (reg.eventos||[]).forEach(m=>{
    const ini=isoMs(m.ini),fim=isoMs(m.fim||m.ini);if(ini==null||fim==null||fim<ini) return;
    evs.push({origem:'manual',id:m.id,tipo:m.tipo==='falta'?'Falta injustificada':m.tipo,efeito:m.tipo,ini,fim,obs:m.obs});
  });
  evs.sort((a,b)=>a.ini-b.ini||a.fim-b.fim);

  /* períodos aquisitivos: cada ciclo é fechado ao completar 5 anos (+ dias suspensos) ou interrompido */
  const novo=ini=>({ini,susp:0,susAte:-Infinity,fam:0,faltas:0,sus:[]});
  const fimDe=c=>addAnos(c.ini,REGRA.AQUIS_ANOS)-DAY+c.susp*DAY;
  const ciclos=[];
  let c=novo(inicio);
  const fechar=(fim,interrompido,motivo,ev)=>{ciclos.push({ini:c.ini,fim,interrompido,motivo:motivo||'',ev:ev||null,susp:c.susp,sus:c.sus,completo:!interrompido});};
  const suspender=(cc,ini,fim,ev)=>{
    const de=Math.max(ini,cc.susAte+DAY);
    if(fim>=de){const d=dias(de,fim);cc.susp+=d;cc.sus.push({ini:de,fim,dias:d,tipo:ev.tipo,origem:ev.origem});}
    cc.susAte=Math.max(cc.susAte,fim);
  };
  const interromper=(fim,motivo,ev)=>{fechar(fim,true,motivo,ev);c=novo(fim+DAY);};
  for(const e of evs){
    if(e.ini>hoje) continue;   // afastamento futuro ainda não aconteceu
    if(!['suspende','interrompe','familia','falta'].includes(e.efeito)) continue;
    const fimE=Math.min(e.fim,hoje);   // afastamento sem data de fim (ex.: 09/09/9999) vale até hoje e segue valendo a cada dia
    if(e.fim>hoje) alertas.push({nivel:'info',msg:'Afastamento "'+e.tipo+'" iniciado em '+fmt(e.ini)+' ainda está em andamento'+(e.fim>=Date.UTC(2090,0,1)?' (sem data de fim no Centi)':' (termina em '+fmt(e.fim)+')')+'. A contagem '+(e.efeito==='suspende'?'fica parada':'é interrompida')+' enquanto durar.'});
    while(fimDe(c)<e.ini){const f=fimDe(c);fechar(f,false);c=novo(f+DAY);}
    if(fimE<c.ini) continue;   // aconteceu antes do ciclo atual começar
    const ini=Math.max(e.ini,c.ini);
    if(e.efeito==='suspende') suspender(c,ini,fimE,e);
    else if(e.efeito==='interrompe') interromper(fimE,'Interrompido por: '+e.tipo,e);
    else if(e.efeito==='familia'){
      const d=dias(ini,fimE);
      if(c.fam+d<=REGRA.LIM_FAMILIA){c.fam+=d;suspender(c,ini,fimE,e);}
      else interromper(fimE,'Doença em pessoa da família acima de '+REGRA.LIM_FAMILIA+' dias no período',e);
    }else{   // falta injustificada
      const d=dias(ini,fimE);
      if(c.faltas+d<=REGRA.LIM_FALTAS){c.faltas+=d;suspender(c,ini,fimE,e);}
      else interromper(fimE,'Faltas injustificadas acima de '+REGRA.LIM_FALTAS+' dias no período',e);
    }
  }
  while(fimDe(c)<hoje){const f=fimDe(c);fechar(f,false);c=novo(f+DAY);}
  const atual={ini:c.ini,fim:fimDe(c),susp:c.susp,sus:c.sus,interrompido:false,completo:false,formacao:true,motivo:'',ev:null};
  ciclos.push(atual);

  /* numeração e datas de cada período que vale (os interrompidos não recebem número) */
  let n=0;
  ciclos.forEach(p=>{
    if(p.interrompido) return;
    p.n=++n;
    p.direitoEm=p.fim+DAY;
    p.janelaFim=addAnos(p.direitoEm,REGRA.JANELA_ANOS)-DAY;
    p.requererAte=p.janelaFim+REGRA.REQUERER_DIAS*DAY;
    p.cred=0;p.gozos=[];
  });
  const validos=ciclos.filter(p=>!p.interrompido),completos=validos.filter(p=>p.completo);

  /* gozos: os afastamentos "licença prêmio" do Centi e os lançados pelo RH, na ordem, abatendo do período mais antigo em aberto */
  const gozos=[];
  evs.filter(e=>e.efeito==='licenca-premio').forEach(e=>gozos.push({origem:'centi',tipo:'gozo',ini:e.ini,fim:e.fim,dias:dias(e.ini,e.fim),rotulo:e.tipo}));
  (reg.gozos||[]).forEach(g=>{
    const ini=isoMs(g.ini),fim=isoMs(g.fim||g.ini);if(ini==null||fim==null||fim<ini) return;
    const dup=gozos.find(x=>x.origem==='centi'&&x.ini===ini&&x.fim===fim);
    if(dup){if(g.obs&&!dup.obs) dup.obs=g.obs;return;}   // já veio do Centi: não conta de novo, só acrescenta a observação (ex.: nº da portaria)
    gozos.push({origem:'manual',id:g.id,tipo:g.tipo==='indenizacao'?'indenizacao':'gozo',ini,fim,dias:g.dias>0?+g.dias:dias(ini,fim),obs:g.obs,rotulo:g.tipo==='indenizacao'?'Indenização':'Gozo'});
  });
  /* marcas do RH por período (chave = número do período): quitada, indenizada ou requerida, com portaria, valor e data */
  const conf=!!reg.conferido,marcas=reg.periodos||{};
  completos.forEach(p=>{
    const m=marcas[p.n]||{};
    p.acao=m.acao||'';p.acaoData=m.data?isoMs(m.data):null;p.acaoObs=m.obs||'';p.acaoPortaria=m.portaria||'';
    const v=m.valor==null||m.valor===''?null:Number(m.valor);p.acaoValor=isFinite(v)?v:null;
  });
  gozos.sort((a,b)=>a.ini-b.ini);
  gozos.forEach(g=>{
    let resto=g.dias>=REGRA.DIAS?REGRA.DIAS:g.dias;   // 90 a 93 dias (meses de 31 dias) contam como a licença inteira
    let usou=false;
    for(const p of completos){
      if(resto<=0) break;
      if(p.acao==='quitada'||p.acao==='indenizada') continue;   // já resolvido pelo RH: o gozo do Centi vai para o próximo período em aberto
      const falta=REGRA.DIAS-p.cred;if(falta<=0) continue;
      const uso=Math.min(falta,resto);
      p.cred+=uso;resto-=uso;usou=true;
      p.gozos.push(Object.assign({},g,{usados:uso}));
      if(g.ini<p.direitoEm) alertas.push({nivel:'aviso',msg:(g.tipo==='indenizacao'?'Indenização':'Gozo')+' de '+fmt(g.ini)+' a '+fmt(g.fim)+' é anterior ao fim do período aquisitivo '+p.n+' ('+fmt(p.fim)+'). Confira as datas.'});
    }
    if(resto>0) alertas.push({nivel:'aviso',msg:(usou?'Parte d':'')+'o gozo de '+fmt(g.ini)+' a '+fmt(g.fim)+' não tem período aquisitivo completo para abater'+(usou?' ('+resto+' dias sobram)':'')+'. Confira o início da contagem.'});
  });

  /* situação de cada período completo */
  Object.keys(marcas).forEach(k=>{const p=validos.find(x=>String(x.n)===String(k));if(!p||!p.completo) alertas.push({nivel:'aviso',msg:'Existe uma marca do RH no período '+k+', que não existe (ou ainda não foi concluído) pelo cálculo atual. Revise os lançamentos.'});});
  completos.forEach(p=>{
    p.saldo=Math.max(0,REGRA.DIAS-p.cred);
    const quitado=p.saldo===0||p.acao==='quitada'||p.acao==='indenizada';
    if(quitado){p.status=p.acao==='indenizada'||(p.gozos.length&&p.gozos.every(g=>g.tipo==='indenizacao'))?'indenizada':'gozada';p.saldo=0;return;}
    if(p.acao==='requerida'){p.status='requerida';return;}
    if(hoje>p.janelaFim){
      if(!conf){p.status='conferir';return;}
      if(p.direitoEm<REGRA.LC181){p.status='anterior';return;}
      p.status=hoje>p.requererAte?'perdida':'vencida';return;
    }
    p.status=p.cred>0?'parcial':'disponivel';
    p.vencendo=(p.janelaFim-hoje)/DAY<=aviso;
  });
  validos.filter(p=>!p.completo).forEach(p=>{p.status='formacao';p.saldo=0;});

  /* resumo da pessoa */
  const abertos=completos.filter(p=>['disponivel','parcial','vencida','requerida','anterior'].includes(p.status));
  if(abertos.length>1) alertas.push({nivel:'aviso',msg:abertos.length+' períodos em aberto ao mesmo tempo. O art. 194, §6º não permite acumular mais de um período.',acum:true});
  completos.filter(p=>p.status==='requerida'&&p.acaoData!=null&&hoje-p.acaoData>REGRA.CONCEDER_DIAS*DAY).forEach(p=>alertas.push({nivel:'erro',msg:'Requerida em '+fmt(p.acaoData)+': passaram mais de '+REGRA.CONCEDER_DIAS+' dias sem concessão (art. 194, §8º).'}));
  evs.filter(e=>e.efeito==='revisar').forEach(e=>alertas.push({nivel:'info',msg:'Afastamento "'+e.tipo+'" ('+fmt(e.ini)+' a '+fmt(e.fim)+') ainda não foi classificado. Em Regras, escolha se ele suspende, interrompe ou não altera a contagem.'}));
  const emGozo=gozos.find(g=>g.tipo==='gozo'&&g.ini<=hoje&&hoje<=g.fim)||null;
  const st=k=>completos.some(p=>p.status===k);
  const tags={
    req:st('requerida'),
    venc:st('vencida')||st('perdida'),
    vencendo:completos.some(p=>(p.status==='disponivel'||p.status==='parcial')&&p.vencendo),
    disp:completos.some(p=>p.status==='disponivel'||p.status==='parcial'||p.status==='anterior'),
    conf:st('conferir'),
    gozo:!!emGozo,
    acum:abertos.length>1,
    form:!completos.length,
    naoconf:!conf
  };
  let situacao;
  if(tags.req) situacao={codigo:'req',rotulo:'Requerida'};
  else if(tags.venc) situacao={codigo:'venc',rotulo:st('perdida')&&!st('vencida')?'Direito perdido':'Vencida'};
  else if(tags.conf) situacao={codigo:'conf',rotulo:'A conferir'};
  else if(tags.vencendo) situacao={codigo:'vencendo',rotulo:'Vencendo'};
  else if(tags.disp) situacao={codigo:'disp',rotulo:'A gozar'};
  else if(tags.form) situacao={codigo:'form',rotulo:'Sem direito ainda'};
  else situacao={codigo:'dia',rotulo:'Em dia'};
  if(emGozo) situacao={codigo:'gozo',rotulo:'Em gozo'};
  return {inicio,per:validos.slice().reverse(),ciclos,interrompidos:ciclos.filter(p=>p.interrompido),gozos,emGozo,alertas,tags,situacao,
    saldo:completos.filter(p=>['disponivel','parcial','vencida','requerida','anterior'].includes(p.status)).reduce((t,p)=>t+p.saldo,0),
    proximo:validos.find(p=>!p.completo)||null};
}

/* ---------- leitura do relatório "Relação de afastamentos" (FP071) do Centi ----------
   O Centi só entrega esse relatório em PDF. O navegador abre o PDF com pdf.js e passa para cá, por página, os itens de texto
   ({s:texto,x,y}). Cada afastamento é uma linha com matrícula, funcionário, cargo, tipo, início, fim e dias; cargo e tipo podem
   quebrar em mais de uma linha, então os textos são separados pela posição horizontal das colunas (lida do cabeçalho). */
function parseAfastamentos(paginas){
  const rows=[],ruins=[];
  const DATA=/^\d{2}\/\d{2}\/\d{4}$/;
  for(const pag of paginas||[]){
    const its=(pag||[]).map(i=>({s:String(i.s==null?'':i.s).trim(),x:+i.x,y:+i.y})).filter(i=>i.s!==''&&isFinite(i.x)&&isFinite(i.y));
    its.sort((a,b)=>b.y-a.y||a.x-b.x);
    const linhas=[];
    for(const i of its){const l=linhas[linhas.length-1];if(l&&Math.abs(l.y-i.y)<=2) l.itens.push(i);else linhas.push({y:i.y,itens:[i]});}
    linhas.forEach(l=>l.itens.sort((a,b)=>a.x-b.x));
    let cab=null,rec=null;
    const fecha=()=>{if(!rec) return;const r=montar(rec,cab);if(r) rows.push(r);else ruins.push(rec.mat);rec=null;};
    for(const l of linhas){
      const t=l.itens.map(i=>i.s);
      if(t.includes('Matrícula')&&t.some(x=>/^Tipo afastamento/.test(x))){
        fecha();
        const x=nome=>{const i=l.itens.find(z=>z.s.startsWith(nome));return i?i.x:null;};
        const nome=x('Funcionário'),cargo=x('Cargo'),tipo=x('Tipo afastamento'),qtd=x('Qtd');
        cab=(nome!=null&&cargo!=null&&tipo!=null)?{nome:nome-3,cargo:cargo-3,tipo:tipo-3,dias:qtd==null?Infinity:qtd-10}:null;
        continue;
      }
      if(!cab) continue;
      if(t.some(x=>/^Qtde\.?$/.test(x))){fecha();continue;}   // total do grupo
      const p=l.itens[0];
      if(/^\d{6,10}$/.test(p.s)&&p.x<cab.nome){fecha();rec={mat:p.s,itens:l.itens.slice(1)};continue;}
      if(p.x<cab.nome){fecha();continue;}   // título de grupo
      if(rec) rec.itens.push(...l.itens);   // linha de continuação (cargo ou tipo quebrado)
    }
    fecha();
  }
  return {rows,ruins};
  function montar(rec,cb){
    const col={nome:[],cargo:[],tipo:[]},datas=[];let qtd=null;
    for(const i of rec.itens){
      if(DATA.test(i.s)){datas.push(D(i.s));continue;}
      if(/^\d{1,9}$/.test(i.s)&&i.x>=cb.dias){qtd=+i.s;continue;}   // afastamento sem data de fim (ex.: 09/09/9999) traz milhões de dias
      if(i.x>=cb.tipo) col.tipo.push(i.s);else if(i.x>=cb.cargo) col.cargo.push(i.s);else col.nome.push(i.s);
    }
    const j=a=>a.join(' ').replace(/\s+/g,' ').trim();
    if(datas.length<2||datas[0]==null||datas[1]==null||!j(col.tipo)) return null;
    return {mat:rec.mat,nome:j(col.nome),cargo:j(col.cargo),tipo:j(col.tipo),ini:datas[0],fim:datas[1],dias:qtd==null?dias(datas[0],datas[1]):qtd};
  }
}

const API={REGRA,EFEITOS,REGRAS_TIPO,D,isoMs,toIso,fmt,dias,addAnos,norm,classificarTipo,calcular,parseAfastamentos};
if(typeof module!=='undefined'&&module.exports) module.exports=API;
else root.LP=API;
})(typeof window!=='undefined'?window:globalThis);

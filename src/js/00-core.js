'use strict';
/* =====================================================================
   RH Câmara Rio Verde — núcleo: utilitários, dados iniciais, salvamento
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const oneLine=t=>String(t==null?'':t).replace(/\s+/g,' ').trim();
const clone=o=>JSON.parse(JSON.stringify(o));
let _uidn=0;
const uid=p=>p+Date.now().toString(36).slice(-5)+(++_uidn).toString(36)+Math.random().toString(36).slice(2,5);
const fmtDT=iso=>{
  if(!iso) return '—';
  const d=new Date(iso); if(isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
};
const slug=s=>(String(s||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'arquivo').slice(0,60);

const LEGAL='Esta ferramenta tem finalidade organizacional e administrativa. As competências, os procedimentos e os fluxos apresentados deverão ser compatibilizados com a legislação municipal vigente, os atos normativos da Câmara Municipal de Rio Verde/GO e as orientações da Procuradoria-Geral e da Controladoria Interna. A ferramenta não substitui a análise jurídica dos atos administrativos.';
const HUES=[212,190,165,130,95,50,30,350,320,280,250];
const TIPOS_FLUXO={ini:'Início',fim:'Fim',proc:'Processo',dec:'Decisão',doc:'Documento',unid:'Unidade administrativa',aprov:'Aprovação',arq:'Arquivamento'};
const TIPOS_ORG={orgao:'Órgão superior',unidade:'Unidade administrativa',nucleo:'Divisão interna de trabalho'};
const STATUS=['','Planejada','Em andamento','Concluída','Pendente'];
const PAGES_FLOW={geral:'Fluxograma Geral',gestao:'Gestão Funcional',folha:'Folha de Pagamento',freq:'Frequência e Benefícios',arquivo:'Arquivo e Documentação',desenv:'Desenvolvimento e Capacitação'};
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

const ICONS={
  home:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  org:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  flow:'<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M6.5 9v4a2 2 0 002 2H14"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  building:'<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M12 11h.01M15 11h.01"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>',
  calc:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v3l2 1"/>',
  cap:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
  shield:'<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  file:'<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6"/>',
  grid:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  book:'<path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  undo:'<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
  redo:'<path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3"/>',
  save:'<path d="M5 3h11l4 4v14H5zM8 3v6h7V3M8 21v-7h8v7"/>',
  download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  print:'<path d="M7 9V3h10v6M7 18H4v-7h16v7h-3M7 14h10v7H7z"/>'
};
function icon(name,size){
  size=size||18;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.file}</svg>`;
}
const UNIT_ICONS={building:'Prédio',users:'Pessoas',calc:'Cálculo',archive:'Arquivo',calendar:'Calendário',cap:'Capacitação',shield:'Controle',file:'Documento'};

/* ---------- dados iniciais ---------- */
const nd=(id,tipo,t,unit,o)=>Object.assign({id,tipo,t,desc:'',unit:unit||'',resp:'',prazo:'',docs:'',obs:'',status:'',hue:null,x:null,y:null},o||{});
const ed=(from,to,l)=>({id:'e_'+from+'_'+to+(l?'_'+slug(l):''),from,to,l:l||''});

function buildDefault(){
  const units=[
    {id:'u-dir',nome:'Diretoria de Gestão de Pessoas',sigla:'DGP',icone:'building',hue:212,page:'',externa:false,divisao:false,
     desc:'Planeja, coordena, supervisiona e avalia as atividades de administração de pessoal.',obs:'',comp:[
      'Planejar, coordenar, supervisionar e avaliar as atividades de administração de pessoal;',
      'Promover a aplicação da legislação relativa aos servidores;',
      'Supervisionar os procedimentos de admissão, nomeação, posse, exercício, exoneração e movimentação;',
      'Supervisionar a elaboração e conferência da folha;',
      'Acompanhar direitos, vantagens, férias e licenças;',
      'Coordenar os registros funcionais;',
      'Promover relatórios gerenciais e indicadores;',
      'Acompanhar obrigações legais e sistemas oficiais;',
      'Propor melhorias administrativas;',
      'Promover capacitação e desenvolvimento;',
      'Acompanhar recomendações dos órgãos de controle;',
      'Promover a proteção de dados pessoais.']},
    {id:'u-chefia',nome:'Chefia de Pessoal',sigla:'CP',icone:'users',hue:165,page:'gestao',externa:false,divisao:false,
     desc:'Instrui os processos da vida funcional e mantém os registros de cargos e lotações.',obs:'',comp:[
      'Instruir processos relativos à vida funcional;',
      'Acompanhar nomeações, exonerações e movimentações;',
      'Elaborar minutas de atos administrativos;',
      'Controlar períodos aquisitivos e concessivos de férias;',
      'Acompanhar licenças e afastamentos;',
      'Manter registros de cargos e lotações;',
      'Conferir documentação funcional;',
      'Orientar servidores;',
      'Encaminhar informações à folha de pagamento;',
      'Comunicar inconsistências.']},
    {id:'u-folha',nome:'Coordenadoria de Folha de Pagamento',sigla:'CFP',icone:'calc',hue:30,page:'folha',externa:false,divisao:false,
     desc:'Elabora, processa e confere a folha de pagamento e seus demonstrativos.',obs:'',comp:[
      'Elaborar e processar a folha;',
      'Calcular vencimentos, subsídios, gratificações e adicionais;',
      'Calcular férias, décimo terceiro e verbas rescisórias;',
      'Efetuar descontos legais;',
      'Conferir informações funcionais e financeiras;',
      'Preparar informações previdenciárias e tributárias;',
      'Elaborar demonstrativos;',
      'Controlar ajustes e retificações;',
      'Encaminhar a folha para conferência e autorização;',
      'Elaborar relatórios de despesas com pessoal.']},
    {id:'u-arq',nome:'Gerência de Arquivo e Documentação',sigla:'GAD',icone:'archive',hue:280,page:'arquivo',externa:false,divisao:false,
     desc:'Organiza, guarda e conserva os documentos funcionais, físicos e digitais.',obs:'',comp:[
      'Organizar arquivos físicos e digitais;',
      'Digitalizar e classificar documentos;',
      'Garantir integridade e disponibilidade;',
      'Controlar acesso aos assentamentos;',
      'Organizar documentos funcionais;',
      'Manter índices documentais;',
      'Promover guarda e conservação;',
      'Apoiar emissão de certidões;',
      'Observar gestão documental e proteção de dados.']},
    {id:'u-freq',nome:'Núcleo Operacional de Frequência e Benefícios',sigla:'NFB',icone:'calendar',hue:50,page:'freq',externa:false,divisao:true,
     desc:'Divisão interna de trabalho que acompanha a frequência e instrui processos de benefícios.',obs:'Divisão interna de trabalho, sem criação automática de novos cargos.',comp:[
      'Acompanhar registros de frequência;',
      'Receber informações dos gabinetes;',
      'Controlar faltas e atrasos;',
      'Acompanhar férias e afastamentos;',
      'Instruir processos de benefícios;',
      'Encaminhar informações à folha;',
      'Elaborar relatórios de frequência;',
      'Identificar inconsistências;',
      'Comunicar situações que demandem providências.']},
    {id:'u-desenv',nome:'Núcleo de Desenvolvimento e Capacitação',sigla:'NDC',icone:'cap',hue:190,page:'desenv',externa:false,divisao:true,
     desc:'Divisão interna de trabalho que planeja e registra as ações de capacitação.',obs:'Divisão interna de trabalho, sem criação automática de novos cargos.',comp:[
      'Identificar necessidades de capacitação;',
      'Elaborar plano anual de capacitação;',
      'Organizar cursos e treinamentos;',
      'Manter registros das capacitações;',
      'Acompanhar avaliação de desempenho;',
      'Apoiar gestão de carreiras;',
      'Promover integração e valorização;',
      'Elaborar relatórios;',
      'Propor ações de desenvolvimento profissional.']},
    {id:'u-aut',nome:'Autoridade competente',sigla:'',icone:'building',hue:350,page:'',externa:true,divisao:false,desc:'Decide e autoriza os atos que lhe competem.',obs:'',comp:[]},
    {id:'u-cont',nome:'Contabilidade e Tesouraria',sigla:'',icone:'calc',hue:95,page:'',externa:true,divisao:false,desc:'Procedimentos contábeis e financeiros relativos ao pagamento.',obs:'',comp:[]},
    {id:'u-ctrl',nome:'Controladoria Interna',sigla:'',icone:'shield',hue:250,page:'',externa:true,divisao:false,desc:'Controle interno e auditoria, com independência funcional.',obs:'',comp:[]}
  ];
  const org={nodes:[
    {id:'o-pres',tipo:'orgao',t:'Presidência / Mesa Diretora',desc:'Autoridade superior da Câmara Municipal.',unitId:'',hue:212,icone:'building',obs:'',x:null,y:null},
    {id:'o-dir',tipo:'unidade',t:'',desc:'',unitId:'u-dir',hue:null,icone:'',obs:'',x:null,y:null},
    {id:'o-chefia',tipo:'unidade',t:'',desc:'',unitId:'u-chefia',hue:null,icone:'',obs:'',x:null,y:null},
    {id:'o-folha',tipo:'unidade',t:'',desc:'',unitId:'u-folha',hue:null,icone:'',obs:'',x:null,y:null},
    {id:'o-arq',tipo:'unidade',t:'',desc:'',unitId:'u-arq',hue:null,icone:'',obs:'',x:null,y:null},
    {id:'o-freq',tipo:'nucleo',t:'',desc:'',unitId:'u-freq',hue:null,icone:'',obs:'',x:null,y:null},
    {id:'o-desenv',tipo:'nucleo',t:'',desc:'',unitId:'u-desenv',hue:null,icone:'',obs:'',x:null,y:null}
  ],edges:[
    {id:'oe1',from:'o-pres',to:'o-dir',l:''},{id:'oe2',from:'o-dir',to:'o-chefia',l:''},{id:'oe3',from:'o-dir',to:'o-folha',l:''},
    {id:'oe4',from:'o-dir',to:'o-arq',l:''},{id:'oe5',from:'o-dir',to:'o-freq',l:''},{id:'oe6',from:'o-dir',to:'o-desenv',l:''}
  ]};

  const geral={id:'fl-geral',page:'geral',nome:'Fluxograma geral do RH',desc:'Do recebimento da demanda ao arquivamento, passando pelas cinco frentes de trabalho do Departamento.',nodes:[
    nd('a1','ini','INÍCIO — Recebimento da demanda'),
    nd('a2','proc','Protocolo / Registro da solicitação'),
    nd('a3','unid','Diretoria de Gestão de Pessoas','u-dir'),
    nd('a4','proc','Identificação do tipo de demanda'),
    nd('a5','unid','A. Gestão Funcional — Chefia de Pessoal','u-chefia'),
    nd('a6','unid','B. Folha de Pagamento','u-folha'),
    nd('a7','unid','C. Frequência e Benefícios','u-freq'),
    nd('a8','unid','D. Arquivo e Documentação','u-arq'),
    nd('a9','unid','E. Desenvolvimento e Capacitação','u-desenv'),
    nd('a10','proc','Análise e instrução do processo'),
    nd('a11','dec','Documentação e requisitos estão corretos?'),
    nd('a12','proc','Solicitar complementação ou correção'),
    nd('a13','dec','Exige decisão da autoridade competente?'),
    nd('a14','aprov','Encaminhar para decisão e autorização','u-aut'),
    nd('a15','proc','Executar pela unidade responsável'),
    nd('a16','dec','Aprovado?'),
    nd('a17','proc','Comunicar indeferimento ou arquivar'),
    nd('a18','proc','Atualizar os registros funcionais e administrativos'),
    nd('a19','proc','Conferência e controle'),
    nd('a20','arq','Arquivamento físico ou digital'),
    nd('a21','fim','ENCERRAMENTO')
  ],edges:[
    ed('a1','a2'),ed('a2','a3'),ed('a3','a4'),
    ed('a4','a5'),ed('a4','a6'),ed('a4','a7'),ed('a4','a8'),ed('a4','a9'),
    ed('a5','a10'),ed('a6','a10'),ed('a7','a10'),ed('a8','a10'),ed('a9','a10'),
    ed('a10','a11'),
    ed('a11','a12','Não'),ed('a12','a2','Retorna ao protocolo'),
    ed('a11','a13','Sim'),
    ed('a13','a14','Exige'),ed('a13','a15','Não exige'),
    ed('a14','a16'),ed('a15','a16'),
    ed('a16','a17','Não'),ed('a16','a18','Sim'),
    ed('a17','a20'),ed('a18','a19'),ed('a19','a20'),ed('a20','a21')
  ]};
  const nomeacao={id:'fl-nomeacao',page:'gestao',nome:'Nomeação e exoneração',desc:'Instrução, análise e publicação dos atos de nomeação e exoneração. Use "Ramificações" para detalhar posse, exercício e movimentação.',nodes:[
    nd('b1','ini','INÍCIO'),
    nd('b2','proc','Solicitação de nomeação ou exoneração'),
    nd('b3','proc','Protocolo e instrução do processo'),
    nd('b4','unid','Chefia de Pessoal','u-chefia'),
    nd('b5','proc','Conferência documental e requisitos legais'),
    nd('b6','aprov','Análise da autoridade competente','u-aut'),
    nd('b7','doc','Expedição e publicação do ato'),
    nd('b8','proc','Atualização cadastral'),
    nd('b9','proc','Comunicação à Folha de Pagamento'),
    nd('b10','arq','Registro e arquivamento'),
    nd('b11','fim','ENCERRAMENTO')
  ],edges:[ed('b1','b2'),ed('b2','b3'),ed('b3','b4'),ed('b4','b5'),ed('b5','b6'),ed('b6','b7'),ed('b7','b8'),ed('b8','b9'),ed('b9','b10'),ed('b10','b11')]};
  const folha={id:'fl-folha',page:'folha',nome:'Processamento da folha de pagamento',desc:'Ciclo mensal da folha, da coleta das informações funcionais ao arquivamento.',nodes:[
    nd('c1','ini','INÍCIO DO CICLO DA FOLHA'),
    nd('c2','proc','Recebimento das informações funcionais'),
    nd('c3','proc','Conferência das alterações','u-chefia'),
    nd('c4','proc','Envio das ocorrências','u-freq'),
    nd('c5','unid','Coordenadoria de Folha de Pagamento','u-folha'),
    nd('c6','proc','Lançamento das informações','u-folha'),
    nd('c7','proc','Processamento da folha','u-folha'),
    nd('c8','proc','Conferência dos cálculos','u-folha'),
    nd('c9','dec','Existem inconsistências?','u-folha'),
    nd('c10','proc','Corrigir lançamentos','u-folha'),
    nd('c11','proc','Encaminhar à Diretoria de Gestão de Pessoas','u-dir'),
    nd('c12','proc','Validação da folha','u-dir'),
    nd('c13','proc','Encaminhamento à autoridade competente','u-dir'),
    nd('c14','dec','Folha autorizada?','u-aut'),
    nd('c15','proc','Retornar para ajustes','u-folha'),
    nd('c16','unid','Encaminhar à Contabilidade e Tesouraria','u-cont'),
    nd('c17','proc','Pagamento aos servidores','u-cont'),
    nd('c18','proc','Envio das obrigações legais'),
    nd('c19','arq','Conciliação e arquivamento'),
    nd('c20','fim','ENCERRAMENTO')
  ],edges:[
    ed('c1','c2'),ed('c2','c3'),ed('c3','c4'),ed('c4','c5'),ed('c5','c6'),ed('c6','c7'),ed('c7','c8'),ed('c8','c9'),
    ed('c9','c10','Sim'),ed('c10','c7','Retorna ao processamento'),ed('c9','c11','Não'),
    ed('c11','c12'),ed('c12','c13'),ed('c13','c14'),
    ed('c14','c15','Não'),ed('c15','c6','Ajustes'),ed('c14','c16','Sim'),
    ed('c16','c17'),ed('c17','c18'),ed('c18','c19'),ed('c19','c20')
  ]};
  const gestao={id:'fl-gestao',page:'gestao',nome:'Gestão funcional',desc:'Tratamento dos atos funcionais, da solicitação à publicação e ao arquivamento.',nodes:[
    nd('d1','ini','INÍCIO'),
    nd('d2','proc','Solicitação de ato funcional'),
    nd('d3','unid','Chefia de Pessoal','u-chefia'),
    nd('d4','proc','Análise documental e legal'),
    nd('d5','dec','Processo regular?'),
    nd('d6','proc','Solicitar documentos ou correções'),
    nd('d7','proc','Identificar o tipo de ato'),
    nd('d8','doc','Nomeação / Admissão'),
    nd('d9','doc','Exoneração / Desligamento'),
    nd('d10','doc','Férias / Licenças'),
    nd('d11','doc','Alteração funcional'),
    nd('d12','doc','Declaração / Certidão'),
    nd('d13','proc','Encaminhamento à autoridade competente'),
    nd('d14','dec','Ato autorizado?','u-aut'),
    nd('d15','proc','Devolução ou arquivamento'),
    nd('d16','doc','Expedição e publicação do ato'),
    nd('d17','proc','Atualização do cadastro funcional'),
    nd('d18','proc','Comunicação à Folha de Pagamento'),
    nd('d19','arq','Arquivo e documentação','u-arq'),
    nd('d20','fim','ENCERRAMENTO')
  ],edges:[
    ed('d1','d2'),ed('d2','d3'),ed('d3','d4'),ed('d4','d5'),
    ed('d5','d6','Não'),ed('d6','d1','Retorna ao início'),ed('d5','d7','Sim'),
    ed('d7','d8'),ed('d7','d9'),ed('d7','d10'),ed('d7','d11'),ed('d7','d12'),
    ed('d8','d13'),ed('d9','d13'),ed('d10','d13'),ed('d11','d13'),ed('d12','d13'),
    ed('d13','d14'),ed('d14','d15','Não'),ed('d15','d20'),ed('d14','d16','Sim'),
    ed('d16','d17'),ed('d17','d18'),ed('d18','d19'),ed('d19','d20')
  ]};
  const ferias={id:'fl-ferias',page:'gestao',nome:'Férias',desc:'Controle, autorização e pagamento de férias. Os prazos e direitos ficam nos parâmetros editáveis, conforme a legislação municipal.',nodes:[
    nd('f1','ini','INÍCIO'),
    nd('f2','proc','Controle dos períodos aquisitivos'),
    nd('f3','unid','Chefia de Pessoal','u-chefia'),
    nd('f4','proc','Verificação dos direitos'),
    nd('f5','proc','Programação e solicitação de férias'),
    nd('f6','proc','Análise da chefia competente'),
    nd('f7','aprov','Autorização'),
    nd('f8','proc','Registro funcional'),
    nd('f9','unid','Coordenadoria de Folha','u-folha'),
    nd('f10','proc','Cálculo e pagamento'),
    nd('f11','arq','Arquivo e controle do período'),
    nd('f12','fim','ENCERRAMENTO')
  ],edges:[ed('f1','f2'),ed('f2','f3'),ed('f3','f4'),ed('f4','f5'),ed('f5','f6'),ed('f6','f7'),ed('f7','f8'),ed('f8','f9'),ed('f9','f10'),ed('f10','f11'),ed('f11','f12')]};

  const matriz=[
    ['Nomeação e exoneração','Chefia de Pessoal','Diretoria de Gestão de Pessoas'],
    ['Cadastro funcional','Chefia de Pessoal','Diretoria de Gestão de Pessoas'],
    ['Folha de pagamento','Coordenadoria de Folha','Diretoria de Gestão de Pessoas'],
    ['Cálculos de férias','Coordenadoria de Folha','Diretoria de Gestão de Pessoas'],
    ['Controle de férias','Chefia de Pessoal','Diretoria de Gestão de Pessoas'],
    ['Frequência','Núcleo de Frequência','Diretoria de Gestão de Pessoas'],
    ['Arquivo funcional','Gerência de Arquivo','Diretoria de Gestão de Pessoas'],
    ['Capacitação','Núcleo de Desenvolvimento','Diretoria de Gestão de Pessoas'],
    ['Autorização de pagamento','Autoridade competente','Conforme legislação'],
    ['Controle interno e auditoria','Controladoria Interna','Independência funcional']
  ].map((r,i)=>({id:'m'+(i+1),ativ:r[0],resp:r[1],sup:r[2],obs:''}));

  const kdef=[
    ['Percentual de folhas processadas sem inconsistências','pct','maior',95],
    ['Quantidade de retificações de folha','qtd','menor',2],
    ['Percentual de processos funcionais concluídos no prazo','pct','maior',90],
    ['Quantidade de férias vencidas ou pendentes','qtd','menor',0],
    ['Percentual de servidores com cadastro atualizado','pct','maior',98],
    ['Quantidade de capacitações realizadas','qtd','maior',3],
    ['Percentual de documentos digitalizados','pct','maior',80],
    ['Quantidade de inconsistências de frequência','qtd','menor',5],
    ['Percentual de obrigações acessórias entregues no prazo','pct','maior',100]
  ];
  let seed=7; const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  const kpis=kdef.map((k,i)=>{
    const vals={};
    for(let m=1;m<=9;m++){
      const key='2026-'+String(m).padStart(2,'0');
      if(k[1]==='pct'){ const base=k[3]>=100?97:k[3]-6; vals[key]=Math.round((base+rnd()*9)*10)/10; if(vals[key]>100) vals[key]=100; }
      else if(k[0].indexOf('férias')>-1) vals[key]=Math.round(rnd()*4);
      else if(k[0].indexOf('capacitações')>-1) vals[key]=Math.round(1+rnd()*4);
      else vals[key]=Math.round(rnd()*7);
    }
    return {id:'k'+(i+1),nome:k[0],tipo:k[1],dir:k[2],meta:k[3],vals};
  });

  const params=['Período aquisitivo','Período concessivo','Fracionamento das férias','Abono pecuniário','Antecedência para solicitação','Adicional de férias','Base legal municipal'].map((n,i)=>({id:'p'+(i+1),nome:n,valor:'',obs:''}));

  const st={
    v:2,
    meta:{atualizado:new Date().toISOString(),copiaDia:'',demo:true},
    inst:{nome:'RH Câmara Rio Verde',sub:'Gestão de Pessoas e Processos Administrativos',orgao:'Câmara Municipal de Rio Verde/GO',setor:'Diretoria de Gestão de Pessoas',obs:''},
    units,org,flows:[geral,nomeacao,gestao,ferias,folha],matriz,kpis,params,manual:[]
  };
  st.manual=defaultManual(st);
  return st;
}

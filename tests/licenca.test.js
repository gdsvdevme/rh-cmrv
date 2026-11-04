/* Testes do motor da licença-prêmio (src/licenca-engine.js). Rodar: node --test tests/ */
const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../src/licenca-engine.js');

const d=s=>L.D(s);
const ev=(tipo,ini,fim,efeito)=>({tipo,efeito:efeito||L.classificarTipo(tipo).efeito,ini:d(ini),fim:d(fim)});
const calc=(adm,eventos,hoje,registro,cfg)=>L.calcular({adm:d(adm),eventos:eventos||[],registro:registro||{}},d(hoje),cfg);
const per=(r,n)=>r.per.find(p=>p.n===n);
const f=L.fmt;

test('datas: 5 anos de calendário, inclusive 29/02',()=>{
  assert.equal(f(L.addAnos(d('01/03/2012'),5)),'01/03/2017');
  assert.equal(f(L.addAnos(d('29/02/2016'),5)),'28/02/2021');
  assert.equal(L.dias(d('13/10/2010'),d('09/02/2011')),120);   // mesmo cálculo da coluna "Qtd. Dias" do Centi
});

test('sem afastamentos: períodos de 5 anos corridos e 90 dias de licença',()=>{
  const r=calc('01/03/2012',[],'04/11/2026');
  assert.equal(r.per.length,3);
  assert.equal(f(per(r,1).ini),'01/03/2012');
  assert.equal(f(per(r,1).fim),'28/02/2017');
  assert.equal(f(per(r,1).direitoEm),'01/03/2017');
  assert.equal(f(per(r,1).janelaFim),'28/02/2022');   // gozo nos 5 anos seguintes
  assert.equal(f(per(r,1).requererAte),'29/05/2022'); // + 90 dias para requerer
  assert.equal(f(per(r,2).fim),'28/02/2022');
  assert.equal(per(r,3).status,'formacao');
  assert.equal(f(per(r,3).fim),'28/02/2027');
});

test('situação: período 1 sem registro e histórico não conferido vira "A conferir"',()=>{
  const r=calc('01/03/2012',[],'04/11/2026');
  assert.equal(per(r,1).status,'conferir');   // janela de gozo acabou em 2022
  assert.equal(per(r,2).status,'disponivel'); // direito desde 01/03/2022, gozo até 28/02/2027
  assert.equal(r.situacao.codigo,'conf');
  assert.equal(r.tags.naoconf,true);
});

test('histórico conferido: direito antigo (antes da LC 181/2020) fica como regra anterior; depois vira vencida e perdida',()=>{
  const reg={conferido:true};
  const r=calc('01/03/2012',[],'04/11/2026',reg);
  assert.equal(per(r,1).status,'anterior');    // direito em 01/03/2017, antes da LC 181/2020: não se dá como perdido sozinho
  assert.equal(per(r,2).status,'disponivel');  // direito em 01/03/2022, gozo até 28/02/2027
  const venc=calc('01/03/2012',[],'01/04/2027',reg);
  assert.equal(per(venc,2).status,'vencida');  // janela acabou em 28/02/2027; ainda dá para requerer até 29/05/2027
  assert.equal(venc.situacao.codigo,'venc');
  const perdida=calc('01/03/2012',[],'01/07/2027',reg);
  assert.equal(per(perdida,2).status,'perdida');
  assert.equal(perdida.situacao.rotulo,'Direito perdido');   // só há perdida (o período 1 é "anterior"): o rótulo diz que o direito se perdeu
});

test('direito adquirido antes da LC 181/2020 não é dado como perdido sozinho',()=>{
  const r=calc('01/03/2005',[],'04/11/2026',{conferido:true});
  assert.equal(per(r,1).status,'anterior');   // direito em 01/03/2010
  assert.equal(per(r,2).status,'anterior');   // direito em 01/03/2015
  assert.equal(per(r,3).status,'anterior');   // direito em 01/03/2020, ainda antes de 06/05/2020
  assert.equal(per(r,4).status,'disponivel'); // direito em 01/03/2025
});

test('licença médica própria suspende: empurra o fim do período',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA MÉDICA - RPPS','01/06/2013','09/09/2013')],'04/11/2026');   // 101 dias
  assert.equal(per(r,1).susp,101);
  assert.equal(f(per(r,1).fim),'09/06/2017');   // 28/02/2017 + 101 dias
  assert.equal(per(r,2).ini,per(r,1).fim+864e5);
});

test('afastamentos sobrepostos suspendem uma vez só',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA MÉDICA - INSS','01/06/2013','30/06/2013'),ev('LICENÇA MÉDICA - RPPS','15/06/2013','14/07/2013')],'04/11/2026');
  assert.equal(per(r,1).susp,44);   // 01/06 a 14/07
});

test('afastamento sem data de fim (09/09/9999): suspende até hoje e avisa que está em andamento',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA MÉDICA - INSS','01/01/2026','09/09/9999')],'04/11/2026');
  const p=per(r,3);
  assert.equal(p.susp,308);   // 01/01/2026 a 04/11/2026
  assert.ok(r.alertas.some(a=>/em andamento \(sem data de fim/.test(a.msg)));
  const d2=calc('01/03/2012',[ev('LICENÇA MÉDICA - INSS','01/01/2026','09/09/9999')],'05/11/2026');
  assert.equal(per(d2,3).susp,309);   // no dia seguinte já pesa mais um dia
});

test('afastamento sem data de fim que interrompe recomeça a contagem a cada dia',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PARA INTERESSE PARTICULAR','01/01/2026','09/09/9999')],'04/11/2026');
  assert.equal(f(r.proximo.ini),'05/11/2026');
});

test('maternidade e disposição sem ônus contam como exercício',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA MATERNIDADE INSS','01/01/2014','30/04/2014'),ev('DISPOSIÇÃO SEM ÔNUS','01/06/2015','31/12/2015')],'04/11/2026');
  assert.equal(per(r,1).susp,0);
  assert.equal(f(per(r,1).fim),'28/02/2017');
});

test('interesse particular interrompe: o período recomeça do zero',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PARA INTERESSE PARTICULAR','01/01/2014','31/03/2014')],'04/11/2026');
  assert.equal(r.interrompidos.length,1);
  assert.equal(f(per(r,1).ini),'01/04/2014');
  assert.equal(f(per(r,1).fim),'31/03/2019');
});

test('doença em pessoa da família: até 30 dias suspende, acima interrompe',()=>{
  const ate30=calc('01/03/2012',[ev('LICENÇA DOENÇA EM PESSOA DA FAMÍLIA','01/05/2013','20/05/2013'),ev('LICENÇA DOENÇA EM PESSOA DA FAMÍLIA','01/08/2013','10/08/2013')],'04/11/2026');
  assert.equal(per(ate30,1).susp,30);
  assert.equal(ate30.interrompidos.length,0);
  const passa=calc('01/03/2012',[ev('LICENÇA DOENÇA EM PESSOA DA FAMÍLIA','01/05/2013','20/05/2013'),ev('LICENÇA DOENÇA EM PESSOA DA FAMÍLIA','01/08/2013','11/08/2013')],'04/11/2026');
  assert.equal(passa.interrompidos.length,1);   // 20 + 11 = 31 dias
  assert.equal(f(per(passa,1).ini),'12/08/2013');
});

test('faltas injustificadas (lançadas à mão): até 10 dias suspende, acima interrompe',()=>{
  const reg=n=>({eventos:[{id:'a',tipo:'falta',ini:'2014-05-05',fim:'2014-05-0'+n}]});
  const dez=calc('01/03/2012',[],'04/11/2026',{eventos:[{id:'a',tipo:'falta',ini:'2014-05-01',fim:'2014-05-10'}]});
  assert.equal(per(dez,1).susp,10);
  assert.equal(dez.interrompidos.length,0);
  const onze=calc('01/03/2012',[],'04/11/2026',{eventos:[{id:'a',tipo:'falta',ini:'2014-05-01',fim:'2014-05-11'}]});
  assert.equal(onze.interrompidos.length,1);
  assert.equal(f(per(onze,1).ini),'12/05/2014');
  assert.ok(reg);
});

test('licença-prêmio do Centi abate o período mais antigo; 91 dias contam como 90',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/04/2017','30/06/2017')],'04/11/2026',{conferido:true});   // 91 dias
  assert.equal(per(r,1).status,'gozada');
  assert.equal(per(r,1).cred,90);
  assert.equal(per(r,2).status,'disponivel');
  assert.equal(r.alertas.filter(a=>/anterior ao fim/.test(a.msg)).length,0);
});

test('parcelas somam até 90 dias e o resto fica como saldo',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/04/2017','15/05/2017')],'04/11/2026',{conferido:true,periodos:{}});   // 45 dias
  assert.equal(per(r,1).status,'anterior');
  assert.equal(per(r,1).saldo,45);
  const r2=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/04/2017','15/05/2017'),ev('LICENÇA PRÊMIO','01/07/2017','14/08/2017')],'04/11/2026',{conferido:true});
  assert.equal(per(r2,1).status,'gozada');
});

test('gozo anterior ao fim do período gera alerta',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/04/2016','30/06/2016')],'04/11/2026',{conferido:true});
  assert.ok(r.alertas.some(a=>/anterior ao fim/.test(a.msg)));
});

test('registro do RH: gozo histórico, indenização e período conferido',()=>{
  const reg={conferido:true,gozos:[{id:'g1',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}],periodos:{2:{acao:'indenizada'}}};
  const r=calc('01/03/2012',[],'04/11/2026',reg);
  assert.equal(per(r,1).status,'gozada');
  assert.equal(per(r,2).status,'indenizada');
  assert.equal(r.situacao.codigo,'dia');
  assert.equal(r.saldo,0);
  const q=calc('01/03/2012',[],'04/11/2026',{conferido:true,periodos:{1:{acao:'quitada'}}});
  assert.equal(per(q,1).status,'gozada');
});

test('gozo do registro igual ao do Centi não conta em dobro',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/06/2017','29/08/2017')],'04/11/2026',{conferido:true,gozos:[{id:'g',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}]});
  assert.equal(per(r,1).cred,90);
  assert.equal(per(r,2).cred,0);
});

test('requerida: pede atenção e cobra a concessão em 30 dias',()=>{
  const r=calc('01/03/2012',[],'04/11/2026',{conferido:true,gozos:[{id:'g',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}],periodos:{2:{acao:'requerida',data:'2026-09-01'}}});
  assert.equal(per(r,2).status,'requerida');
  assert.equal(r.situacao.codigo,'req');
  assert.ok(r.alertas.some(a=>a.nivel==='erro'&&/30 dias/.test(a.msg)));
});

test('vencendo e acúmulo de períodos em aberto',()=>{
  const r=calc('01/03/2012',[],'04/11/2026',{conferido:true,gozos:[{id:'g',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}]},{avisoDias:180});
  assert.equal(per(r,2).status,'disponivel');
  assert.equal(per(r,2).vencendo,true);   // janela até 28/02/2027
  assert.equal(r.situacao.codigo,'vencendo');
  const ac=calc('01/03/2012',[],'01/03/2022',{conferido:true,gozos:[{id:'g',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}]});
  assert.equal(ac.tags.acum,false);
  const dois=calc('01/03/2012',[],'01/03/2022',{conferido:true});
  assert.equal(dois.tags.acum,true);   // períodos 1 e 2 em aberto
});

test('em gozo hoje',()=>{
  const r=calc('01/03/2012',[ev('LICENÇA PRÊMIO','01/10/2026','29/12/2026')],'04/11/2026',{conferido:true,gozos:[{id:'g',tipo:'gozo',ini:'2017-06-01',fim:'2017-08-29'}]});
  assert.equal(r.situacao.codigo,'gozo');
  assert.ok(r.emGozo);
});

test('início da contagem pode ser corrigido pelo RH',()=>{
  const r=calc('01/03/2012',[],'04/11/2026',{inicio:'2015-06-10'});
  assert.equal(f(per(r,1).ini),'10/06/2015');
  assert.equal(f(per(r,1).fim),'09/06/2020');
});

test('servidor com menos de 5 anos: sem direito ainda e previsão do primeiro período',()=>{
  const r=calc('10/04/2023',[],'04/11/2026');
  assert.equal(r.situacao.codigo,'form');
  assert.equal(f(r.proximo.direitoEm),'10/04/2028');
});

test('classificação dos tipos reais do Centi',()=>{
  const c=t=>L.classificarTipo(t).efeito;
  assert.equal(c('LICENÇA MÉDICA - RPPS'),'suspende');
  assert.equal(c('LICENÇA MÉDICA - INSS'),'suspende');
  assert.equal(c('LICENÇA MÉDICA INSS TIPICO PREVIDÊNCIA'),'suspende');
  assert.equal(c('LICENÇA MATERNIDADE INSS'),'neutro');
  assert.equal(c('LICENÇA MATERNIDADE RPPS'),'neutro');
  assert.equal(c('DISPOSIÇÃO SEM ÔNUS'),'neutro');
  assert.equal(c('LICENÇA PRÊMIO'),'licenca-premio');
  assert.equal(c('LICENÇA DOENÇA EM PESSOA DA FAMÍLIA'),'familia');
  assert.equal(c('LICENÇA PARA INTERESSE PARTICULAR'),'interrompe');
  assert.equal(c('LICENÇA PARA EXERCÍCIO CARGO COMISSIONADO'),'neutro');
  assert.equal(c('SUSPENÇÃO - PAD'),'interrompe');
  assert.equal(c('SUSPENSÃO POR DECISÃO JUDICIAL'),'revisar');
  assert.equal(c('LICENÇA GALA'),'neutro');
  assert.equal(c('AFASTAMENTO JUDICIAL'),'revisar');
  assert.equal(c('AUSÊNCIA DE SESSÃO EXTRAORDIÁRIA'),'neutro');
  assert.equal(c('ALGO NOVO QUE NINGUÉM CONHECE'),'revisar');
  assert.equal(L.classificarTipo('ALGO NOVO',{'algo novo':'suspende'}).efeito,'suspende');   // escolha do RH vale mais que o padrão
});

test('leitor do PDF: colunas por posição, cargo e tipo quebrados em duas linhas',()=>{
  const cab=y=>[['Matrícula',35.1],['Funcionário',84.7],['Cargo',278.9],['Tipo afastamento',470.3],['Inicio',671.3],['Fim',730.9],['Qtd. Dias',771.4]].map(([s,x])=>({s,x,y}));
  const pag=[
    {s:'1/1 Câmara Municipal',x:300,y:559},{s:'01/01/1990 a 30/11/2026',x:359.6,y:502},
    {s:'2.04.16 - ORGAO, PESSOAL, Pessoal Efetivos',x:36.7,y:486},
    ...cab(473),
    {s:'99000001',x:50.1,y:460},{s:'MARIA DA SILVA',x:86.2,y:460},{s:'AGENTE ADMINISTRATIVO',x:280.4,y:460},{s:'LICENÇA MATERNIDADE INSS',x:471.8,y:460},{s:'13/10/2010',x:662.9,y:460},{s:'09/02/2011',x:719.6,y:460},{s:'120',x:780.9,y:460},
    {s:'99000002',x:50.1,y:448},{s:'JOAO PEDRO DE SOUZA',x:86.2,y:448},{s:'ASSISTENTE E',x:280.4,y:448},
    {s:'LICENÇA',x:471.8,y:437},{s:'1-1',x:280.4,y:426},{s:'MÉDICA - RPPS',x:471.8,y:426},{s:'19/08/2021',x:662.9,y:426},{s:'18/09/2021',x:719.6,y:426},{s:'31',x:782.8,y:426},
    {s:'Qtde.',x:728.2,y:410},{s:'2',x:784.8,y:410},
    {s:'2.03.17 - ORGAO, VEREADORES, Vereadores',x:36.7,y:390},
    ...cab(378),
    {s:'99000003',x:50.1,y:365},{s:'VEREADOR TESTE',x:86.2,y:365},{s:'VEREADOR 1-1',x:280.4,y:365},{s:'DISPOSIÇÃO SEM ÔNUS',x:471.8,y:365},{s:'01/06/2011',x:662.9,y:365},{s:'10/06/2011',x:719.6,y:365},{s:'10',x:782.8,y:365},
    {s:'Qtde.',x:728.2,y:350},{s:'1',x:784.8,y:350}
  ];
  const {rows,ruins}=L.parseAfastamentos([pag]);
  assert.equal(ruins.length,0);
  assert.equal(rows.length,3);
  assert.deepEqual(rows[0],{mat:'99000001',nome:'MARIA DA SILVA',cargo:'AGENTE ADMINISTRATIVO',tipo:'LICENÇA MATERNIDADE INSS',ini:d('13/10/2010'),fim:d('09/02/2011'),dias:120});
  assert.equal(rows[1].tipo,'LICENÇA MÉDICA - RPPS');
  assert.equal(rows[1].cargo,'ASSISTENTE E 1-1');
  assert.equal(rows[1].dias,31);
  assert.equal(rows[2].mat,'99000003');
  assert.equal(rows[2].tipo,'DISPOSIÇÃO SEM ÔNUS');
});

test('leitor do PDF: registro sem datas é descartado e avisado',()=>{
  const pag=[{s:'Matrícula',x:35.1,y:473},{s:'Funcionário',x:84.7,y:473},{s:'Cargo',x:278.9,y:473},{s:'Tipo afastamento',x:470.3,y:473},{s:'Qtd. Dias',x:771.4,y:473},
    {s:'99000001',x:50.1,y:460},{s:'MARIA',x:86.2,y:460},{s:'LICENÇA X',x:471.8,y:460}];
  const {rows,ruins}=L.parseAfastamentos([pag]);
  assert.equal(rows.length,0);
  assert.deepEqual(ruins,['99000001']);
});

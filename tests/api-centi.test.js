/* Testes da função /api/centi com o Centi simulado (sem rede, sem senha). Rodar: node --test tests/*.test.js */
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const Module=require('node:module');

/* lz-string só serve para codificar a senha no login, que aqui não é usado: um substituto basta */
const carregar=Module._load;
Module._load=function(req,...r){return req==='lz-string'?{compressToBase64:s=>s}:carregar.call(this,req,...r);};
process.env.CENTI_ALLOWED_USERS='rh.teste';
process.env.CENTI_RETRY_MS='1';   // esperas entre tentativas mínimas nos testes
const handler=require('../api/centi.js');
const C=require('../api/_centi.js');
const {semFolha,referencias,sessaoInvalida}=require('../api/_ref.js');

const SEM_FOLHA=m=>({Message:['A folha deste servidor não foi processada em '+m]});
const PDF=zlib.gzipSync(Buffer.from('%PDF-1.4 teste')).toString('base64');
const param=(body,k)=>(body.Params.find(p=>p.Key===k)||{}).Value;

/* menu de telas do Centi de "hoje": os números NÃO são os que estavam fixos no código */
const MENU_HOJE={Value:[{Command:'FP',ModuleKey:1,SubItems:[{Command:'FP071',ModuleKey:5071},{Command:'FP245',ModuleKey:5245},{Command:'FP051',ModuleKey:5051},{Command:'FP273',ModuleKey:5273},{Command:'FP170',ModuleKey:5170}]}]};
let menuResp,leiturasDoMenu;
const resp=(d,status=200)=>({status,headers:{get:()=>null},json:async()=>d});
/* instala o Centi simulado; a leitura do menu (GET restauth/modules) é tratada à parte e contada */
function instalar(trata){
  C.limparMenu();leiturasDoMenu=0;menuResp=()=>({status:200,data:MENU_HOJE});
  global.fetch=async(url,init)=>{
    if(/\/restauth\/modules$/.test(url)){leiturasDoMenu++;const m=menuResp();return resp(m.data,m.status);}
    return trata(url,init);
  };
}

/* Centi simulado: processa só os meses em `ok` (formato "MM/AAAA"); guarda o que recebeu */
function centiFalso(ok,outroErro){
  const vistos=[];
  instalar(async(url,init)=>{
    const body=JSON.parse(init.body),mes=String(init.headers.month).padStart(2,'0')+'/'+init.headers.year;
    vistos.push({url,mes,body});
    if(outroErro) return resp({Message:[outroErro]});
    return resp(ok.includes(mes)?{File:{DataCompress:PDF},Message:[]}:SEM_FOLHA(mes));
  });
  return vistos;
}
function chamar(body){
  return new Promise(resolve=>{
    const res={statusCode:0,h:{},setHeader(k,v){this.h[k.toLowerCase()]=v;},end(b){resolve({status:this.statusCode,h:this.h,body:b});}};
    handler({method:'POST',headers:{'x-centi-user':'rh.teste','x-centi-token':'t','x-centi-refresh':'r'},body},res);
  });
}

test('referencias: mês pedido e os anteriores, virando o ano',()=>{
  assert.deepEqual(referencias(11,2026,3),[{mes:11,ano:2026},{mes:10,ano:2026},{mes:9,ano:2026}]);
  assert.deepEqual(referencias(1,2026,3),[{mes:1,ano:2026},{mes:12,ano:2025},{mes:11,ano:2025}]);
});

test('semFolha reconhece só o erro de folha não processada',()=>{
  assert.equal(semFolha({data:SEM_FOLHA('11/2026')}),true);
  assert.equal(semFolha({data:{Message:['Erro inesperado no servidor.']}}),false);
  assert.equal(semFolha({data:null}),false);
});

test('afastamentos: se 11/2026 não está disponível, usa 10/2026 e mantém o período até o fim de novembro',async()=>{
  const vistos=centiFalso(['10/2026']);
  const r=await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026,funcionario:'2145'}});
  assert.equal(r.status,200);
  assert.equal(zlib.gunzipSync(r.body).toString().slice(0,5),'%PDF-');
  assert.deepEqual(vistos.map(v=>v.mes),['11/2026','10/2026']);
  const b=vistos[1].body;
  assert.equal(param(b,'DataFin'),'01/10/2026');                  // referência da folha: o mês anterior
  assert.equal(param(b,'DataIn'),'01/01/1990:30/11/2026');        // período: segue até o fim do mês pedido
  assert.deepEqual(param(b,'Funcionarios').Params[1].Value,['2145']);
  assert.equal(r.h['x-centi-ref'],'10/2026');
});

test('afastamentos: mês atual disponível não faz segunda tentativa',async()=>{
  const vistos=centiFalso(['11/2026']);
  const r=await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026}});
  assert.equal(r.status,200);
  assert.equal(vistos.length,1);
  assert.equal(r.h['x-centi-ref'],'11/2026');
});

test('afastamentos: tenta no máximo 3 meses e explica a falha',async()=>{
  const vistos=centiFalso([]);
  const r=await chamar({path:'afastamentos-pdf',body:{mes:1,ano:2026,funcionario:'1'}});
  assert.equal(r.status,502);
  assert.deepEqual(vistos.map(v=>v.mes),['01/2026','12/2025','11/2025']);
  const msg=JSON.parse(r.body).message;
  assert.match(msg,/não foi processada em 11\/2025\. Tentei também os dois meses anteriores\.$/);
});

test('afastamentos: outro erro do Centi não é repetido em outros meses',async()=>{
  const vistos=centiFalso([],'Erro inesperado no servidor.');
  const r=await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026}});
  assert.equal(r.status,502);
  assert.equal(vistos.length,1);
});

test('quadro (panorama): mesma regra do mês de referência',async()=>{
  const vistos=[];
  instalar(async(url,init)=>{
    const body=JSON.parse(init.body),mes=String(init.headers.month).padStart(2,'0')+'/'+init.headers.year;
    vistos.push({mes,ref:param(body,'DataRef'),tela:body.ModuleKey});
    if(mes==='11/2026') return resp(SEM_FOLHA(mes));
    return resp({Cube:{Columns:[{Name:'MATRICULA'},{Name:'NOME'},{Name:'SITUACAO'}],Rows:[{Values:['1','Fulano','Ativo']},{Values:['2','Beltrano','Rescindido']}]},Message:[]});
  });
  const r=await chamar({path:'licenca-quadro',body:{mes:11,ano:2026}});
  assert.equal(r.status,200);
  assert.deepEqual(vistos,[{mes:'11/2026',ref:'01/11/2026',tela:5245},{mes:'10/2026',ref:'01/10/2026',tela:5245}]);
  assert.equal(JSON.parse(r.body).Pessoas.length,1);   // só ativos
});

test('payload do relatório: referência padrão é o próprio mês pedido',()=>{
  const b=C.afastamentosPayload(2,2028);
  assert.equal(param(b,'DataFin'),'01/02/2028');
  assert.equal(param(b,'DataIn'),'01/01/1990:29/02/2028');
});

test('rotas continuam validando entrada',async()=>{
  centiFalso(['11/2026']);
  assert.equal((await chamar({path:'afastamentos-pdf',body:{mes:13,ano:2026}})).status,400);
  assert.equal((await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026,funcionario:'1 OR 1=1'}})).status,400);
  assert.equal((await chamar({path:'licenca-busca',body:{termo:'al'}})).status,400);
});

/* resposta real do Centi a um token inválido: HTTP 500 + ErrorCode 10304 */
const CENTI_SESSAO_INVALIDA={LogKey:null,ErrorCode:'10304',Success:false,Message:['Sessão inválida.','Efetue login novamente.'],Code:null,ReloadOperation:false};
function centiSessaoInvalida(){
  const vistos=[];
  instalar(async(url)=>{vistos.push(url);return resp(CENTI_SESSAO_INVALIDA,500);});
  menuResp=()=>({status:500,data:CENTI_SESSAO_INVALIDA});   // o menu também recusa o token
  return vistos;
}

test('sessaoInvalida reconhece o erro de token do Centi e não confunde com outros',()=>{
  assert.equal(sessaoInvalida({status:500,data:CENTI_SESSAO_INVALIDA}),true);
  assert.equal(sessaoInvalida({status:401,data:null}),true);
  assert.equal(sessaoInvalida({status:200,data:{Message:['Efetue login novamente.']}}),true);
  assert.equal(sessaoInvalida({status:200,data:SEM_FOLHA('11/2026')}),false);
  assert.equal(sessaoInvalida({status:500,data:{Message:['Erro inesperado no servidor.']}}),false);
  assert.equal(sessaoInvalida({status:200,data:{Fichas:[]}}),false);
});

test('token inválido no Centi vira 401 em todas as rotas, para o navegador pedir o login de novo',async()=>{
  for(const [path,body] of [
    ['licenca-busca',{termo:'aline costa'}],
    ['licenca-quadro',{mes:11,ano:2026}],
    ['afastamentos-pdf',{mes:11,ano:2026,funcionario:'2145'}],
    ['espelho-ponto',{mes:10,ano:2026}],
    ['ficha-financeira',{matricula:'10149701',mes:10,ano:2026}],   // antes devolvia 200 com lista vazia
    ['cubo-funcionario',{mes:10,ano:2026}],
    ['ferias',{mes:10,ano:2026}]
  ]){
    centiSessaoInvalida();
    const r=await chamar({path,body});
    assert.equal(r.status,401,path+' deveria responder 401');
    assert.match(JSON.parse(r.body).message,/sessão do Centi expirou/i);
  }
});

test('token inválido não gasta tentativas: nem relatório nem outros meses',async()=>{
  const vistos=centiSessaoInvalida();
  const r=await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026,funcionario:'1'}});
  assert.equal(r.status,401);
  assert.equal(vistos.length,0);   // parou já na leitura do menu
});

test('sem cabeçalhos de sessão a função já responde 401',async()=>{
  const res=await new Promise(resolve=>{const r={statusCode:0,setHeader(){},end(b){resolve({status:this.statusCode,body:b});}};handler({method:'POST',headers:{},body:{path:'licenca-busca',body:{termo:'aline'}}},r);});
  assert.equal(res.status,401);
});

test('o número da tela vem do menu do Centi, não de um número fixo (o Centi renumera as telas ao atualizar)',async()=>{
  const vistos=centiFalso(['11/2026']);
  await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026}});
  assert.equal(vistos[0].body.ModuleKey,5071);   // FP071 no menu de hoje; o número fixo no código era 121058
  assert.notEqual(vistos[0].body.ModuleKey,121058);
});

test('o menu é lido uma vez e reaproveitado nas chamadas seguintes',async()=>{
  centiFalso(['11/2026']);
  await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026}});
  await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026,funcionario:'7'}});
  assert.equal(leiturasDoMenu,1);
});

test('se o menu não puder ser lido, usa o número padrão e segue',async()=>{
  const vistos=centiFalso(['11/2026']);
  menuResp=()=>({status:500,data:{Message:['Erro inesperado no servidor.']}});
  const r=await chamar({path:'afastamentos-pdf',body:{mes:11,ano:2026}});
  assert.equal(r.status,200);
  assert.equal(vistos[0].body.ModuleKey,121058);
});

test('cubo de funcionários e férias também usam o número do menu',async()=>{
  const telas=[];
  instalar(async(url,init)=>{
    const body=JSON.parse(init.body);telas.push(body.ModuleKey);
    return resp({Cube:{Columns:[{Name:'MATRICULA'},{Name:'SITUACAO'}],Rows:[{Values:['1','Ativo']}]},Message:[]});
  });
  const r=await chamar({path:'ferias',body:{mes:11,ano:2026}});
  assert.equal(r.status,200);
  assert.deepEqual(telas,[5051,5273]);   // FP051 e FP273
  telas.length=0;
  await chamar({path:'cubo-funcionario',body:{mes:11,ano:2026}});
  assert.deepEqual(telas,[5051]);
});

test('busca: pede 50 por página (Depth é o tamanho da página) e lista os ativos primeiro',async()=>{
  const pedidos=[];
  const reg=(Id,Nome,Situacao)=>({Id,Matricula:'1000'+Id,Nome,Situacao,TipoAdm:'X',Cargo:'C',Lotacao:'L',DataAdmissao:'01/01/2020',Cpf:'000',DataNascimento:'01/01/1990'});
  instalar(async(url,init)=>{pedidos.push(JSON.parse(init.body));return resp({Success:true,Data:[reg('1','ZELIA','Rescindido'),reg('2','MARIA','Ativo'),reg('3','ANA','Rescindido'),reg('4','BIA','Ativo')]});});
  const r=await chamar({path:'licenca-busca',body:{termo:'mari'}});
  assert.equal(r.status,200);
  assert.equal(pedidos[0].Depth,50);   // com Depth 1 só vinha um resultado
  const lista=JSON.parse(r.body).Data;
  assert.deepEqual(lista.map(x=>x.Nome),['BIA','MARIA','ANA','ZELIA']);   // ativos por nome, depois os demais
  assert.equal('Cpf' in lista[0],false);                                   // sem dados pessoais além do que a tela usa
  assert.equal('DataNascimento' in lista[0],false);
});

/* ---- dados do servidor para os documentos (FP001 -> DM017) ---- */
const F=(o)=>Object.entries(o).map(([Key,Value])=>({Key,Value}));
const REF=(Id,Display)=>({Fields:F({Id,Display})});
const PESSOA=(extra={})=>({Entity:{Fields:F(Object.assign({
  Nome:'MARIA DA SILVA',Cpf:'52998224725',DataNascimento:'15/03/1990',
  PessoaFuncionarioDocumentos:{Fields:F({RG:'1234567',OrgaoExpeditor:'SSP',UFExpeditor:'GO'})},
  Endereco:[{Fields:F({Principal:0,Logradouro:'Rua Velha',Numero:'1'})},
    {Fields:F({Principal:1,IdTipoLogradouro:REF(1,'Área'),Logradouro:'RUA 17, 231',Numero:'231',Quadra:'39',Lote:'02',Bairro:'PROMISSÃO',IdCidade:REF(5,'Rio Verde, GO'),Cep:'75907012'})}]
},extra))}});
test('servidorDados: CPF formatado, identidade com órgão/UF e endereço principal sem repetir tipo nem número',()=>{
  const d=C.servidorDados(PESSOA());
  assert.equal(d.Cpf,'529.982.247-25');
  assert.equal(d.Identidade,'1234567 SSP/GO');
  assert.equal(d.DataNascimento,'15/03/1990');
  assert.equal(d.Endereco,'RUA 17, 231, Quadra 39, Lote 02, PROMISSÃO, Rio Verde - GO, CEP 75.907-012');
  const e=C.servidorDados(PESSOA({Endereco:[{Fields:F({Principal:1,IdTipoLogradouro:REF(1,'Avenida'),Logradouro:'Goiás',Numero:'100',IdCidade:REF(5,'Rio Verde, GO')})}]}));
  assert.equal(e.Endereco,'Avenida Goiás, nº 100, Rio Verde - GO');
  assert.equal(C.servidorDados({Entity:{Fields:[]}}).Identidade,'');
});
test('idPessoaDoFuncionario lê a pessoa física do cadastro do funcionário',()=>{
  assert.equal(C.idPessoaDoFuncionario({Entity:{Fields:F({IdPessoaFisica:REF(14015,'X')})}}),'14015');
  assert.equal(C.idPessoaDoFuncionario({Entity:{Fields:[]}}),'');
});
test('servidor-dados: carrega FP001 e DM017 pelo número de tela do menu e devolve só os dados pedidos',async()=>{
  const gets=[];
  C.limparMenu();
  global.fetch=async(url,init)=>{
    if(/\/restauth\/modules$/.test(url)) return resp({Value:[{Command:'FP001',ModuleKey:777},{Command:'DM017',ModuleKey:888}]});
    gets.push(url.replace(/^.*\/restauth\//,''));
    if(/entity=777&key=3740/.test(url)) return resp({Entity:{Fields:F({IdPessoaFisica:REF(14015,'MARIA')})}});
    if(/entity=888&key=14015/.test(url)) return resp(PESSOA());
    return resp({Message:['inesperado']},500);
  };
  const r=await chamar({path:'servidor-dados',body:{id:'3740'}});
  assert.equal(r.status,200);
  assert.deepEqual(gets,['load?entity=777&key=3740','load?entity=888&key=14015']);
  assert.deepEqual(Object.keys(JSON.parse(r.body)).sort(),['Cpf','DataNascimento','Endereco','Identidade','Nome']);
  assert.equal((await chamar({path:'servidor-dados',body:{id:'abc'}})).status,400);
});

test('conferencia-eventos: 1 consulta por servidor, descarta a que acabou antes do mês, dá o código do evento e, com 50 lançamentos, refina em 2 consultas',async()=>{
  const vistos=[];
  const R=(id,rec,ini,fim,ev)=>({Id:id,IdEvento:ev||'PAGA IPARV ASSISTENCIA',Recorrencia:rec,DataInicial:ini,DataFinal:fim,Valor:'1,00',TipoLancamento:'Manual'});
  instalar(async(url,init)=>{
    const b=JSON.parse(init.body);vistos.push(b);
    const f=n=>(b.Filters.find(x=>x.FieldName===n)||{});
    if(b.Entity==='Evento') return resp({Success:true,Data:[{Id:'656',Nome:'PAGA IPARV ASSISTENCIA'},{Id:'1656',Nome:'PAGA IPARV ASSISTENCIA 2'}]});
    const srv=f('IdPessoaFuncionario').Value;
    if(srv==='9'){
      if(b.Filters.length===1) return resp({Success:true,Data:Array.from({length:50},(_,i)=>R('9'+i,'Determinada','01/01/2020','31/12/2020','X'))});   // histórico longo: bateu 50
      if(f('Recorrencia').Value!=null) return resp({Success:true,Data:Array.from({length:50},(_,i)=>R('i'+i,'Indeterminada','01/01/2025','','X'))});
      return resp({Success:true,Data:[R('d1','Determinada','01/10/2026','30/10/2099','X')]});
    }
    return resp({Success:true,Data:[R('1','Determinada','01/10/2026','30/10/2099'),R('2','Indeterminada','01/10/2025',''),R('3','Determinada','01/01/2026','30/09/2026')]});
  });
  const r=await chamar({path:'conferencia-eventos',body:{ids:['3649','9'],mes:11,ano:2026}});
  assert.equal(r.status,200);
  const j=JSON.parse(r.body);
  const doS=j.Linhas.filter(l=>l.Servidor==='3649').sort((a,b)=>a.Id-b.Id);
  assert.deepEqual(doS.map(l=>[l.Id,l.Recorrencia,l.Fim,l.Codigo]),[['1','Determinada','30/10/2099','656'],['2','Indeterminada','','656']]);   // o 3 acabou em 30/09: fora
  assert.equal(vistos.filter(b=>b.Entity==='PessoaFuncionarioEvento'&&b.Filters.some(f=>f.Value==='3649')).length,1);                            // 1 consulta só
  assert.deepEqual(j.Truncados,['9']);                                                                                                           // as indeterminadas bateram 50
  const fd=vistos.find(b=>b.Filters.some(f=>f.FieldName==='DataFinal')).Filters.find(f=>f.FieldName==='DataFinal');
  assert.equal(fd.Operation,3);assert.equal(fd.Value,'01/11/2026');                                                                              // maior ou igual ao início do mês
  assert.equal(vistos.find(b=>b.Filters.some(f=>f.FieldName==='Recorrencia')).Filters.find(f=>f.FieldName==='Recorrencia').Value,'0');          // 0 = indeterminada
});

test('conferencia-eventos: valida a lista de servidores e a referência',async()=>{
  instalar(async()=>resp({Success:true,Data:[]}));
  for(const body of [{ids:[],mes:11,ano:2026},{ids:['a'],mes:11,ano:2026},{ids:Array.from({length:61},(_,i)=>String(i+1)),mes:11,ano:2026},{ids:['1'],mes:13,ano:2026}])
    assert.equal((await chamar({path:'conferencia-eventos',body})).status,400);
});

test('conferencia-remuneracao: lê a ficha do mês e a do mês anterior (virada de ano) de cada matrícula, sem dados pessoais',async()=>{
  const vistos=[];
  instalar(async(url,init)=>{
    const b=JSON.parse(init.body),mes=init.headers.month,ano=init.headers.year;vistos.push({url,mes,ano,b});
    if(/searchentity$/.test(url)) return resp({Success:true,Data:b.Filters[0].Value==='222'&&mes==='12'?[]:[{Id:'F'+b.Filters[0].Value+'-'+mes,Matricula:b.Filters[0].Value,Cpf:'000.000.000-00'}]});
    return resp({Id:b.Id,Folha:'MENSAL',Mes:+mes,Ano:+ano,TotalProventos:5000,TotalDescontos:1000,LiquidoReceber:4000,Cpf:'000.000.000-00',
      Eventos:[{Id:50,Nome:'SALÁRIO',BaseCalc:5000,Referencia:30,Provento:5000,Desconto:0}]});
  });
  const r=await chamar({path:'conferencia-remuneracao',body:{matriculas:['111','222'],mes:1,ano:2027}});
  assert.equal(r.status,200);
  const j=JSON.parse(r.body);
  assert.deepEqual(j.Anterior,{mes:12,ano:2026});
  assert.equal(j.Servidores['111'].Atual[0].Liq,4000);
  assert.equal(j.Servidores['111'].Anterior[0].Mes,12);
  assert.deepEqual(j.Servidores['222'].Anterior,[]);
  assert.deepEqual(j.Servidores['111'].Atual[0].Eventos[0],{Id:50,Nome:'SALÁRIO',P:5000,D:0});
  assert.ok(!r.body.includes('000.000.000-00'));
  assert.ok(vistos.some(v=>v.mes==='12'&&v.ano==='2026'));   // o mês anterior vai nos cabeçalhos da consulta
});

test('conferencia-remuneracao: valida matrículas e referência',async()=>{
  instalar(async()=>resp({Success:true,Data:[]}));
  for(const body of [{matriculas:[],mes:11,ano:2026},{matriculas:['x'],mes:11,ano:2026},{matriculas:Array.from({length:41},(_,i)=>String(i+1)),mes:11,ano:2026},{matriculas:['1'],mes:0,ano:2026}])
    assert.equal((await chamar({path:'conferencia-remuneracao',body})).status,400);
});

test('conferencia-eventos: tenta de novo (inclusive após HTTP 429) e, se continuar falhando, devolve só aquele servidor em Falhas',async()=>{
  let de8=0,de5=0;
  instalar(async(url,init)=>{
    const b=JSON.parse(init.body);
    if(b.Entity==='Evento') return resp({Success:true,Data:[]});
    const srv=b.Filters.find(f=>f.FieldName==='IdPessoaFuncionario').Value;
    if(srv==='7') return resp(null,503);                          // sempre fora do ar
    if(srv==='8'&&++de8<2) return resp(null,503);                 // falha só na primeira vez
    if(srv==='5'&&++de5<3) return resp(null,429);                 // limite de consultas: passa depois de duas esperas
    return resp({Success:true,Data:[{Id:'1'+srv,IdEvento:'X',Recorrencia:'Indeterminada',DataInicial:'01/01/2026',DataFinal:'',Valor:'1,00',TipoLancamento:'Manual'}]});
  });
  const r=await chamar({path:'conferencia-eventos',body:{ids:['5','6','7','8'],mes:11,ano:2026}});
  assert.equal(r.status,200);
  const j=JSON.parse(r.body);
  assert.deepEqual(j.Falhas,['7']);
  assert.match(j.Detalhe,/HTTP 503/);
  assert.deepEqual(j.Linhas.map(l=>l.Servidor).sort(),['5','6','8']);     // 5 e 8 foram recuperados nas novas tentativas
});

test('postComTentativas: no HTTP 429 espera o Retry-After pedido pelo Centi',async()=>{
  const {postComTentativas}=require('../api/_centi.js');
  const antes=global.setTimeout,esperas=[];
  global.setTimeout=(fn,ms)=>{esperas.push(ms);return antes(fn,0);};
  try{
    let n=0;
    const post=async()=>({status:n++<1?429:200,headers:{get:k=>k==='retry-after'?'2':null},data:n<=1?null:{Success:true}});
    const r=await postComTentativas(post,'x',{},{});
    assert.equal(r.status,200);
    assert.deepEqual(esperas,[2000]);
  }finally{global.setTimeout=antes;}
});

test('conferencia-remuneracao: servidor que o Centi não responde vai para Falhas sem derrubar o lote',async()=>{
  instalar(async(url,init)=>{
    const b=JSON.parse(init.body);
    if(/searchentity$/.test(url)){const m=b.Filters[0].Value;return m==='2'?resp(null,500):resp({Success:true,Data:[{Id:'F'+m,Matricula:m}]});}
    return resp({Id:b.Id,Folha:'MENSAL',Mes:11,Ano:2026,TotalProventos:1,TotalDescontos:0,LiquidoReceber:1,Eventos:[]});
  });
  const j=JSON.parse((await chamar({path:'conferencia-remuneracao',body:{matriculas:['1','2'],mes:11,ano:2026}})).body);
  assert.deepEqual(j.Falhas,['2']);
  assert.deepEqual(Object.keys(j.Servidores),['1']);
});

test('cubo: dia "ultimo" pede o último dia da referência (inclui admitidos no meio do mês); o padrão é o dia 1º',async()=>{
  const datas=[];
  instalar(async(url,init)=>{const b=JSON.parse(init.body);datas.push((b.Params.find(p=>p.Key==='DataRef')||{}).Value);return resp({Cube:{Columns:[],Rows:[]}});});
  await chamar({path:'cubo-funcionario',body:{mes:11,ano:2026}});
  await chamar({path:'cubo-funcionario',body:{mes:11,ano:2026,dia:'ultimo'}});
  await chamar({path:'cubo-funcionario',body:{mes:2,ano:2028,dia:'ultimo'}});    // fevereiro bissexto
  await chamar({path:'cubo-funcionario',body:{mes:11,ano:2026,dia:'qualquer'}});  // valor estranho cai no padrão
  assert.deepEqual(datas,['01/11/2026','30/11/2026','29/02/2028','01/11/2026']);
});

/* Testes da função /api/centi com o Centi simulado (sem rede, sem senha). Rodar: node --test tests/*.test.js */
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const Module=require('node:module');

/* lz-string só serve para codificar a senha no login, que aqui não é usado: um substituto basta */
const carregar=Module._load;
Module._load=function(req,...r){return req==='lz-string'?{compressToBase64:s=>s}:carregar.call(this,req,...r);};
process.env.CENTI_ALLOWED_USERS='rh.teste';
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

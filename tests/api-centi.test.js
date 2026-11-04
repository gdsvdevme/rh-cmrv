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
const {semFolha,referencias}=require('../api/_ref.js');

const SEM_FOLHA=m=>({Message:['A folha deste servidor não foi processada em '+m]});
const PDF=zlib.gzipSync(Buffer.from('%PDF-1.4 teste')).toString('base64');
const param=(body,k)=>(body.Params.find(p=>p.Key===k)||{}).Value;

/* Centi simulado: processa só os meses em `ok` (formato "MM/AAAA"); guarda o que recebeu */
function centiFalso(ok,outroErro){
  const vistos=[];
  global.fetch=async(url,init)=>{
    const body=JSON.parse(init.body),mes=String(init.headers.month).padStart(2,'0')+'/'+init.headers.year;
    vistos.push({url,mes,body});
    const resp=d=>({status:200,headers:{get:()=>null},json:async()=>d});
    if(outroErro) return resp({Message:[outroErro]});
    return resp(ok.includes(mes)?{File:{DataCompress:PDF},Message:[]}:SEM_FOLHA(mes));
  };
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
  global.fetch=async(url,init)=>{
    const body=JSON.parse(init.body),mes=String(init.headers.month).padStart(2,'0')+'/'+init.headers.year;
    vistos.push({mes,ref:param(body,'DataRef')});
    const resp=d=>({status:200,headers:{get:()=>null},json:async()=>d});
    if(mes==='11/2026') return resp(SEM_FOLHA(mes));
    return resp({Cube:{Columns:[{Name:'MATRICULA'},{Name:'NOME'},{Name:'SITUACAO'}],Rows:[{Values:['1','Fulano','Ativo']},{Values:['2','Beltrano','Rescindido']}]},Message:[]});
  };
  const r=await chamar({path:'licenca-quadro',body:{mes:11,ano:2026}});
  assert.equal(r.status,200);
  assert.deepEqual(vistos,[{mes:'11/2026',ref:'01/11/2026'},{mes:'10/2026',ref:'01/10/2026'}]);
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

/* Coleção rhcmrv_recibos (recibos em PDF do Controle de devolução): criada no login, com o PocketBase simulado. */
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const carregar=Module._load;
Module._load=function(req,...r){return req==='lz-string'?{compressToBase64:s=>s}:carregar.call(this,req,...r);};
process.env.CENTI_ALLOWED_USERS='rh.teste';
const login=require('../api/centi-login.js');

const resp=(d,status=200)=>({status,json:async()=>d});
function simular(colecaoExiste){
  const chamadas=[];
  global.fetch=async(url,opt={})=>{
    const u=String(url).replace(/^https?:\/\/[^/]+/,''),m=opt.method||'GET';
    chamadas.push({m,u,body:opt.body?JSON.parse(opt.body):null});
    if(u.includes('/_superusers/auth-with-password')) return resp({token:'ADM'});
    if(m==='GET'&&u.startsWith('/api/collections/rhcmrv_recibos/records')) return colecaoExiste?resp({items:[]}):resp({message:'nf'},404);
    if(m==='POST'&&u==='/api/collections') return resp({id:'x'});
    return resp({},500);
  };
  return chamadas;
}

test('cria a coleção de recibos quando ela não existe (arquivo PDF protegido, até 10 MB)',async()=>{
  login._reset();process.env.PB_ADMIN_EMAIL='a@b.c';process.env.PB_ADMIN_PASSWORD='x';
  const ch=simular(false);
  await login.garantirRecibos('USR');
  const criar=ch.find(c=>c.m==='POST'&&c.u==='/api/collections');
  assert.ok(criar,'deveria criar a coleção');
  assert.equal(criar.body.name,'rhcmrv_recibos');
  const arq=criar.body.fields.find(f=>f.name==='arquivo');
  assert.equal(arq.type,'file');assert.equal(arq.protected,true);assert.equal(arq.maxSelect,1);
  assert.deepEqual(arq.mimeTypes,['application/pdf']);assert.equal(arq.maxSize,10*1024*1024);
  ['ref','expira_em','por_nome','por_matricula'].forEach(n=>assert.ok(criar.body.fields.some(f=>f.name===n),n));
  assert.match(criar.body.createRule,/rhcmrv_users/);
});

test('não cria nada se a coleção já existe, e só olha uma vez por instância',async()=>{
  login._reset();
  const ch=simular(true);
  await login.garantirRecibos('USR');await login.garantirRecibos('USR');
  assert.equal(ch.filter(c=>c.m==='POST').length,0);
  assert.equal(ch.length,1);
});

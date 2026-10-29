/* =====================================================================
   PocketBase: armazenamento no servidor (substitui o localStorage)
   Expõe PB.connect(), que devolve um objeto "dbh" com a mesma forma
   usada pelo restante do sistema: dbh.doc('a/b').get/set/delete e
   dbh.collection('versoes').orderBy('at','desc').limit(n).get()
   ===================================================================== */
const PB=(function(){
  const URL_BASE='/*PB_URL*/'.replace(/\/+$/,'');
  const CENTI_BASE='/*CENTI_URL*/'.replace(/\/+$/,'');   // vazio = mesmo endereço do site (funções em /api)
  const AUTH_KEY='rhcrv-pb-auth';
  let token='',email='',col='rhcmrv_users',loginP=null;
  let cs=null;   // sessão do Centi: {user,nome,token,refreshToken}

  /* só vale a sessão que tem o acesso do Centi junto; sessões antigas (login simples) pedem novo login */
  function readAuth(){try{const a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');if(a&&a.token&&a.centi&&a.centi.token){token=a.token;email=a.email||'';col=a.col||'rhcmrv_users';cs=a.centi;}}catch(e){}}
  function saveAuth(){try{localStorage.setItem(AUTH_KEY,JSON.stringify({token,email,col,centi:cs}));}catch(e){}}
  function clearAuth(){token='';email='';col='rhcmrv_users';cs=null;try{localStorage.removeItem(AUTH_KEY);}catch(e){}}

  async function raw(method,path,body){
    const h={};
    if(body!==undefined) h['Content-Type']='application/json';
    if(token) h.Authorization=token;
    const r=await fetch(URL_BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
    if(r.status===204) return null;
    let j=null; try{j=await r.json();}catch(e){}
    if(!r.ok){const err=new Error((j&&j.message)||('HTTP '+r.status));err.status=r.status;throw err;}
    return j;
  }
  async function api(method,path,body){
    try{return await raw(method,path,body);}
    catch(e){
      if(e.status===401||e.status===403){
        clearAuth();
        if(await login()) return raw(method,path,body);
      }
      throw e;
    }
  }

  /* ---------- login ---------- */
  function login(msg){
    if(loginP) return loginP;
    loginP=new Promise(resolve=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45)';
      wrap.innerHTML=
        '<form style="width:100%;max-width:360px;background:var(--surface,#fff);color:var(--fg,#12281d);border:1px solid var(--line,#d1ddd6);border-radius:12px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:15px/1.4 system-ui,sans-serif">'+
        '<h3 style="margin:0 0 4px;font-size:18px">Entrar com o acesso do Centi</h3>'+
        '<p style="margin:0 0 14px;color:var(--muted,#4f665a);font-size:13px">Use o mesmo usuário e senha do Centi. A senha é conferida no Centi e não fica guardada neste sistema.</p>'+
        '<label style="display:block;font-size:13px;margin-bottom:10px">Usuário do Centi<input name="e" type="text" required autocapitalize="none" spellcheck="false" autocomplete="username" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid var(--line,#d1ddd6);border-radius:8px;background:transparent;color:inherit;font:inherit"></label>'+
        '<label style="display:block;font-size:13px;margin-bottom:10px">Senha<input name="p" type="password" required autocomplete="current-password" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid var(--line,#d1ddd6);border-radius:8px;background:transparent;color:inherit;font:inherit"></label>'+
        '<div data-err style="min-height:18px;margin-bottom:8px;color:#c0392b;font-size:13px"></div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">'+
        '<button type="submit" style="padding:9px 16px;border:0;border-radius:8px;background:var(--accent,#0a6b3d);color:var(--accent-fg,#fff);font:inherit;font-weight:600;cursor:pointer">Entrar</button></div></form>';
      document.body.appendChild(wrap);
      const f=wrap.querySelector('form'),err=wrap.querySelector('[data-err]');
      if(msg) err.textContent=msg;
      const done=ok=>{wrap.remove();loginP=null;resolve(ok);};
      f.e.focus();
      f.addEventListener('submit',async ev=>{
        ev.preventDefault(); err.textContent='Entrando…';
        try{
          const r=await fetch(CENTI_BASE+'/api/centi-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:f.e.value.trim(),pass:f.p.value})});
          let j=null; try{j=await r.json();}catch(e){}
          if(!r.ok){err.textContent=(j&&j.message)||('Não foi possível entrar (HTTP '+r.status+').');return;}
          token=j.pb.token; col='rhcmrv_users'; email=j.centi.user; cs=j.centi; saveAuth(); done(true);
        }catch(e){err.textContent='Não foi possível entrar: '+e.message;}
      });
    });
    return loginP;
  }

  /* ---------- documentos ---------- */
  const ids={};   // cache de id de registro por caminho
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const spec=path=>{
    const i=path.indexOf('/'),col=path.slice(0,i),id=path.slice(i+1);
    return col==='versoes'?{c:'rhcmrv_versoes',f:'vid',k:id}:{c:'rhcmrv_docs',f:'key',k:path};
  };
  async function find(path){
    const s=spec(path);
    const q='?perPage=1&filter='+encodeURIComponent(s.f+'="'+esc(s.k)+'"');
    const r=await api('GET','/api/collections/'+s.c+'/records'+q);
    const rec=r.items&&r.items[0];
    if(rec) ids[path]=rec.id; else delete ids[path];
    return rec||null;
  }
  const payload=(s,data)=>s.c==='rhcmrv_versoes'?Object.assign({vid:s.k},data):{key:s.k,data};
  const unwrap=(s,rec)=>s.c==='rhcmrv_versoes'?{at:rec.at,label:rec.label,json:rec.json}:rec.data;

  function doc(path){
    const s=spec(path);
    return {
      async get(){const rec=await find(path);return {exists:!!rec,id:s.k,data:()=>rec?unwrap(s,rec):undefined};},
      async set(data){
        if(!ids[path]) await find(path);
        if(ids[path]) await api('PATCH','/api/collections/'+s.c+'/records/'+ids[path],payload(s,data));
        else{const r=await api('POST','/api/collections/'+s.c+'/records',payload(s,data));ids[path]=r.id;}
      },
      async delete(){
        if(!ids[path]) await find(path);
        if(ids[path]){await api('DELETE','/api/collections/'+s.c+'/records/'+ids[path]);delete ids[path];}
      }
    };
  }
  function collection(name){
    const q={sort:'',n:30};
    const api_={
      orderBy(f,dir){q.sort=(dir==='desc'?'-':'')+f;return api_;},
      limit(n){q.n=n;return api_;},
      async get(){
        const r=await api('GET','/api/collections/rhcmrv_'+name+'/records?perPage='+q.n+(q.sort?'&sort='+encodeURIComponent(q.sort):''));
        return {docs:r.items.map(rec=>({id:rec.vid,data:()=>({at:rec.at,label:rec.label,json:rec.json})}))};
      }
    };
    return api_;
  }

  /* ---------- tarefas (coleção rhcmrv_tarefas; as regras do servidor mostram só as compartilhadas e as do próprio dono) ---------- */
  const TAREFAS='/api/collections/rhcmrv_tarefas/records';
  const userId=()=>{try{const b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b+'='.repeat((4-b.length%4)%4))))).id||'';}catch(e){return '';}};
  async function todas(filtro){
    let page=1,out=[];
    for(;;){
      const r=await api('GET',TAREFAS+'?perPage=200&page='+page+'&sort=-criada_em'+(filtro?'&filter='+encodeURIComponent(filtro):''));
      out=out.concat(r.items||[]);
      if(!r.totalPages||page>=r.totalPages) return out;
      page++;
    }
  }
  const tarefas={
    list:todas,
    create:d=>api('POST',TAREFAS,Object.assign({dono:userId()},d)),
    update:(id,d)=>api('PATCH',TAREFAS+'/'+id,d),
    remove:id=>api('DELETE',TAREFAS+'/'+id)
  };

  /* ---------- API do Centi (pelo servidor do sistema, com o acesso da própria pessoa) ---------- */
  async function centiCall(path,body){
    if(!cs) throw new Error('Sem sessão do Centi. Entre novamente.');
    const r=await fetch(CENTI_BASE+'/api/centi',{method:'POST',
      headers:{'Content-Type':'application/json','x-centi-user':cs.user,'x-centi-token':cs.token,'x-centi-refresh':cs.refreshToken||''},
      body:JSON.stringify({path,body})});
    const nt=r.headers.get('x-centi-token'),nr=r.headers.get('x-centi-refresh');
    if(nt){cs.token=nt;if(nr)cs.refreshToken=nr;saveAuth();}   // o Centi renova o token sozinho
    let j=null; try{j=await r.json();}catch(e){}
    if(!r.ok){
      if(r.status===401){clearAuth();}
      const err=new Error((j&&j.message)||('Centi: HTTP '+r.status));err.status=r.status;throw err;
    }
    return j;
  }
  /* PB.centi.search('SFuncionario',[{FieldName:'Nome',Operation:6,Value:'%ana%'}]) -> {Data:[...],Count}
     (Operation 6 = contém; a tela de consulta do Centi exige ao menos um filtro com valor) */
  const centi={
    get user(){return cs?cs.user:'';},
    get nome(){return cs?(cs.nome||cs.user):'';},
    /* Cubo funcionário (FP051) do Centi na referência mes/ano -> {Data:[{MATRICULA,NOMEFUNC,CARGO,HIERARQUIA,...}],Total}; só ativos */
    /* Ficha financeira (FP024) da matrícula no mês/ano -> {Fichas:[{Folha,Mes,Ano,TotalProventos,TotalDescontos,LiquidoReceber,Eventos:[...]}]}; não é guardada */
    ficha(matricula,mes,ano){return centiCall('ficha-financeira',{matricula,mes,ano});},
    /* Férias: ativos (FP051) + gozos de férias (FP273) -> {Pessoas:[...],Gozos:[{MATRICULA,DTAQUIINI,DTAQUIFIN,SALDO,GOZOINICIAL,GOZOFINAL,...}]} */
    ferias(mes,ano){return centiCall('ferias',{mes,ano});},
    cubo(mes,ano){return centiCall('cubo-funcionario',{mes,ano});},
    search(entity,filters,start,depth){
      return centiCall('restauth/searchentity',{Depth:depth||50,Entity:entity,Start:start==null?1:start,
        Filters:(filters||[]).map(f=>Object.assign({List:false,TypeFilter:0,between:''},f))});
    }
  };

  /* ---------- conexão ---------- */
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function alive(){
    for(let i=0;i<3;i++){
      const ac=new AbortController(),t=setTimeout(()=>ac.abort(),6000);
      try{const r=await fetch(URL_BASE+'/api/health',{cache:'no-store',signal:ac.signal});clearTimeout(t);if(r.ok) return true;}catch(e){clearTimeout(t);}
      if(i<2) await sleep(1500);
    }
    return false;
  }
  const box='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.5)';
  const card='width:100%;max-width:380px;background:var(--surface,#fff);color:var(--fg,#12281d);border:1px solid var(--line,#d1ddd6);border-radius:12px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:15px/1.45 system-ui,sans-serif';
  const bt='padding:9px 14px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;';
  /* servidor fora do ar: pergunta antes de seguir, para não trabalhar sem querer só neste navegador */
  function offlineDialog(){
    return new Promise(resolve=>{
      const w=document.createElement('div');w.style.cssText=box;
      w.innerHTML='<div role="alertdialog" aria-modal="true" style="'+card+'"><h3 style="margin:0 0 6px;font-size:18px">Sem conexão com o servidor</h3>'+
        '<p style="margin:0 0 14px;color:var(--muted,#4f665a);font-size:13.5px">Não foi possível falar com o servidor dos dados. Verifique a internet e tente de novo. Se continuar só neste navegador, o que você fizer <b>não será salvo no servidor</b> e não aparecerá em outros computadores.</p>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" data-loc style="'+bt+'border:1px solid var(--line,#d1ddd6);background:transparent;color:inherit">Usar só neste navegador</button>'+
        '<button type="button" data-retry style="'+bt+'border:0;background:var(--accent,#0a6b3d);color:var(--accent-fg,#fff)">Tentar novamente</button></div></div>';
      document.body.appendChild(w);
      const done=v=>{w.remove();resolve(v);};
      w.querySelector('[data-retry]').addEventListener('click',()=>done(true));
      w.querySelector('[data-loc]').addEventListener('click',()=>done(false));
      w.querySelector('[data-retry]').focus();
    });
  }
  function markLocal(){
    if(document.getElementById('pb-local')) return;
    const b=document.createElement('div');b.id='pb-local';
    b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#8a5a00;color:#fff;padding:8px 14px;font:13.5px/1.35 system-ui,sans-serif;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center';
    b.innerHTML='<span>Modo local: os dados ficam só neste navegador e <b>não são salvos no servidor</b>.</span><button type="button" style="border:1px solid #fff;background:transparent;color:#fff;border-radius:7px;padding:3px 10px;font:inherit;font-weight:600;cursor:pointer">Reconectar</button>';
    b.querySelector('button').addEventListener('click',()=>location.reload());
    document.body.appendChild(b);
  }
  async function connect(){
    if(!URL_BASE) return null;
    readAuth();
    for(;;){
      if(!(await alive())){if(await offlineDialog()) continue;markLocal();return null;}
      try{
        let ok=false;
        if(token){
          try{const r=await raw('POST','/api/collections/'+col+'/auth-refresh');token=r.token;email=(r.record&&(r.record.email||r.record.username))||email;saveAuth();ok=true;}
          catch(e){if(e.status!==401&&e.status!==403&&e.status!==404) throw e; clearAuth();}
        }
        if(!ok&&!(await login())){markLocal();return null;}
        return {doc,collection,centi,tarefas};
      }catch(e){
        if(await offlineDialog()) continue;
        markLocal();return null;
      }
    }
  }
  return {connect,centi,logout(){clearAuth();location.reload();},get email(){return email;},get nome(){return centi.nome;},get userId(){return userId();},url:URL_BASE};
})();

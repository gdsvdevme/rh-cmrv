/* =====================================================================
   PocketBase: armazenamento no servidor (substitui o localStorage)
   Expõe PB.connect(), que devolve um objeto "dbh" com a mesma forma
   usada pelo restante do sistema: dbh.doc('a/b').get/set/delete e
   dbh.collection('versoes').orderBy('at','desc').limit(n).get()
   ===================================================================== */
const PB=(function(){
  const URL_BASE='/*PB_URL*/'.replace(/\/+$/,'');
  const AUTH_KEY='rhcrv-pb-auth';
  let token='',email='',loginP=null;

  function readAuth(){try{const a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');if(a&&a.token){token=a.token;email=a.email||'';}}catch(e){}}
  function saveAuth(){try{localStorage.setItem(AUTH_KEY,JSON.stringify({token,email}));}catch(e){}}
  function clearAuth(){token='';email='';try{localStorage.removeItem(AUTH_KEY);}catch(e){}}

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
        '<h3 style="margin:0 0 4px;font-size:18px">Entrar no sistema</h3>'+
        '<p style="margin:0 0 14px;color:var(--muted,#4f665a);font-size:13px">Informe o acesso para carregar e salvar os dados no servidor.</p>'+
        '<label style="display:block;font-size:13px;margin-bottom:10px">E-mail<input name="e" type="email" required autocomplete="username" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid var(--line,#d1ddd6);border-radius:8px;background:transparent;color:inherit;font:inherit"></label>'+
        '<label style="display:block;font-size:13px;margin-bottom:10px">Senha<input name="p" type="password" required autocomplete="current-password" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid var(--line,#d1ddd6);border-radius:8px;background:transparent;color:inherit;font:inherit"></label>'+
        '<div data-err style="min-height:18px;margin-bottom:8px;color:#c0392b;font-size:13px"></div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">'+
        '<button type="button" data-off style="padding:9px 12px;border:1px solid var(--line,#d1ddd6);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer">Usar só neste navegador</button>'+
        '<button type="submit" style="padding:9px 16px;border:0;border-radius:8px;background:var(--accent,#0a6b3d);color:var(--accent-fg,#fff);font:inherit;font-weight:600;cursor:pointer">Entrar</button></div></form>';
      document.body.appendChild(wrap);
      const f=wrap.querySelector('form'),err=wrap.querySelector('[data-err]');
      if(msg) err.textContent=msg;
      const done=ok=>{wrap.remove();loginP=null;resolve(ok);};
      f.e.focus();
      wrap.querySelector('[data-off]').addEventListener('click',()=>done(false));
      f.addEventListener('submit',async ev=>{
        ev.preventDefault(); err.textContent='Entrando…';
        try{
          const r=await raw('POST','/api/collections/users/auth-with-password',{identity:f.e.value.trim(),password:f.p.value});
          token=r.token; email=(r.record&&r.record.email)||f.e.value.trim(); saveAuth(); done(true);
        }catch(e){err.textContent=e.status===400?'E-mail ou senha incorretos.':'Não foi possível entrar: '+e.message;}
      });
    });
    return loginP;
  }

  /* ---------- documentos ---------- */
  const ids={};   // cache de id de registro por caminho
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const spec=path=>{
    const i=path.indexOf('/'),col=path.slice(0,i),id=path.slice(i+1);
    return col==='versoes'?{c:'versoes',f:'vid',k:id}:{c:'docs',f:'key',k:path};
  };
  async function find(path){
    const s=spec(path);
    const q='?perPage=1&filter='+encodeURIComponent(s.f+'="'+esc(s.k)+'"');
    const r=await api('GET','/api/collections/'+s.c+'/records'+q);
    const rec=r.items&&r.items[0];
    if(rec) ids[path]=rec.id; else delete ids[path];
    return rec||null;
  }
  const payload=(s,data)=>s.c==='versoes'?Object.assign({vid:s.k},data):{key:s.k,data};
  const unwrap=(s,rec)=>s.c==='versoes'?{at:rec.at,label:rec.label,json:rec.json}:rec.data;

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
        const r=await api('GET','/api/collections/'+name+'/records?perPage='+q.n+(q.sort?'&sort='+encodeURIComponent(q.sort):''));
        return {docs:r.items.map(rec=>({id:rec.vid,data:()=>({at:rec.at,label:rec.label,json:rec.json})}))};
      }
    };
    return api_;
  }

  /* ---------- conexão ---------- */
  async function connect(){
    if(!URL_BASE) return null;
    try{
      readAuth();
      await fetch(URL_BASE+'/api/health',{cache:'no-store'}).then(r=>{if(!r.ok) throw new Error('offline');});
      let ok=false;
      if(token){
        try{const r=await raw('POST','/api/collections/users/auth-refresh');token=r.token;email=(r.record&&r.record.email)||email;saveAuth();ok=true;}
        catch(e){if(e.status!==401&&e.status!==403&&e.status!==404) throw e; clearAuth();}
      }
      if(!ok&&!(await login())) return null;
      return {doc,collection};
    }catch(e){return null;}
  }
  return {connect,logout(){clearAuth();location.reload();},get email(){return email;},url:URL_BASE};
})();

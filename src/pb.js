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

  /* só vale a sessão que tem o acesso do Centi junto e a marca de admin; sessões antigas (login simples ou sem a marca) pedem novo login */
  function readAuth(){try{const a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');if(a&&a.token&&a.centi&&a.centi.token&&typeof a.centi.admin==='boolean'){token=a.token;email=a.email||'';col=a.col||'rhcmrv_users';cs=a.centi;}}catch(e){}}
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
        if(await login('Sua sessão expirou. Entre novamente para continuar.')) return raw(method,path,body);
      }
      throw e;
    }
  }

  /* ---------- login ---------- */
  const IC={
    user:'<path d="M20 21a8 8 0 10-16 0"/><circle cx="12" cy="8" r="4"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff:'<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17 17 0 002 12s3.6 7 10 7a10.4 10.4 0 004.4-1M9.9 9.9a3 3 0 004.2 4.2"/>',
    alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
    out:'<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    bank:'<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'
  };
  const ico=(k,n)=>'<svg width="'+(n||18)+'" height="'+(n||18)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[k]+'</svg>';
  const LOGIN_CSS=
    '.pbl{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;'+
      'background:radial-gradient(1100px 600px at 50% -10%,#118a50 0%,rgba(17,138,80,0) 60%),linear-gradient(160deg,#0b5f38 0%,#073d25 60%,#052a1a 100%);font-family:var(--f-body,"Public Sans",system-ui,sans-serif)}'+
    '.pbl::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.035) 0 2px,transparent 2px 26px);pointer-events:none}'+
    '.pbl-card{position:relative;width:100%;max-width:410px;background:#fff;color:#12281d;border-radius:22px;padding:38px 32px 26px;box-shadow:0 34px 90px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.08);animation:pblin .35s ease-out both}'+
    '@keyframes pblin{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.pbl-card{animation:none}}'+
    '.pbl-card::before{content:"";position:absolute;left:32px;top:0;width:58px;height:5px;background:#e3a93a;border-radius:0 0 5px 5px}'+
    '.pbl-logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(145deg,#0f7a47,#0a5a35);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(10,107,61,.35);margin-bottom:18px}'+
    '.pbl-org{margin:0 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#4f665a}'+
    '.pbl-card h2{margin:0 0 6px;font-family:var(--f-display,"Libre Franklin",system-ui,sans-serif);font-size:1.55rem;line-height:1.15;color:#0b2a1b}'+
    '.pbl-sub{margin:0 0 22px;color:#4f665a;font-size:14px;line-height:1.45}'+
    '.pbl-f{display:block;margin-bottom:14px}.pbl-f>span{display:block;font-size:12.5px;font-weight:700;color:#2c4a3b;margin-bottom:6px}'+
    '.pbl-in{position:relative;display:flex;align-items:center}.pbl-in>svg{position:absolute;left:14px;color:#6c8578;pointer-events:none}'+
    '.pbl-in input{width:100%;box-sizing:border-box;height:48px;padding:0 44px 0 42px;border:1.5px solid #cbd9d0;border-radius:12px;background:#f8fbf9;color:#12281d;font:inherit;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}'+
    '.pbl-in input::placeholder{color:#9bb0a4}.pbl-in input:hover{border-color:#a9c0b2}'+
    '.pbl-in input:focus{border-color:#0a6b3d;background:#fff;box-shadow:0 0 0 4px rgba(10,107,61,.16)}'+
    '.pbl-eye{position:absolute;right:6px;width:36px;height:36px;border:0;border-radius:9px;background:transparent;color:#6c8578;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
    '.pbl-eye:hover{background:#e8f1ec;color:#0a6b3d}.pbl-eye:focus-visible{outline:2px solid #0a6b3d}'+
    '.pbl-err{display:flex;gap:8px;align-items:flex-start;margin:2px 0 14px;padding:10px 12px;border-radius:10px;background:#fdecea;border:1px solid #f3c1bb;color:#9b2c1f;font-size:13.5px;line-height:1.35}'+
    '.pbl-err:empty{display:none}.pbl-err svg{flex:none;margin-top:1px}.pbl-err.info{background:#eef6f1;border-color:#cfe3d7;color:#2c4a3b}'+
    '.pbl-go{width:100%;height:50px;border:0;border-radius:13px;background:linear-gradient(180deg,#0f7a47,#0a6b3d);color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 10px 22px rgba(10,107,61,.32);transition:transform .1s,box-shadow .15s,filter .15s}'+
    '.pbl-go:hover{filter:brightness(1.06)}.pbl-go:active{transform:translateY(1px);box-shadow:0 6px 14px rgba(10,107,61,.3)}.pbl-go:focus-visible{outline:3px solid #e3a93a;outline-offset:2px}'+
    '.pbl-go[disabled]{opacity:.8;cursor:progress}.pbl-sp{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:pblsp .7s linear infinite}@keyframes pblsp{to{transform:rotate(360deg)}}'+
    '.pbl-foot{margin:18px 0 0;display:flex;gap:7px;align-items:flex-start;color:#6c8578;font-size:12.3px;line-height:1.4}.pbl-foot svg{flex:none;margin-top:1px}'+
    '@media (max-width:440px){.pbl{padding:14px;align-items:flex-start}.pbl-card{padding:32px 22px 22px;margin-top:6vh}.pbl-card::before{left:22px}}';
  function loginCss(){
    if(document.getElementById('pbl-css')) return;
    const st=document.createElement('style');st.id='pbl-css';st.textContent=LOGIN_CSS;document.head.appendChild(st);
  }
  function login(msg){
    if(loginP) return loginP;
    loginP=new Promise(resolve=>{
      loginCss();
      const wrap=document.createElement('div');wrap.className='pbl';
      wrap.innerHTML=
        '<form class="pbl-card" autocomplete="on" novalidate>'+
        '<div class="pbl-logo">'+ico('bank',28)+'</div>'+
        '<p class="pbl-org">Câmara Municipal de Rio Verde/GO</p>'+
        '<h2>Sistema Interno do RH</h2>'+
        '<p class="pbl-sub">Entre com o mesmo usuário e senha que você usa no Centi.</p>'+
        '<label class="pbl-f"><span>Usuário</span><div class="pbl-in">'+ico('user')+'<input name="e" type="text" required autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="ex.: nome.sobrenome"></div></label>'+
        '<label class="pbl-f"><span>Senha</span><div class="pbl-in">'+ico('lock')+'<input name="p" type="password" required autocomplete="current-password" placeholder="Sua senha do Centi"><button type="button" class="pbl-eye" data-eye aria-label="Mostrar a senha" aria-pressed="false">'+ico('eye')+'</button></div></label>'+
        '<div class="pbl-err" data-err role="alert" aria-live="polite"></div>'+
        '<button type="submit" class="pbl-go"><span>Entrar</span></button>'+
        '<p class="pbl-foot">'+ico('lock',14)+'<span>A senha é conferida no Centi e não fica guardada neste sistema.</span></p></form>';
      document.body.appendChild(wrap);
      const f=wrap.querySelector('form'),err=wrap.querySelector('[data-err]'),go=wrap.querySelector('.pbl-go'),eye=wrap.querySelector('[data-eye]');
      const erro=(t,info)=>{err.className='pbl-err'+(info?' info':'');err.innerHTML=t?ico('alert',16)+'<span></span>':'';if(t) err.lastChild.textContent=t;};
      const ocupado=on=>{go.disabled=on;go.innerHTML=on?'<i class="pbl-sp"></i><span>Entrando…</span>':'<span>Entrar</span>';};
      if(msg) erro(msg,true);
      const done=ok=>{wrap.remove();loginP=null;resolve(ok);};
      f.e.focus();
      eye.addEventListener('click',()=>{const ver=f.p.type==='password';f.p.type=ver?'text':'password';eye.setAttribute('aria-pressed',ver);eye.setAttribute('aria-label',ver?'Ocultar a senha':'Mostrar a senha');eye.innerHTML=ico(ver?'eyeoff':'eye');f.p.focus();});
      f.addEventListener('submit',async ev=>{
        ev.preventDefault();
        if(!f.e.value.trim()||!f.p.value){erro('Informe o usuário e a senha do Centi.');(f.e.value.trim()?f.p:f.e).focus();return;}
        erro('');ocupado(true);
        try{
          const r=await fetch(CENTI_BASE+'/api/centi-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:f.e.value.trim(),pass:f.p.value})});
          let j=null; try{j=await r.json();}catch(e){}
          if(!r.ok){erro((j&&j.message)||('Não foi possível entrar (HTTP '+r.status+').'));ocupado(false);f.p.select();return;}
          token=j.pb.token; col='rhcmrv_users'; email=j.centi.user; cs=j.centi; saveAuth(); done(true);
        }catch(e){erro('Não foi possível entrar: '+e.message);ocupado(false);}
      });
    });
    return loginP;
  }

  /* ---------- sair ---------- */
  /* botão "Sair" ao lado do botão de tema (ou no rodapé do menu dos Fluxogramas); só existe com sessão do Centi aberta */
  function logout(){clearAuth();location.reload();}
  function mountLogout(){
    if(!cs||!document.body||document.getElementById('pb-logout')) return;
    const nome=(cs.nome||cs.user||'').split(' ')[0];
    const mk=(cls,html)=>{const b=document.createElement('button');b.type='button';b.id='pb-logout';b.className=cls;b.title='Sair ('+cs.user+')';b.setAttribute('aria-label','Sair do sistema ('+cs.user+')');b.innerHTML=html;b.addEventListener('click',logout);return b;};
    const t=document.getElementById('themeBtn'),h=document.querySelector('.side-foot .homelink');
    if(t&&t.parentNode){const b=mk(t.className,ico('out',16)+'Sair');b.style.marginLeft='0';t.insertAdjacentElement('afterend',b);t.style.marginLeft='auto';}
    else if(h&&h.parentNode){const b=mk(h.className,ico('out',14)+'Sair'+(nome?' ('+nome.charAt(0).toUpperCase()+nome.slice(1).toLowerCase()+')':''));b.style.cssText='border:0;cursor:pointer;font:inherit;font-weight:600;font-size:13px;width:calc(100% + 20px);text-align:left;color:inherit';h.insertAdjacentElement('afterend',b);}
  }
  /* as páginas montam o cabeçalho em momentos diferentes: tenta de novo quando o DOM muda */
  function vigiarLogout(){
    mountLogout();
    try{const ob=new MutationObserver(()=>{if(!cs){ob.disconnect();return;}if(!document.getElementById('pb-logout')) mountLogout();});ob.observe(document.body,{childList:true,subtree:true});}catch(e){}
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
  /* tempo real do PocketBase (SSE): cada evento só chega se as regras do servidor deixam esta conta ver a tarefa (privadas de outros não chegam) */
  function ouvirTarefas(cb){
    let es=null,parado=false;
    const abrir=()=>{
      if(parado||typeof EventSource==='undefined') return;
      es=new EventSource(URL_BASE+'/api/realtime');
      es.addEventListener('PB_CONNECT',async ev=>{
        try{
          const id=(JSON.parse(ev.data||'{}').clientId)||ev.lastEventId;
          await fetch(URL_BASE+'/api/realtime',{method:'POST',headers:{'Content-Type':'application/json',Authorization:token},body:JSON.stringify({clientId:id,subscriptions:['rhcmrv_tarefas']})});
        }catch(e){}
      });
      es.addEventListener('rhcmrv_tarefas',ev=>{try{cb(JSON.parse(ev.data));}catch(e){}});
      es.onerror=()=>{};   // o navegador reconecta sozinho e o PB_CONNECT assina de novo
    };
    abrir();
    return ()=>{parado=true;if(es) es.close();};
  }
  const tarefas={
    listen:ouvirTarefas,
    list:todas,
    create:d=>api('POST',TAREFAS,Object.assign({dono:userId()},d)),
    update:(id,d)=>api('PATCH',TAREFAS+'/'+id,d),
    remove:id=>api('DELETE',TAREFAS+'/'+id)
  };

  /* ---------- API do Centi (pelo servidor do sistema, com o acesso da própria pessoa) ---------- */
  /* Sessão do Centi inválida (token vencido sem renovação, sessão apagada ou outro login): pede o login de novo, com aviso, e repete
     a consulta uma vez. O erro só chega à tela se o login for refeito e a consulta ainda assim falhar. */
  function erroSessao(){const e=new Error('Sem sessão do Centi. Entre novamente.');e.status=401;return e;}
  async function comSessao(fn){
    try{if(!cs) throw erroSessao();return await fn();}
    catch(e){
      if(e.status!==401) throw e;
      clearAuth();
      if(!(await login('Sua sessão do Centi expirou. Entre novamente para continuar.'))) throw e;
      const b=document.getElementById('pb-logout');if(b) b.remove();vigiarLogout();   // o botão Sair passa a mostrar o usuário novo
      return fn();
    }
  }
  const centiCall=(path,body)=>comSessao(()=>centiCallUma(path,body));
  const centiPdf=(path,mes,ano,funcionario)=>comSessao(()=>centiPdfUma(path,mes,ano,funcionario));
  async function centiCallUma(path,body){
    if(!cs) throw erroSessao();
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
  /* consulta que o Centi entrega em PDF: a função devolve o gzip dele e o navegador abre */
  async function centiPdfUma(path,mes,ano,funcionario){
    if(!cs) throw erroSessao();
    const r=await fetch(CENTI_BASE+'/api/centi',{method:'POST',
      headers:{'Content-Type':'application/json','x-centi-user':cs.user,'x-centi-token':cs.token,'x-centi-refresh':cs.refreshToken||''},
      body:JSON.stringify({path,body:{mes,ano,funcionario:funcionario||''}})});
    const nt=r.headers.get('x-centi-token'),nr=r.headers.get('x-centi-refresh');
    if(nt){cs.token=nt;if(nr)cs.refreshToken=nr;saveAuth();}
    if(!r.ok){
      let j=null; try{j=await r.json();}catch(e){}
      if(r.status===401){clearAuth();}
      const err=new Error((j&&j.message)||('Centi: HTTP '+r.status));err.status=r.status;throw err;
    }
    if(typeof DecompressionStream==='undefined') throw new Error('Este navegador não consegue abrir o arquivo do Centi. Use um navegador mais recente.');
    return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  /* PB.centi.search('SFuncionario',[{FieldName:'Nome',Operation:6,Value:'%ana%'}]) -> {Data:[...],Count}
     (Operation 6 = contém; a tela de consulta do Centi exige ao menos um filtro com valor) */
  const centi={
    get user(){return cs?cs.user:'';},
    get nome(){return cs?(cs.nome||cs.user):'';},
    get admin(){return !!(cs&&cs.admin);},   // administrador do sistema (edita o painel dos mini sistemas)
    /* Cubo funcionário (FP051) do Centi na referência mes/ano -> {Data:[{MATRICULA,NOMEFUNC,CARGO,HIERARQUIA,...}],Total}; só ativos */
    /* Ficha financeira (FP024) da matrícula no mês/ano -> {Fichas:[{Folha,Mes,Ano,TotalProventos,TotalDescontos,LiquidoReceber,Eventos:[...]}]}; não é guardada */
    ficha(matricula,mes,ano){return centiCall('ficha-financeira',{matricula,mes,ano});},
    /* Férias: ativos (FP051) + gozos de férias (FP273) -> {Pessoas:[...],Gozos:[{MATRICULA,DTAQUIINI,DTAQUIFIN,SALDO,GOZOINICIAL,GOZOFINAL,...}]} */
    ferias(mes,ano){return centiCall('ferias',{mes,ano});},
    cubo(mes,ano){return centiCall('cubo-funcionario',{mes,ano});},
    /* Licença-prêmio: quadro de ativos (Cubo funcionário reduzido, FP245) -> {Pessoas:[{MATRICULA,NOME,SITUACAO,TIPOADMISSAO,DATAADMISSAO,LOTACAO,CARGO,TIPOAFASTAMENTO,DATAAFASTAMENTO}]} */
    licencaQuadro(mes,ano){return centiCall('licenca-quadro',{mes,ano});},
    /* Espelho de ponto (FP170) do órgão inteiro na referência mes/ano -> Uint8Array com o PDF (o Centi leva de 25 s a 1 min) */
    espelho(mes,ano){return centiPdf('espelho-ponto',mes,ano);},
    /* Relação de afastamentos (FP071), de 1990 até o fim da referência -> Uint8Array com o PDF; com o Id do servidor traz só ele */
    afastamentosPdf(mes,ano,funcionario){return centiPdf('afastamentos-pdf',mes,ano,funcionario);},
    /* Busca de servidor por nome (3+ letras) ou matrícula -> {Data:[{Id,Matricula,Nome,DataAdmissao,Situacao,TipoAdm,Cargo,Lotacao}]} (até 50) */
    /* CPF, nascimento, identidade e endereço de UM servidor (FP001 + DM017), pelo Id da busca -> {Nome,Cpf,DataNascimento,Identidade,Endereco}; nada é guardado */
    servidorDados(id){return centiCall('servidor-dados',{id});},
    licencaBusca(termo){return centiCall('licenca-busca',{termo});},
    /* Converte um .docx (Blob) em PDF/A-2u no serviço pdfa -> Blob application/pdf */
    async pdfa(blob){
      if(!cs) throw erroSessao();
      const b=new Uint8Array(await blob.arrayBuffer());let bin='';
      for(let i=0;i<b.length;i+=8192) bin+=String.fromCharCode.apply(null,b.subarray(i,i+8192));
      const r=await fetch(CENTI_BASE+'/api/pdfa',{method:'POST',headers:{'Content-Type':'application/json','x-centi-user':cs.user,'x-centi-token':cs.token},body:JSON.stringify({docx:btoa(bin)})});
      if(!r.ok){let j=null;try{j=await r.json();}catch(e){}if(r.status===401) clearAuth();const err=new Error((j&&j.message)||('PDF/A: HTTP '+r.status));err.status=r.status;throw err;}
      return r.blob();
    },
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
        vigiarLogout();return {doc,collection,centi,tarefas};
      }catch(e){
        if(await offlineDialog()) continue;
        markLocal();return null;
      }
    }
  }
  return {connect,centi,logout,get email(){return email;},get nome(){return centi.nome;},get admin(){return centi.admin;},get userId(){return userId();},url:URL_BASE};
})();

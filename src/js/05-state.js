/* =====================================================================
   Estado, salvamento, cópias de segurança, avisos e janelas
   ===================================================================== */
let state=null;
let touched=false,dbh=null,saving=false,pendingSave=false,saveT=null,toastT=null,undoSnap=null,undoFn=null;
const LS_STATE='rhcrv-estado-v2',LS_VERS='rhcrv-versoes-v2';

function parseState(json){
  try{
    const d=typeof json==='string'?JSON.parse(json):json;
    if(!d||d.v!==2||!Array.isArray(d.units)||!Array.isArray(d.flows)||!d.org||!Array.isArray(d.org.nodes)) return null;
    d.meta=d.meta||{}; d.meta.atualizado=d.meta.atualizado||new Date().toISOString(); d.meta.copiaDia=d.meta.copiaDia||''; d.meta.demo=!!d.meta.demo;
    d.inst=Object.assign({nome:'RH Câmara Rio Verde',sub:'Gestão de Pessoas e Processos Administrativos',orgao:'Câmara Municipal de Rio Verde/GO',setor:'',obs:''},d.inst||{});
    d.units.forEach(u=>{u.nome=String(u.nome||'');u.desc=String(u.desc||'');u.obs=String(u.obs||'');u.hue=Number(u.hue)||0;u.comp=Array.isArray(u.comp)?u.comp.map(String):[];u.icone=u.icone||'file';u.sigla=String(u.sigla||'');u.page=u.page||'';});
    d.org.edges=Array.isArray(d.org.edges)?d.org.edges:[];
    d.org.nodes.forEach(n=>{n.t=String(n.t||'');n.desc=String(n.desc||'');n.obs=String(n.obs||'');n.unitId=n.unitId||'';n.tipo=TIPOS_ORG[n.tipo]?n.tipo:'unidade';});
    d.flows.forEach(f=>{
      f.nome=String(f.nome||'');f.desc=String(f.desc||'');f.page=PAGES_FLOW[f.page]?f.page:'geral';
      f.nodes=Array.isArray(f.nodes)?f.nodes:[];f.edges=Array.isArray(f.edges)?f.edges:[];
      f.nodes.forEach(n=>{n.t=String(n.t||'');n.tipo=TIPOS_FLUXO[n.tipo]?n.tipo:'proc';['desc','unit','resp','prazo','docs','obs','status'].forEach(k=>{n[k]=String(n[k]||'');});});
      f.edges.forEach(e=>{e.l=String(e.l||'');});
    });
    d.matriz=Array.isArray(d.matriz)?d.matriz:[];
    d.kpis=Array.isArray(d.kpis)?d.kpis:[];
    d.kpis.forEach(k=>{k.vals=k.vals&&typeof k.vals==='object'?k.vals:{};});
    d.params=Array.isArray(d.params)?d.params:[];
    d.manual=Array.isArray(d.manual)?d.manual:[];
    return d;
  }catch(e){return null;}
}

/* ---------- indicador de salvamento ---------- */
function setStatus(k){
  const el=$('#saveState'); if(!el) return;
  const map={ok:['Salvo','ok'],dirty:['Alterações pendentes','dirty'],saving:['Salvando…','saving'],local:['Salvo neste navegador','ok'],err:['Erro ao salvar','err'],load:['Carregando…','dirty']};
  const m=map[k]||map.ok;
  el.textContent=m[0]; el.className='pill '+m[1]; el.title=m[0];
}
function changed(){
  touched=true; state.meta.atualizado=new Date().toISOString();
  setStatus('dirty');
  const t=$('#lastChange'); if(t) t.textContent='Última alteração: '+fmtDT(state.meta.atualizado);
  clearTimeout(saveT); saveT=setTimeout(()=>doSave(false),700);
}
const todayKey=()=>new Date().toISOString().slice(0,10);
async function doSave(manual){
  if(saving){pendingSave=true;return;}
  saving=true; setStatus('saving');
  let snapNeeded=false;
  if(state.meta.copiaDia!==todayKey()){state.meta.copiaDia=todayKey();snapNeeded=true;}
  const json=JSON.stringify(state);
  let ok=true;
  if(!dbh){try{localStorage.setItem(LS_STATE,json);}catch(e){}}
  try{
    if(dbh){await dbh.doc('rh/estado').set({v:2,json});setStatus('ok');}
    else setStatus('local');
  }catch(e){ok=false;setStatus('err');}
  if(ok&&snapNeeded){try{await createVersion('Cópia automática do dia',true);}catch(e){}}
  saving=false;
  if(pendingSave){pendingSave=false;doSave(false);}
  else if(manual&&ok) toast(dbh?'Alterações salvas.':'Alterações salvas neste navegador.');
}

/* Envia ao servidor os dados que estavam só neste navegador e, depois de conferir, apaga a cópia local. */
async function migrateLocal(){
  try{
    const vs=localVersions();
    await doSave(false);
    const s=await dbh.doc('rh/estado').get();
    if(!s.exists||!parseState(s.data().json)) throw new Error('verificação');
    for(const v of vs){await dbh.doc('versoes/'+v.id).set({at:v.at,label:v.label,json:v.json});}
    try{localStorage.removeItem(LS_STATE);localStorage.removeItem(LS_VERS);}catch(e){}
    toast('Dados deste navegador enviados ao servidor.');
  }catch(e){toast('Não foi possível enviar os dados locais ao servidor. Eles continuam neste navegador.');}
}

/* ---------- versões (cópias de segurança) ---------- */
function localVersions(){try{return JSON.parse(localStorage.getItem(LS_VERS)||'[]');}catch(e){return [];}}
function putLocalVersions(a){try{localStorage.setItem(LS_VERS,JSON.stringify(a.slice(0,8)));}catch(e){}}
async function listVersions(){
  if(dbh){
    try{
      const q=await dbh.collection('versoes').orderBy('at','desc').limit(30).get();
      return q.docs.map(d=>{const x=d.data();return {id:d.id,at:x.at,label:x.label,json:x.json};});
    }catch(e){return [];}
  }
  return localVersions();
}
async function createVersion(label,silent){
  const rec={id:uid('v'),at:new Date().toISOString(),label:label||'Cópia manual',json:JSON.stringify(state)};
  if(dbh){
    await dbh.doc('versoes/'+rec.id).set({at:rec.at,label:rec.label,json:rec.json});
    const all=await listVersions();
    for(const v of all.slice(15)){try{await dbh.doc('versoes/'+v.id).delete();}catch(e){}}
  }else{
    putLocalVersions([rec].concat(localVersions()));
  }
  if(!silent) toast('Cópia de segurança criada.');
}
async function removeVersion(id){
  if(dbh){try{await dbh.doc('versoes/'+id).delete();}catch(e){}}
  else putLocalVersions(localVersions().filter(v=>v.id!==id));
}

/* ---------- avisos e janelas ---------- */
function toast(msg,snap){
  const t=$('#toast'); if(!t) return;
  undoSnap=snap||null;
  t.innerHTML=`<div class="toast-in"><span>${esc(msg)}</span>${snap?'<button class="btn sm" data-a="undo">Desfazer</button>':''}</div>`;
  t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{t.hidden=true;},9000);
}
/* Executa uma ação que apaga ou substitui dados, guardando uma cópia para "Desfazer". */
function destructive(msg,fn){
  const snap=JSON.stringify(state);
  fn(); changed(); toast(msg,snap);
}
function openModal(title,body,onSubmit,okLabel){
  const m=$('#modal');
  m.innerHTML=`<form class="modal" autocomplete="off"><h3>${esc(title)}</h3>${body}<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-a="modal-close">Cancelar</button><button type="submit" class="btn primary">${esc(okLabel||'Salvar')}</button></div></form>`;
  m.hidden=false;
  const f=$('form',m);
  f.addEventListener('submit',ev=>{ev.preventDefault();if(onSubmit(f)!==false) closeModal();});
  const first=$('input,textarea,select',f); if(first) first.focus();
}
function closeModal(){const m=$('#modal');m.hidden=true;m.innerHTML='';}
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#modal').hidden) closeModal();});
document.addEventListener('click',ev=>{
  if(ev.target.id==='modal'||ev.target.closest('[data-a="modal-close"]')) closeModal();
  const u=ev.target.closest('#toast [data-a="undo"]');
  if(u&&undoSnap){
    const d=parseState(undoSnap); if(!d) return;
    state=d; undoSnap=null; $('#toast').hidden=true; changed();
    if(typeof afterRestore==='function') afterRestore();
  }
});

function isDarkNow(){
  const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
  if(!m) return false;
  return (0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255<0.4;
}

/* ---------- lista por hierarquia ---------- */
function paginaTxt(e){return e.pag.length>1?'págs. '+(e.pag[0]+1)+'–'+(e.pag[e.pag.length-1]+1):'pág. '+(e.pag[0]+1);}
function tagsDe(e){
  let t='';
  if(gkDe(e)==='nao') t+='<span class="tag nao">fora da hierarquia</span>';
  if(e.pag.some(p=>over.get(p)==='skip')) t+='<span class="tag skip">sem carimbo</span>';
  else if(e.pag.some(p=>over.has(p))) t+='<span class="tag">posição própria</span>';
  return t;
}
function arvore(){
  const q=norm(filtro),L=grupos();let h='';
  L.forEach(g=>{
    const es=g.entradas.filter(e=>!q||norm(e.nome+' '+e.mat+' '+e.cargo).includes(q));
    if(!es.length) return;
    const open=!!q||aberto.has(g.k)||aberto.has('__todos');
    h+=`<div class="g-h${open?' open':''}" data-g="${esc(g.k)}"><span class="arr">▶</span><b>${esc(g.nome)}</b><span class="c">${g.entradas.length}</span><button class="btn sm" type="button" data-dl="${esc(g.k)}" title="Baixar só esta hierarquia, já carimbada">Baixar</button></div>`;
    if(open) h+=`<ul class="g-l">${es.map(e=>`<li data-p="${e.pag[0]}" class="${e.pag.includes(cur)?'cur':''}"><div class="nm">${esc(e.nome)}${tagsDe(e)}<span>${esc(e.cargo)}${e.mat?' · mat. '+esc(e.mat):''}</span></div><span class="pg">${paginaTxt(e)}</span></li>`).join('')}</ul>`;
  });
  $('#tree').innerHTML=h||'<div class="empty" style="padding:20px">Nenhum servidor encontrado.</div>';
}
$('#tree').addEventListener('click',ev=>{
  const dl=ev.target.closest('[data-dl]');
  if(dl){ev.stopPropagation();baixar(dl.dataset.dl);return;}
  const gh=ev.target.closest('.g-h');
  if(gh){const k=gh.dataset.g;
    if(aberto.has('__todos')){aberto.delete('__todos');grupos().forEach(g=>{if(g.k!==k) aberto.add(g.k);});}
    else aberto.has(k)?aberto.delete(k):aberto.add(k);
    arvore();return;}
  const li=ev.target.closest('li[data-p]');if(li) mostrar(+li.dataset.p);
});
$('#q').addEventListener('input',ev=>{filtro=ev.target.value;arvore();});
function opcoesGrupo(){
  const e=porPag[cur],ks=new Map();
  GH.forEach((g,k)=>ks.set(k,g.nome));ks.set('nao',NAO.nome);
  const sorted=[...ks.entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  $('#selGrupo').innerHTML=sorted.map(([k,n])=>`<option value="${esc(k)}">${esc(n)}</option>`).join('');
  if(e) $('#selGrupo').value=gkDe(e);
}
$('#selGrupo').addEventListener('change',ev=>{
  const e=porPag[cur];if(!e) return;
  e.manual=ev.target.value;resumo();arvore();opcoesGrupo();
});

/* ---------- pré-visualização e posição do carimbo ---------- */
let renderTask=null,tok=0;
async function mostrar(i){
  if(!pdfDoc) return;
  cur=Math.max(0,Math.min(N-1,i));const t=++tok;
  $('#pgNum').value=cur+1;
  const pg=await pdfDoc.getPage(cur+1),v1=pg.getViewport({scale:1});
  $('#stage').style.maxWidth=Math.round(Math.min(1100,Math.max(420,(window.innerHeight-300)*v1.width/v1.height)))+'px';
  const cw=$('#stage').clientWidth||800,vp=pg.getViewport({scale:cw/v1.width*Math.min(window.devicePixelRatio||1,2)});
  const cv=$('#cv');cv.width=vp.width;cv.height=vp.height;
  if(renderTask){try{renderTask.cancel();}catch(e){}}
  renderTask=pg.render({canvasContext:cv.getContext('2d'),viewport:vp});
  try{await renderTask.promise;}catch(e){if(e&&e.name==='RenderingCancelledException') return;}
  if(t!==tok) return;
  info();stampUi();opcoesGrupo();
  document.querySelectorAll('#tree li').forEach(li=>li.classList.toggle('cur',porPag[cur]&&porPag[cur].pag.includes(+li.dataset.p)));
}
function info(){
  const e=porPag[cur];if(!e) return;
  $('#info').innerHTML=`<b>${esc(e.nome)}</b>${e.mat?' · mat. '+esc(e.mat):''}${e.cargo?' · '+esc(e.cargo):''}${e.periodo?' · '+esc(e.periodo):''}<br>${esc(infoGrupo(gkDe(e)).nome)}`;
}
const posDe=p=>over.get(p);
function stampUi(){
  const st=$('#st'),o=posDe(cur),skip=o==='skip',pp=(o&&o!=='skip')?o:pos;
  st.hidden=skip;st.classList.toggle('fundo',$('#optFundo').checked);
  $('#stImg').src=stampAtual().src;
  st.style.left=(pp.x*100)+'%';st.style.top=(pp.y*100)+'%';st.style.width=(pp.w*100)+'%';
  $('#tam').value=Math.round(pp.w*100);
  $('#soEsta').textContent=o&&o!=='skip'?'Voltar à posição geral':'Posição só para esta página';
  $('#semCar').textContent=skip?'Voltar a carimbar esta página':'Não carimbar esta página';
  $('#posHint').innerHTML=skip?'Esta página <b>não será carimbada</b>.':(o?'Arrastar muda <b>só esta página</b>.':'Arraste o carimbo para posicionar e o canto azul para mudar o tamanho. A mudança vale para <b>todas as páginas</b>.');
}
function pontoAtual(){const o=posDe(cur);return(o&&o!=='skip')?o:pos;}
function mudou(){stampUi();arvore();guardar();}
(function arrastar(){
  const st=$('#st'),h=$('#stHandle');let modo=null,dx=0,dy=0;
  const rect=()=>$('#stage').getBoundingClientRect();
  const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  st.addEventListener('pointerdown',ev=>{
    const r=rect(),p=pontoAtual();modo=ev.target===h?'tam':'mov';
    dx=(ev.clientX-r.left)/r.width-p.x;dy=(ev.clientY-r.top)/r.height-p.y;
    st.setPointerCapture(ev.pointerId);ev.preventDefault();
  });
  st.addEventListener('pointermove',ev=>{
    if(!modo) return;const r=rect(),p=pontoAtual();
    if(modo==='mov'){p.x=lim((ev.clientX-r.left)/r.width-dx,-.05,.98);p.y=lim((ev.clientY-r.top)/r.height-dy,-.05,.98);}
    else p.w=lim((ev.clientX-r.left)/r.width-p.x,.06,.95);
    st.style.left=(p.x*100)+'%';st.style.top=(p.y*100)+'%';st.style.width=(p.w*100)+'%';$('#tam').value=Math.round(p.w*100);
  });
  const fim=()=>{if(modo){modo=null;mudou();}};
  st.addEventListener('pointerup',fim);st.addEventListener('pointercancel',fim);
})();
$('#tam').addEventListener('input',ev=>{pontoAtual().w=+ev.target.value/100;$('#st').style.width=ev.target.value+'%';});
$('#tam').addEventListener('change',mudou);
$('#soEsta').addEventListener('click',()=>{
  const o=posDe(cur);
  if(o&&o!=='skip') over.delete(cur);else over.set(cur,Object.assign({},pos));
  mudou();
});
$('#semCar').addEventListener('click',()=>{if(posDe(cur)==='skip') over.delete(cur);else over.set(cur,'skip');mudou();});
$('#prev').addEventListener('click',()=>mostrar(cur-1));
$('#next').addEventListener('click',()=>mostrar(cur+1));
$('#pgNum').addEventListener('change',ev=>mostrar((+ev.target.value||1)-1));
document.addEventListener('keydown',ev=>{
  if(!pdfDoc||/INPUT|SELECT|TEXTAREA/.test((ev.target||{}).tagName||'')) return;
  if(ev.key==='ArrowLeft'){mostrar(cur-1);ev.preventDefault();}
  else if(ev.key==='ArrowRight'){mostrar(cur+1);ev.preventDefault();}
  else if(ev.key.startsWith('Arrow')){const p=pontoAtual(),s=ev.shiftKey?.01:.002;
    if(ev.key==='ArrowUp') p.y-=s;else if(ev.key==='ArrowDown') p.y+=s;
    mudou();ev.preventDefault();}
});
let rz=null;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>pdfDoc&&mostrar(cur),250);});

/* ---------- carimbos ---------- */
function stampsUi(){
  $('#stamps').innerHTML=stampsTodos().map(s=>`<div class="stamp${s.id===sel?' on':''}" data-s="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(s.nome)}"><img src="${s.src}" alt=""><span>${esc(s.nome)}</span>${s.padrao?'':`<button class="x" type="button" data-rm="${esc(s.id)}" aria-label="Remover carimbo">×</button>`}</div>`).join('');
}
function escolher(id){sel=id;stampsUi();if(pdfDoc) stampUi();guardar();}
$('#stamps').addEventListener('click',ev=>{
  const rm=ev.target.closest('[data-rm]');
  if(rm){ev.stopPropagation();const id=rm.dataset.rm;if(!confirm('Remover este carimbo da lista?')) return;custom=custom.filter(s=>s.id!==id);if(sel===id) sel='padrao';stampsUi();if(pdfDoc) stampUi();guardar();return;}
  const s=ev.target.closest('[data-s]');if(s) escolher(s.dataset.s);
});
$('#stamps').addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.dataset&&ev.target.dataset.s){ev.preventDefault();escolher(ev.target.dataset.s);}});
$('#addStamp').addEventListener('click',()=>$('#stampFile').click());
$('#stampFile').addEventListener('change',async ev=>{
  const f=ev.target.files[0];ev.target.value='';if(!f) return;
  try{
    const url=URL.createObjectURL(f),img=new Image();
    await new Promise((ok,er)=>{img.onload=ok;img.onerror=()=>er(new Error('Imagem inválida'));img.src=url;});
    const k=Math.min(1,1100/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.round(img.naturalWidth*k),h=Math.round(img.naturalHeight*k);
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(img,0,0,w,h);URL.revokeObjectURL(url);
    if($('#semFundo').checked){   // branco (e quase branco) vira transparente, com borda suave
      const d=x.getImageData(0,0,w,h),a=d.data;
      for(let i=0;i<a.length;i+=4){const m=Math.min(a[i],a[i+1],a[i+2]);if(m>=235) a[i+3]=0;else if(m>190) a[i+3]=Math.round(a[i+3]*(235-m)/45);}
      x.putImageData(d,0,0);
    }
    const id='c'+Date.now().toString(36);
    custom.push({id,nome:f.name.replace(/\.[^.]+$/,'').slice(0,40),src:c.toDataURL('image/png')});
    escolher(id);toast('Carimbo adicionado.');
  }catch(e){toast('Não foi possível usar esta imagem: '+(e.message||e));}
});


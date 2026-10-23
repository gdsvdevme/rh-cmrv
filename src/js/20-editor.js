/* =====================================================================
   Editor de diagramas (fluxogramas e organograma): desenho SVG, layout,
   arrastar e soltar, conexões, desfazer/refazer, zoom e exportação.
   ===================================================================== */

/* ---------- medidas e layout automático ---------- */
function wrapLines(text,maxChars){
  const out=[];
  String(text==null?'':text).split(/\r?\n/).forEach(par=>{
    const words=par.split(/\s+/).filter(Boolean);
    if(!words.length){out.push('');return;}
    let cur='';
    words.forEach(w=>{
      while(w.length>maxChars){ if(cur){out.push(cur);cur='';} out.push(w.slice(0,maxChars-1)+'-'); w=w.slice(maxChars-1); }
      if(!cur) cur=w; else if((cur+' '+w).length<=maxChars) cur+=' '+w; else {out.push(cur);cur=w;}
    });
    if(cur) out.push(cur);
  });
  return out.length?out:[''];
}
function nodeSize(n,kind,units){
  if(kind==='org'){
    const d=orgDisp(n,units);
    const tl=wrapLines(d.t||'',21), dl=wrapLines(d.desc||'',30);
    const dlc=dl.slice(0,3); if(dl.length>3) dlc[2]=dlc[2].slice(0,27)+'…';
    const tag=n.tipo==='nucleo'?1:0;
    return {w:250,h:Math.max(74,18+tl.length*18+(d.desc?dlc.length*15+6:0)+(tag?20:0)+12),tl,dl:d.desc?dlc:[],tag};
  }
  const t=n.tipo, w=t==='dec'?250:220;
  const chars=t==='dec'?19:t==='unid'?26:27;
  const lines=wrapLines(n.t,chars);
  let h;
  if(t==='ini'||t==='fim') h=Math.max(46,22+lines.length*17);
  else if(t==='dec') h=Math.max(100,52+lines.length*18);
  else if(t==='doc') h=Math.max(70,38+lines.length*17);
  else h=Math.max(62,28+lines.length*17);
  return {w,h,lines};
}
function autoLayout(doc,kind,units){
  const nodes=doc.nodes; if(!nodes.length) return;
  const sz=new Map(nodes.map(n=>[n.id,nodeSize(n,kind,units)]));
  const out=new Map(nodes.map(n=>[n.id,[]])),inn=new Map(nodes.map(n=>[n.id,[]]));
  doc.edges.forEach(e=>{if(out.has(e.from)&&out.has(e.to)&&e.from!==e.to){out.get(e.from).push(e.to);inn.get(e.to).push(e.from);}});
  const st=new Map(),back=new Set(),disc=[];
  const dfs=u=>{st.set(u,1);disc.push(u);out.get(u).forEach(v=>{const s=st.get(v);if(s===1) back.add(u+'>'+v);else if(!s) dfs(v);});st.set(u,2);};
  const starts=nodes.filter(n=>n.tipo==='ini').map(n=>n.id).concat(nodes.filter(n=>!inn.get(n.id).length).map(n=>n.id),nodes.map(n=>n.id));
  starts.forEach(id=>{if(!st.has(id)) dfs(id);});
  const fwd=[];
  doc.edges.forEach(e=>{if(out.has(e.from)&&out.has(e.to)&&e.from!==e.to&&!back.has(e.from+'>'+e.to)) fwd.push([e.from,e.to]);});
  const layer=new Map(nodes.map(n=>[n.id,0]));
  for(let it=0;it<nodes.length+1;it++){
    let ch=false;
    fwd.forEach(([a,b])=>{if(layer.get(b)<layer.get(a)+1){layer.set(b,layer.get(a)+1);ch=true;}});
    if(!ch) break;
  }
  const maxL=Math.max(...layer.values());
  const layers=[];for(let i=0;i<=maxL;i++) layers.push([]);
  const rank=new Map(disc.map((id,i)=>[id,i]));
  nodes.slice().sort((a,b)=>(rank.get(a.id)||0)-(rank.get(b.id)||0)).forEach(n=>layers[layer.get(n.id)].push(n.id));
  const gapX=44,cx=new Map();
  layers.forEach(L=>{let x=0;L.forEach(id=>{const w=sz.get(id).w;cx.set(id,x+w/2);x+=w+gapX;});const tot=x-gapX;L.forEach(id=>cx.set(id,cx.get(id)-tot/2));});
  const preds=new Map(nodes.map(n=>[n.id,[]])),succs=new Map(nodes.map(n=>[n.id,[]]));
  fwd.forEach(([a,b])=>{succs.get(a).push(b);preds.get(b).push(a);});
  const place=(L,rel)=>{
    const want=new Map(L.map(id=>{const r=rel.get(id);const v=r.length?r.reduce((s,k)=>s+cx.get(k),0)/r.length:cx.get(id);return [id,v];}));
    const ord=L.slice().sort((a,b)=>want.get(a)-want.get(b));
    const pos=[];let prev=-Infinity,prevW=0;
    ord.forEach((id,i)=>{const w=sz.get(id).w;let x=want.get(id);if(i>0) x=Math.max(x,prev+prevW/2+w/2+gapX);pos.push(x);prev=x;prevW=w;});
    const shift=ord.reduce((s,id,i)=>s+(want.get(id)-pos[i]),0)/ord.length;
    ord.forEach((id,i)=>cx.set(id,pos[i]+shift));
    return ord;
  };
  for(let it=0;it<6;it++){
    for(let i=1;i<layers.length;i++) layers[i]=place(layers[i],preds);
    for(let i=layers.length-2;i>=0;i--) layers[i]=place(layers[i],succs);
  }
  for(let i=1;i<layers.length;i++) layers[i]=place(layers[i],preds);
  let minX=Infinity;
  layers.forEach(L=>L.forEach(id=>{minX=Math.min(minX,cx.get(id)-sz.get(id).w/2);}));
  const gapY=kind==='org'?70:62;
  let y=0;
  layers.forEach(L=>{
    const mh=Math.max(0,...L.map(id=>sz.get(id).h));
    L.forEach(id=>{const n=nodes.find(k=>k.id===id);n.x=Math.round(cx.get(id)-sz.get(id).w/2-minX+20);n.y=Math.round(y+(mh-sz.get(id).h)/2+20);});
    y+=mh+gapY;
  });
}
function layoutAll(st){
  autoLayout(st.org,'org',st.units);
  st.flows.forEach(f=>autoLayout(f,'flow',st.units));
}

/* ---------- aparência ---------- */
const SP={
  light:{dark:false,bg:'#ffffff',surface:'#ffffff',line:'#8aa89a',edge:'#4d6b5c',fg:'#12281d',muted:'#4f665a',accent:'#0a6b3d',accentFg:'#ffffff'},
  dark:{dark:true,bg:'#09140f',surface:'#101e18',line:'#44705c',edge:'#8ab8a0',fg:'#e3f1ea',muted:'#90b0a0',accent:'#52c98a',accentFg:'#04210f'}
};
const curPal=()=>isDarkNow()?SP.dark:SP.light;
function hsl2hex(h,s,l){
  s/=100;l/=100;
  const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
const DEF_HUE={dec:45,aprov:145,arq:225};
function tint(h,pal){
  return pal.dark?{fill:hsl2hex(h,32,22),stroke:hsl2hex(h,45,62),text:pal.fg}:{fill:hsl2hex(h,62,92),stroke:hsl2hex(h,48,40),text:pal.fg};
}
function nodeColors(n,pal,units,kind){
  if(kind==='org'){const d=orgDisp(n,units);return d.hue==null?{fill:pal.surface,stroke:pal.line,text:pal.fg}:tint(d.hue,pal);}
  if(n.tipo==='ini'||n.tipo==='fim'){
    if(n.hue!=null) return {fill:hsl2hex(n.hue,55,pal.dark?42:36),stroke:hsl2hex(n.hue,55,pal.dark?42:36),text:'#ffffff'};
    return {fill:pal.accent,stroke:pal.accent,text:pal.accentFg};
  }
  let h=n.hue;
  if(h==null){const u=units.find(x=>x.id===n.unit);h=u?u.hue:DEF_HUE[n.tipo];}
  if(h==null) return {fill:pal.surface,stroke:pal.line,text:pal.fg};
  return tint(h,pal);
}
function shapeEl(t,w,h,a){
  switch(t){
    case 'ini':case 'fim': return `<rect width="${w}" height="${h}" rx="${h/2}" ${a}/>`;
    case 'dec': return `<polygon points="${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}" ${a}/>`;
    case 'doc': return `<path d="M0 0H${w}V${h-12}Q${w*0.75} ${h-24} ${w/2} ${h-12}T0 ${h-12}Z" ${a}/>`;
    case 'aprov': return `<polygon points="16,0 ${w-16},0 ${w},${h/2} ${w-16},${h} 16,${h} 0,${h/2}" ${a}/>`;
    case 'arq': return `<path d="M0 8Q0 0 8 0H${w*0.38}L${w*0.38+10} 9H${w-8}Q${w} 9 ${w} 17V${h-8}Q${w} ${h} ${w-8} ${h}H8Q0 ${h} 0 ${h-8}Z" ${a}/>`;
    case 'org': return `<rect width="${w}" height="${h}" rx="9" ${a}/>`;
    default: return `<rect width="${w}" height="${h}" rx="6" ${a}/>`;
  }
}
function textLines(lines,x,y0,lh,attrs){
  return `<text x="${x}" y="${y0}" text-anchor="middle" ${attrs}>`+lines.map((l,i)=>`<tspan x="${x}" dy="${i?lh:0}">${esc(l)}</tspan>`).join('')+'</text>';
}
function iconSvg(name,x,y,s,color){
  return `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.file}</svg>`;
}
const FONT='font-family="Public Sans,Arial,sans-serif"';
function nodeSvg(n,sz,pal,units,kind,o){
  const {w,h}=sz,col=nodeColors(n,pal,units,kind);
  const a=`fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.6"`;
  let inner='';
  if(kind==='org'){
    const d=orgDisp(n,units);
    inner=shapeEl('org',w,h,a+(n.tipo==='nucleo'?' stroke-dasharray="6 4"':''));
    inner+=iconSvg(d.icone,12,12,20,col.stroke);
    let y=26;
    inner+=`<text x="40" y="${y}" font-size="13.5" font-weight="700" fill="${col.text}" ${FONT}>`+sz.tl.map((l,i)=>`<tspan x="40" dy="${i?18:0}">${esc(l)}</tspan>`).join('')+'</text>';
    y+=(sz.tl.length-1)*18+8;
    if(sz.dl.length){inner+=`<text x="40" y="${y+8}" font-size="11.5" fill="${pal.muted}" ${FONT}>`+sz.dl.map((l,i)=>`<tspan x="40" dy="${i?15:0}">${esc(l)}</tspan>`).join('')+'</text>';y+=sz.dl.length*15+2;}
    if(sz.tag) inner+=`<text x="40" y="${h-10}" font-size="10.5" font-weight="600" fill="${col.stroke}" ${FONT}>DIVISÃO INTERNA DE TRABALHO</text>`;
  }else{
    inner=shapeEl(n.tipo,w,h,a);
    let cx=w/2,cy=h/2;
    if(n.tipo==='unid'){inner+=`<rect x="0" y="0" width="9" height="${h}" rx="4" fill="${col.stroke}"/>`;cx+=5;}
    if(n.tipo==='doc') cy-=6;
    if(n.tipo==='arq') cy+=4;
    const lh=n.tipo==='dec'?17:17;
    const y0=cy-((sz.lines.length-1)*lh)/2+4.5;
    inner+=textLines(sz.lines,cx,y0,lh,`font-size="13" font-weight="${n.tipo==='ini'||n.tipo==='fim'?700:500}" fill="${col.text}" ${FONT}`);
  }
  if(o.sel) inner+=shapeEl(kind==='org'?'org':n.tipo,w,h,`fill="none" stroke="${pal.accent}" stroke-width="4" opacity=".9" pointer-events="none"`);
  if(o.ui&&o.sel){
    inner+=`<g class="hdl" data-handle="${esc(n.id)}"><circle cx="${w/2}" cy="${h+14}" r="9" fill="${pal.accent}"/><path d="M${w/2-3.5} ${h+12}L${w/2} ${h+16.5}L${w/2+3.5} ${h+12}" fill="none" stroke="${pal.accentFg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    inner+=`<g class="hdl" data-handle="${esc(n.id)}"><circle cx="${w+14}" cy="${h/2}" r="9" fill="${pal.accent}"/><path d="M${w+12} ${h/2-3.5}L${w+16.5} ${h/2}L${w+12} ${h/2+3.5}" fill="none" stroke="${pal.accentFg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  return `<g class="nd" data-node="${esc(n.id)}" transform="translate(${n.x||0} ${n.y||0})">${inner}</g>`;
}
function edgeGeom(A,B,sa,sb,kind){
  const a={x:A.x||0,y:A.y||0,w:sa.w,h:sa.h},b={x:B.x||0,y:B.y||0,w:sb.w,h:sb.h};
  const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
  const bez=(P0,P1,P2,P3)=>({d:`M${P0.x} ${P0.y}C${P1.x} ${P1.y} ${P2.x} ${P2.y} ${P3.x} ${P3.y}`,lx:(P0.x+3*P1.x+3*P2.x+P3.x)/8,ly:(P0.y+3*P1.y+3*P2.y+P3.y)/8});
  if(kind==='org'){
    const s={x:ac.x,y:a.y+a.h},t={x:bc.x,y:b.y};
    if(b.y>=a.y+a.h-1){const my=Math.round((s.y+t.y)/2);return {d:`M${s.x} ${s.y}V${my}H${t.x}V${t.y}`,lx:t.x,ly:my};}
    return {d:`M${ac.x} ${ac.y}L${bc.x} ${bc.y}`,lx:(ac.x+bc.x)/2,ly:(ac.y+bc.y)/2};
  }
  const gapDown=b.y-(a.y+a.h),gapUp=a.y-(b.y+b.h);
  if(gapDown>=16){
    const s={x:ac.x,y:a.y+a.h},t={x:bc.x,y:b.y},k=Math.max(24,gapDown/2);
    return bez(s,{x:s.x,y:s.y+k},{x:t.x,y:t.y-k},t);
  }
  if(gapUp>=16){
    const xo=Math.max(a.x+a.w,b.x+b.w)+56,s={x:a.x+a.w,y:ac.y},t={x:b.x+b.w,y:bc.y};
    return bez(s,{x:xo,y:s.y},{x:xo,y:t.y},t);
  }
  let s,t;
  if(bc.x>=ac.x){s={x:a.x+a.w,y:ac.y};t={x:b.x,y:bc.y};}else{s={x:a.x,y:ac.y};t={x:b.x+b.w,y:bc.y};}
  const k=Math.max(24,Math.abs(t.x-s.x)/2),dir=t.x>=s.x?1:-1;
  return bez(s,{x:s.x+dir*k,y:s.y},{x:t.x-dir*k,y:t.y},t);
}
function edgeSvg(e,A,B,sa,sb,pal,kind,o){
  const g=edgeGeom(A,B,sa,sb,kind),sel=o.sel&&o.sel.k==='e'&&o.sel.id===e.id;
  const col=sel?pal.accent:pal.edge;
  const arrow=kind==='flow'?` marker-end="url(#${o.mid}${sel?'S':''})"`:'';
  let s=`<g class="eg"><path d="${g.d}" fill="none" stroke="${col}" stroke-width="${sel?2.6:1.8}" stroke-linejoin="round"${arrow}/>`;
  if(o.ui) s+=`<path class="eh" data-edge="${esc(e.id)}" d="${g.d}" fill="none" stroke="transparent" stroke-width="16"/>`;
  if(e.l&&kind==='flow'){
    const tw=Math.max(26,e.l.length*6.6+16);
    s+=`<g${o.ui?` class="eh" data-edge="${esc(e.id)}"`:''}><rect x="${g.lx-tw/2}" y="${g.ly-10}" width="${tw}" height="20" rx="10" fill="${pal.surface}" stroke="${col}" stroke-width="1"/><text x="${g.lx}" y="${g.ly+4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${col}" ${FONT}>${esc(e.l)}</text></g>`;
  }
  return s+'</g>';
}
function sceneInner(doc,kind,pal,o){
  const units=o.units;
  const sz=new Map(doc.nodes.map(n=>[n.id,nodeSize(n,kind,units)]));
  const byId=new Map(doc.nodes.map(n=>[n.id,n]));
  const marker=(id,c)=>`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
  let s=`<defs>${marker(o.mid,pal.edge)}${marker(o.mid+'S',pal.accent)}</defs>`;
  doc.edges.forEach(e=>{const A=byId.get(e.from),B=byId.get(e.to);if(A&&B) s+=edgeSvg(e,A,B,sz.get(A.id),sz.get(B.id),pal,kind,o);});
  const selId=o.sel&&o.sel.k==='n'?o.sel.id:null;
  doc.nodes.forEach(n=>{s+=nodeSvg(n,sz.get(n.id),pal,units,kind,{sel:n.id===selId,ui:o.ui});});
  return s;
}
function sceneBBox(doc,kind,units){
  if(!doc.nodes.length) return {x:0,y:0,w:300,h:160};
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  doc.nodes.forEach(n=>{const s=nodeSize(n,kind,units);x0=Math.min(x0,n.x||0);y0=Math.min(y0,n.y||0);x1=Math.max(x1,(n.x||0)+s.w);y1=Math.max(y1,(n.y||0)+s.h);});
  if(kind==='flow') x1+=64;
  return {x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function sceneStandalone(doc,kind,pal,o){
  const bb=sceneBBox(doc,kind,o.units),pad=36,top=o.title?44:0;
  const W=Math.ceil(bb.w+pad*2),H=Math.ceil(bb.h+pad*2+top);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>`
    +`<rect width="100%" height="100%" fill="${pal.bg}"/>`
    +(o.title?`<text x="${pad}" y="32" font-size="18" font-weight="700" fill="${pal.fg}" ${FONT}>${esc(o.title)}</text>`:'')
    +`<g transform="translate(${pad-bb.x} ${pad+top-bb.y})">${sceneInner(doc,kind,pal,{units:o.units,sel:null,mid:o.mid||'x',ui:false})}</g></svg>`;
  return {svg,w:W,h:H};
}

/* ---------- editor ---------- */
let activeEd=null,edSeq=0;
document.addEventListener('keydown',ev=>{
  const E=activeEd; if(!E||!document.body.contains(E.host)) return;
  const t=ev.target;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable) return;
  if(!$('#modal').hidden) return;
  const k=ev.key.toLowerCase(),mod=ev.ctrlKey||ev.metaKey;
  if((k==='delete'||k==='backspace')&&E.sel){ev.preventDefault();E.api.del();}
  else if(mod&&k==='z'){ev.preventDefault();ev.shiftKey?E.api.redo():E.api.undo();}
  else if(mod&&k==='y'){ev.preventDefault();E.api.redo();}
  else if(k==='escape'&&E.sel){E.api.select(null);}
});
window.addEventListener('resize',()=>{if(activeEd&&activeEd.api&&activeEd.api.resize) activeEd.api.resize();});

function createEditor(host,cfg){
  const kind=cfg.kind,cid=++edSeq;
  const E={host,kind,doc:cfg.doc,sel:null,view:{x:30,y:30,k:1},touched:false,drag:null,hist:{stack:[],i:-1},branchText:'Nomeação\nExoneração\nPosse\nExercício\nMovimentação funcional'};
  activeEd=E;
  const units=()=>state.units;
  const node=id=>E.doc.nodes.find(n=>n.id===id);
  const nodeName=n=>kind==='org'?oneLine(orgDisp(n,units()).t)||'(sem nome)':oneLine(n.t)||'(sem texto)';
  const sizeOf=n=>nodeSize(n,kind,units());

  host.innerHTML=`<div class="ed">
    <div class="ed-bar"></div>
    <div class="ed-main">
      <div class="ed-canvas"><svg class="ed-svg" tabindex="0" role="application" aria-label="Área de edição do diagrama"><g class="vp"></g></svg>
        <div class="ed-hint">${matchMedia('(pointer:coarse)').matches?'Arraste para mover · arraste o fundo para deslocar · dois dedos para zoom':'Arraste os elementos para mover. Arraste o fundo para deslocar a vista. Ctrl + roda do mouse para zoom.'}</div></div>
      <aside class="ed-panel" aria-live="polite"></aside>
    </div>
    ${kind==='flow'?'<div class="ed-table card"></div>':''}
  </div>`;
  const bar=$('.ed-bar',host),svg=$('.ed-svg',host),vp=$('.vp',svg),panel=$('.ed-panel',host),tableEl=$('.ed-table',host);

  /* --- barra de ferramentas --- */
  const addBtns=kind==='flow'
    ?['proc','dec','doc','unid','aprov','arq','ini','fim'].map(t=>`<button class="btn sm" data-a="add" data-t="${t}" title="Adicionar elemento: ${esc(TIPOS_FLUXO[t])}">${icon('plus',14)}${esc(TIPOS_FLUXO[t])}</button>`).join('')
    :`<button class="btn sm" data-a="add" data-t="unidade">${icon('plus',14)}Unidade</button><button class="btn sm" data-a="add" data-t="nucleo">${icon('plus',14)}Divisão interna</button><button class="btn sm" data-a="add" data-t="orgao">${icon('plus',14)}Órgão</button>`;
  bar.innerHTML=`<div class="grp"><span class="lbl">Adicionar</span>${addBtns}</div>
    <div class="grp"><button class="btn sm" data-a="undo">${icon('undo',14)}Desfazer</button><button class="btn sm" data-a="redo">${icon('redo',14)}Refazer</button><button class="btn sm" data-a="layout" title="Reorganiza as posições automaticamente">Organizar</button></div>
    <div class="grp"><button class="ibtn" data-a="zout" aria-label="Diminuir zoom">−</button><span class="mono" data-zp style="min-width:44px;text-align:center;font-size:12.5px">100%</span><button class="ibtn" data-a="zin" aria-label="Aumentar zoom">+</button><button class="btn sm" data-a="fit">Ajustar</button></div>
    <div class="grp"><span class="lbl">Exportar</span><button class="btn sm" data-a="png">PNG</button><button class="btn sm" data-a="svg">SVG</button><button class="btn sm" data-a="pdf">PDF</button><button class="btn sm" data-a="print">${icon('print',14)}Imprimir</button></div>`;

  /* --- coordenadas e vista --- */
  const toWorld=ev=>{const r=svg.getBoundingClientRect();return {x:(ev.clientX-r.left-E.view.x)/E.view.k,y:(ev.clientY-r.top-E.view.y)/E.view.k};};
  const snap=v=>Math.round(v/10)*10;
  function applyView(){
    vp.setAttribute('transform',`translate(${E.view.x} ${E.view.y}) scale(${E.view.k})`);
    const z=$('[data-zp]',bar); if(z) z.textContent=Math.round(E.view.k*100)+'%';
  }
  function fit(){
    const bb=sceneBBox(E.doc,kind,units());
    const W=svg.clientWidth||900,H=svg.clientHeight||520;
    const k=Math.max(0.15,Math.min(1.1,(W-50)/bb.w,(H-50)/bb.h));
    E.view.k=k; E.view.x=(W-bb.w*k)/2-bb.x*k; E.view.y=Math.max(20,(H-bb.h*k)/2)-bb.y*k+(H-bb.h*k>40?0:0);
    applyView();
  }
  function zoomAt(cx,cy,f){
    const k=Math.max(0.15,Math.min(2.5,E.view.k*f)),r=k/E.view.k;
    E.view.x=cx-(cx-E.view.x)*r; E.view.y=cy-(cy-E.view.y)*r; E.view.k=k; E.touched=true; applyView();
  }
  let raf=0;
  function sched(){if(raf) return;raf=requestAnimationFrame(()=>{raf=0;scene();});}
  function scene(){
    const pal=curPal();
    let s=sceneInner(E.doc,kind,pal,{units:units(),sel:E.sel,mid:'mk'+cid,ui:true});
    if(E.drag&&E.drag.type==='connect'&&E.drag.pos){
      const n=node(E.drag.from);
      if(n){const sz=sizeOf(n),p=E.drag.pos;s+=`<path d="M${n.x+sz.w/2} ${n.y+sz.h}L${p.x} ${p.y}" stroke="${pal.accent}" stroke-width="2" stroke-dasharray="6 4" fill="none" pointer-events="none"/>`;}
    }
    vp.innerHTML=s; applyView();
  }

  /* --- histórico --- */
  const snapDoc=()=>JSON.stringify({nodes:E.doc.nodes,edges:E.doc.edges});
  function commit(){
    const s=snapDoc();
    if(s===E.hist.stack[E.hist.i]){updHist();return;}
    E.hist.stack.splice(E.hist.i+1); E.hist.stack.push(s);
    if(E.hist.stack.length>80) E.hist.stack.shift();
    E.hist.i=E.hist.stack.length-1; updHist();
  }
  let ct=0;
  const commitSoon=()=>{clearTimeout(ct);ct=setTimeout(commit,600);};
  function updHist(){
    const u=$('[data-a="undo"]',bar),r=$('[data-a="redo"]',bar);
    if(u) u.disabled=E.hist.i<=0; if(r) r.disabled=E.hist.i>=E.hist.stack.length-1;
  }
  function restore(i){
    clearTimeout(ct);
    const s=JSON.parse(E.hist.stack[i]);
    E.doc.nodes=s.nodes; E.doc.edges=s.edges; E.hist.i=i;
    if(E.sel&&E.sel.k==='n'&&!node(E.sel.id)) E.sel=null;
    if(E.sel&&E.sel.k==='e'&&!E.doc.edges.some(e=>e.id===E.sel.id)) E.sel=null;
    scene(); renderPanel(); renderTable(); updHist(); cfg.onChange();
  }
  const touch=()=>{cfg.onChange();};

  /* --- seleção --- */
  function select(k,id){
    E.sel=k?{k,id}:null;
    scene(); renderPanel(); markTable();
  }

  /* --- operações no diagrama --- */
  function defaultLabel(src){
    if(kind!=='flow'||src.tipo!=='dec') return '';
    const n=E.doc.edges.filter(e=>e.from===src.id).length;
    return n===0?'Sim':n===1?'Não':'';
  }
  function isDesc(a,b){ // b é descendente de a?
    const seen=new Set(),st=[a];
    while(st.length){const x=st.pop();if(x===b) return true;if(seen.has(x)) continue;seen.add(x);E.doc.edges.forEach(e=>{if(e.from===x) st.push(e.to);});}
    return false;
  }
  function connect(from,to,label){
    if(from===to) return false;
    if(E.doc.edges.some(e=>e.from===from&&e.to===to)){toast('Esses elementos já estão conectados.');return false;}
    if(kind==='org'){
      if(isDesc(to,from)){toast('Essa conexão criaria um ciclo na hierarquia.');return false;}
      E.doc.edges=E.doc.edges.filter(e=>e.to!==to);
    }
    const src=node(from);
    E.doc.edges.push({id:uid('e'),from,to,l:label!=null?label:defaultLabel(src)});
    return true;
  }
  const freeSpot=(n,sz)=>{
    let guard=0;
    while(guard++<40&&E.doc.nodes.some(o=>{if(o===n) return false;const s=sizeOf(o);return n.x<(o.x||0)+s.w+20&&n.x+sz.w+20>(o.x||0)&&n.y<(o.y||0)+s.h+20&&n.y+sz.h+20>(o.y||0);})) n.x+=60;
  };
  function addNode(tipo){
    const sel=E.sel&&E.sel.k==='n'?node(E.sel.id):null;
    let n;
    if(kind==='flow'){
      const names={ini:'INÍCIO',fim:'ENCERRAMENTO',proc:'Nova etapa',dec:'Nova decisão?',doc:'Documento',unid:'Unidade administrativa',aprov:'Aprovação',arq:'Arquivamento'};
      n=nd(uid('n'),tipo,names[tipo]||'Novo elemento','');
    }else{
      if(tipo==='orgao') n={id:uid('o'),tipo:'orgao',t:'Novo órgão',desc:'',unitId:'',hue:212,icone:'building',obs:'',x:0,y:0};
      else{
        const u={id:uid('u-'),nome:tipo==='nucleo'?'Nova divisão interna':'Nova unidade',sigla:'',icone:tipo==='nucleo'?'calendar':'users',hue:HUES[state.units.length%HUES.length],page:'',externa:false,divisao:tipo==='nucleo',desc:'',obs:tipo==='nucleo'?'Divisão interna de trabalho, sem criação automática de novos cargos.':'',comp:[]};
        state.units.push(u);
        n={id:uid('o'),tipo,t:'',desc:'',unitId:u.id,hue:null,icone:'',obs:'',x:0,y:0};
      }
    }
    const sz=sizeOf(n);
    if(sel&&!(kind==='flow'&&sel.tipo==='fim')){
      const ss=sizeOf(sel); n.x=snap((sel.x||0)+(ss.w-sz.w)/2); n.y=snap((sel.y||0)+ss.h+70);
    }else{
      const W=svg.clientWidth||800,H=svg.clientHeight||500;
      n.x=snap((W/2-E.view.x)/E.view.k-sz.w/2); n.y=snap((H/2-E.view.y)/E.view.k-sz.h/2);
    }
    freeSpot(n,sz);
    E.doc.nodes.push(n);
    if(sel&&!(kind==='flow'&&sel.tipo==='fim')) connect(sel.id,n.id);
    commit(); touch(); select('n',n.id); renderTable();
    const f=$('[data-f="t"]',panel); if(f){f.focus();f.select();}
  }
  function delSel(){
    if(!E.sel) return;
    if(E.sel.k==='n'){
      const id=E.sel.id;
      E.doc.nodes=E.doc.nodes.filter(n=>n.id!==id);
      E.doc.edges=E.doc.edges.filter(e=>e.from!==id&&e.to!==id);
      toast(kind==='org'?'Elemento removido do organograma. A unidade continua cadastrada em Competências. Use Desfazer (Ctrl+Z) para recuperar.':'Elemento excluído. Use Desfazer (Ctrl+Z) para recuperar.');
    }else{
      const id=E.sel.id; E.doc.edges=E.doc.edges.filter(e=>e.id!==id);
    }
    E.sel=null; commit(); touch(); scene(); renderPanel(); renderTable();
  }
  function relayout(){
    autoLayout(E.doc,kind,units()); commit(); touch(); fit(); scene();
  }

  /* --- ponteiro --- */
  function hitNode(p){
    for(let i=E.doc.nodes.length-1;i>=0;i--){const n=E.doc.nodes[i],s=sizeOf(n);if(p.x>=n.x&&p.x<=n.x+s.w&&p.y>=n.y&&p.y<=n.y+s.h) return n;}
    return null;
  }
  /* zoom e deslocamento com dois dedos */
  const ptrs=new Map();let pinch=null;
  const rel=()=>{const r=svg.getBoundingClientRect(),[a,b]=[...ptrs.values()];return {x:(a[0]+b[0])/2-r.left,y:(a[1]+b[1])/2-r.top,d:Math.hypot(a[0]-b[0],a[1]-b[1])||1};};
  function startPinch(){
    const d=E.drag; E.drag=null;
    if(d&&d.type==='move'&&d.moved){commit();touch();renderTable();}
    const m=rel(); pinch={x:m.x,y:m.y,d:m.d,vx:E.view.x,vy:E.view.y,k:E.view.k};
  }
  function movePinch(){
    const m=rel(),k=Math.max(0.15,Math.min(2.5,pinch.k*m.d/pinch.d)),r=k/pinch.k;
    E.view.k=k;E.view.x=m.x-(pinch.x-pinch.vx)*r;E.view.y=m.y-(pinch.y-pinch.vy)*r;E.touched=true;applyView();
  }
  svg.addEventListener('pointerdown',ev=>{
    if(ev.pointerType==='mouse'&&ev.button!==0) return;
    if(ev.pointerType==='touch'){
      ptrs.set(ev.pointerId,[ev.clientX,ev.clientY]);
      if(ptrs.size===2){startPinch();return;}
      if(ptrs.size>2) return;
    }
    activeEd=E; const w=toWorld(ev);
    const hd=ev.target.closest('[data-handle]');
    if(hd){E.drag={type:'connect',from:hd.dataset.handle,pos:w};svg.setPointerCapture(ev.pointerId);return;}
    const nn=ev.target.closest('[data-node]');
    if(nn){
      const n=node(nn.dataset.node); if(!n) return;
      if(!(E.sel&&E.sel.k==='n'&&E.sel.id===n.id)) select('n',n.id);
      E.drag={type:'move',id:n.id,dx:w.x-n.x,dy:w.y-n.y,moved:false,sx:ev.clientX,sy:ev.clientY};
      svg.setPointerCapture(ev.pointerId); return;
    }
    const eg=ev.target.closest('[data-edge]');
    if(eg){select('e',eg.dataset.edge);return;}
    if(E.sel) select(null);
    E.drag={type:'pan',sx:ev.clientX,sy:ev.clientY,vx:E.view.x,vy:E.view.y};
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove',ev=>{
    if(ptrs.has(ev.pointerId)){ptrs.set(ev.pointerId,[ev.clientX,ev.clientY]);if(pinch){movePinch();return;}}
    const d=E.drag; if(!d) return;
    if(d.type==='pan'){E.view.x=d.vx+ev.clientX-d.sx;E.view.y=d.vy+ev.clientY-d.sy;E.touched=true;applyView();}
    else if(d.type==='move'){
      if(!d.moved&&Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<4) return;
      d.moved=true; const w=toWorld(ev),n=node(d.id); if(!n) return;
      n.x=snap(w.x-d.dx); n.y=snap(w.y-d.dy); sched();
    }else if(d.type==='connect'){d.pos=toWorld(ev);sched();}
  });
  const endDrag=ev=>{
    ptrs.delete(ev.pointerId);
    if(pinch){if(ptrs.size<2) pinch=null;E.drag=null;return;}
    const d=E.drag; if(!d) return; E.drag=null;
    try{svg.releasePointerCapture(ev.pointerId);}catch(e){}
    if(d.type==='move'&&d.moved){commit();touch();renderTable();}
    else if(d.type==='connect'){
      const t=hitNode(d.pos);
      if(t&&t.id!==d.from&&connect(d.from,t.id)){commit();touch();renderPanel();renderTable();}
      scene();
    }
  };
  svg.addEventListener('pointerup',endDrag);
  svg.addEventListener('pointercancel',endDrag);
  svg.addEventListener('wheel',ev=>{
    if(!(ev.ctrlKey||ev.metaKey)) return;
    ev.preventDefault();
    const r=svg.getBoundingClientRect();
    zoomAt(ev.clientX-r.left,ev.clientY-r.top,ev.deltaY<0?1.12:1/1.12);
  },{passive:false});
  svg.addEventListener('dblclick',ev=>{
    const nn=ev.target.closest('[data-node]'); if(!nn) return;
    const f=$('[data-f="t"]',panel); if(f){f.focus();f.select();}
  });

  /* --- painel de propriedades --- */
  const optNodes=(sel,except)=>E.doc.nodes.filter(n=>n.id!==except).map(n=>`<option value="${esc(n.id)}"${n.id===sel?' selected':''}>${esc(nodeName(n).slice(0,60))}</option>`).join('');
  const unitOpts=sel=>'<option value="">— nenhuma —</option>'+units().filter(u=>true).map(u=>`<option value="${esc(u.id)}"${u.id===sel?' selected':''}>${esc(u.nome||'(sem nome)')}</option>`).join('');
  const swatches=(cur,withAuto)=>`<div class="swatches">${withAuto?`<button class="sw auto" data-a="hue" data-h="" aria-pressed="${cur==null}" aria-label="Cor automática" title="Automática"></button>`:''}${HUES.map(h=>`<button class="sw" style="--h:${h}" data-a="hue" data-h="${h}" aria-pressed="${cur===h}" aria-label="Cor ${h}"></button>`).join('')}</div>`;
  function getField(n,f){
    if(kind==='org'){
      const d=orgDisp(n,units());
      if(f==='t') return d.t; if(f==='desc') return d.desc; if(f==='icone') return d.icone; if(f==='obs') return n.obs||''; if(f==='tipo') return n.tipo; if(f==='unitId') return n.unitId||'';
    }
    return n[f]==null?'':n[f];
  }
  function panelNodeFlow(n){
    const outs=E.doc.edges.filter(e=>e.from===n.id);
    const rows=outs.map(e=>`<div class="edge-row" data-eid="${esc(e.id)}"><select data-f="eto" aria-label="Segue para"><option value="">Escolha…</option>${optNodes(e.to,n.id)}</select><input data-f="el" placeholder="Rótulo (ex.: Sim)" aria-label="Rótulo da saída" value="${esc(e.l)}"><button class="ibtn danger" data-a="edge-del" aria-label="Remover saída">${icon('x',14)}</button></div>`).join('');
    const hasSim=outs.some(e=>/^sim/i.test(e.l)),hasNao=outs.some(e=>/^n[ãa]o/i.test(e.l));
    return `<h3>Elemento</h3>
      <label class="fld"><span>Tipo</span><select data-f="tipo">${Object.keys(TIPOS_FLUXO).map(k=>`<option value="${k}"${k===n.tipo?' selected':''}>${esc(TIPOS_FLUXO[k])}</option>`).join('')}</select></label>
      <label class="fld"><span>Título</span><textarea rows="2" data-f="t">${esc(n.t)}</textarea></label>
      <label class="fld"><span>Descrição</span><textarea rows="2" data-f="desc">${esc(n.desc)}</textarea></label>
      <div class="r2"><label class="fld"><span>Unidade</span><select data-f="unit">${unitOpts(n.unit)}</select></label>
      <label class="fld"><span>Responsável pela etapa</span><input data-f="resp" value="${esc(n.resp)}" placeholder="Cargo ou função"></label></div>
      <div class="r2"><label class="fld"><span>Prazo</span><input data-f="prazo" value="${esc(n.prazo)}" placeholder="A definir"></label>
      <label class="fld"><span>Status</span><select data-f="status">${STATUS.map(s=>`<option value="${esc(s)}"${s===n.status?' selected':''}>${esc(s||'— não definido —')}</option>`).join('')}</select></label></div>
      <label class="fld"><span>Documentos necessários</span><textarea rows="2" data-f="docs">${esc(n.docs)}</textarea></label>
      <label class="fld"><span>Observações</span><textarea rows="2" data-f="obs">${esc(n.obs)}</textarea></label>
      <div class="fld"><span>Cor</span>${swatches(n.hue==null?null:n.hue,true)}</div>
      <div class="fld"><span>Saídas (para onde o fluxo segue)</span><div class="list">${rows||'<p class="hint">Nenhuma saída. Arraste a seta do elemento até outro ou use os botões abaixo.</p>'}</div>
        <div class="row" style="margin-top:6px"><button class="btn sm" data-a="edge-add" data-l="">+ Saída</button>${n.tipo==='dec'?`<button class="btn sm" data-a="edge-add" data-l="Sim"${hasSim?' disabled':''}>+ SIM</button><button class="btn sm" data-a="edge-add" data-l="Não"${hasNao?' disabled':''}>+ NÃO</button>`:''}</div></div>
      <details><summary class="hint" style="cursor:pointer">Ramificações em paralelo</summary>
        <p class="hint" style="margin:6px 0">Cria uma etapa por linha, saindo deste elemento e seguindo para o mesmo destino. Reorganiza o diagrama.</p>
        <textarea rows="5" data-f="branches">${esc(E.branchText)}</textarea><button class="btn sm" data-a="branch" style="margin-top:6px">Criar ramificações</button></details>
      <div class="row"><button class="btn sm" data-a="dup">Duplicar</button><button class="btn sm danger" data-a="del">Excluir elemento</button></div>`;
  }
  function panelNodeOrg(n){
    const d=orgDisp(n,units());
    const parent=E.doc.edges.find(e=>e.to===n.id);
    return `<h3>Unidade no organograma</h3>
      <label class="fld"><span>Tipo</span><select data-f="tipo">${Object.keys(TIPOS_ORG).map(k=>`<option value="${k}"${k===n.tipo?' selected':''}>${esc(TIPOS_ORG[k])}</option>`).join('')}</select></label>
      <label class="fld"><span>Nome</span><textarea rows="2" data-f="t">${esc(d.t)}</textarea></label>
      <label class="fld"><span>Descrição</span><textarea rows="3" data-f="desc">${esc(d.desc)}</textarea></label>
      <label class="fld"><span>Cadastro de competências vinculado</span><select data-f="unitId">${unitOpts(n.unitId)}</select></label>
      <label class="fld"><span>Subordinada a</span><select data-f="parent"><option value="">— nenhuma (topo) —</option>${optNodes(parent?parent.from:'',n.id)}</select></label>
      <label class="fld"><span>Ícone</span><select data-f="icone">${Object.keys(UNIT_ICONS).map(k=>`<option value="${k}"${k===d.icone?' selected':''}>${esc(UNIT_ICONS[k])}</option>`).join('')}</select></label>
      <div class="fld"><span>Cor</span>${swatches(d.hue,false)}</div>
      <label class="fld"><span>Observações</span><textarea rows="3" data-f="obs">${esc(n.obs||'')}</textarea></label>
      ${n.tipo==='nucleo'?'<p class="hint">Divisão interna de trabalho: não cria cargos automaticamente.</p>':''}
      <div class="row"><button class="btn sm" data-a="child">+ Subordinada</button><button class="btn sm" data-a="dup">Duplicar</button><button class="btn sm danger" data-a="del">Remover do organograma</button></div>`;
  }
  function panelEdge(e){
    const a=node(e.from),b=node(e.to);
    return `<h3>Conexão</h3>
      <p class="hint">${esc(a?nodeName(a):'?')} → ${esc(b?nodeName(b):'?')}</p>
      ${kind==='flow'?`<label class="fld"><span>Rótulo</span><input data-f="elabel" value="${esc(e.l)}" placeholder="Ex.: Sim, Não"></label>
      <div class="row"><button class="btn sm" data-a="elabel-set" data-l="Sim">SIM</button><button class="btn sm" data-a="elabel-set" data-l="Não">NÃO</button><button class="btn sm" data-a="elabel-set" data-l="">Sem rótulo</button></div>`:''}
      <label class="fld"><span>Origem</span><select data-f="efrom">${optNodes(e.from,'')}</select></label>
      <label class="fld"><span>Destino</span><select data-f="eto2">${optNodes(e.to,'')}</select></label>
      <div class="row"><button class="btn sm" data-a="erev">Inverter direção</button><button class="btn sm danger" data-a="del">${kind==='org'?'Desconectar':'Excluir conexão'}</button></div>`;
  }
  function renderPanel(){
    renderPanelBody();
    panel.classList.toggle('has-sel',!!E.sel);
    if(E.sel) panel.insertAdjacentHTML('afterbegin','<button class="btn sm ed-sheet-close" data-a="deselect" type="button">Fechar</button>');
  }
  function renderPanelBody(){
    const s=E.sel;
    if(s&&s.k==='n'&&node(s.id)){panel.innerHTML=kind==='org'?panelNodeOrg(node(s.id)):panelNodeFlow(node(s.id));return;}
    if(s&&s.k==='e'){const e=E.doc.edges.find(x=>x.id===s.id);if(e){panel.innerHTML=panelEdge(e);return;}}
    panel.innerHTML=`<h3>${kind==='org'?'Organograma':'Fluxograma'}</h3>
      <p class="hint">${kind==='org'?'Clique numa unidade para editar nome, descrição, cor, observações e hierarquia.':'Clique num elemento do diagrama para editar texto, unidade, responsável, prazo, documentos, status e saídas.'}</p>
      <ul class="hint" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
        <li>Arraste um elemento para mover.</li>
        <li>Com um elemento selecionado, use a seta azul para ligar a outro.</li>
        <li>${kind==='org'?'Um botão "Adicionar" cria a unidade já subordinada à selecionada.':'Um botão "Adicionar" cria o elemento já ligado ao selecionado.'}</li>
        <li>Delete exclui; Ctrl+Z desfaz; Ctrl+Y refaz.</li>
      </ul>`;
  }

  /* --- tabela de etapas (fluxos) --- */
  function renderTable(){
    if(kind!=='flow') return;
    const rows=E.doc.nodes.map((n,i)=>`<tr data-nid="${esc(n.id)}"${E.sel&&E.sel.k==='n'&&E.sel.id===n.id?' class="selrow"':''}>
      <td class="num">${i+1}</td>
      <td style="min-width:200px"><input data-f="t" data-nid="${esc(n.id)}" value="${esc(oneLine(n.t))}" aria-label="Título"></td>
      <td><select data-f="tipo" data-nid="${esc(n.id)}" aria-label="Tipo">${Object.keys(TIPOS_FLUXO).map(k=>`<option value="${k}"${k===n.tipo?' selected':''}>${esc(TIPOS_FLUXO[k])}</option>`).join('')}</select></td>
      <td style="min-width:170px"><select data-f="unit" data-nid="${esc(n.id)}" aria-label="Unidade">${unitOpts(n.unit)}</select></td>
      <td><input data-f="resp" data-nid="${esc(n.id)}" value="${esc(n.resp)}" aria-label="Responsável"></td>
      <td><input data-f="prazo" data-nid="${esc(n.id)}" value="${esc(n.prazo)}" placeholder="A definir" aria-label="Prazo"></td>
      <td><select data-f="status" data-nid="${esc(n.id)}" aria-label="Status">${STATUS.map(s=>`<option value="${esc(s)}"${s===n.status?' selected':''}>${esc(s||'—')}</option>`).join('')}</select></td></tr>`).join('');
    tableEl.innerHTML=`<div class="ch"><h2>Etapas do fluxo</h2><span class="hint">Edite responsável, prazo, unidade e status diretamente aqui. Clique na linha para selecionar no diagrama.</span></div>
      <div class="scroll"><table><thead><tr><th class="num">#</th><th>Etapa</th><th>Tipo</th><th>Unidade</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Sem elementos.</td></tr>'}</tbody></table></div>`;
  }
  function markTable(){
    if(kind!=='flow') return;
    $$('tr[data-nid]',tableEl).forEach(r=>r.classList.toggle('selrow',!!(E.sel&&E.sel.k==='n'&&E.sel.id===r.dataset.nid)));
  }

  /* --- alterar campos --- */
  function setField(n,f,v,src){
    if(kind==='org'){
      const u=n.unitId&&units().find(x=>x.id===n.unitId);
      if(f==='t'){if(u) u.nome=v; else n.t=v;}
      else if(f==='desc'){if(u) u.desc=v; else n.desc=v;}
      else if(f==='icone'){if(u) u.icone=v; else n.icone=v;}
      else if(f==='obs') n.obs=v;
      else if(f==='tipo'){n.tipo=v;if(u) u.divisao=(v==='nucleo');}
      else if(f==='unitId'){
        if(!v&&u){n.t=u.nome;n.desc=u.desc;n.hue=u.hue;n.icone=u.icone;}
        n.unitId=v;
      }
    }else n[f]=v;
    scene();
    if(f==='tipo'||f==='unit'||f==='unitId'||f==='unit'){renderPanel();renderTable();}
    else{
      if(src!=='panel'&&E.sel&&E.sel.id===n.id){$$('[data-f]',panel).forEach(el=>{if(el!==document.activeElement&&el.dataset.f===f&&el.tagName!=='SELECT') el.value=getField(n,f);});}
      if(src!=='table'&&kind==='flow'){const inp=$(`input[data-nid="${n.id}"][data-f="${f}"]`,tableEl);if(inp&&inp!==document.activeElement) inp.value=f==='t'?oneLine(n[f]):n[f];}
    }
    commitSoon(); touch();
  }
  function setParent(n,pid){
    if(pid){
      if(isDesc(n.id,pid)){toast('Essa mudança criaria um ciclo na hierarquia.');renderPanel();return;}
    }
    E.doc.edges=E.doc.edges.filter(e=>e.to!==n.id);
    if(pid) E.doc.edges.push({id:uid('e'),from:pid,to:n.id,l:''});
    commit(); touch(); scene();
  }
  function branch(n){
    const names=E.branchText.split(/\r?\n/).map(oneLine).filter(Boolean);
    if(!names.length){toast('Informe pelo menos um nome por linha.');return;}
    const outs=E.doc.edges.filter(e=>e.from===n.id);
    E.doc.edges=E.doc.edges.filter(e=>e.from!==n.id);
    names.forEach(nm=>{
      const b=nd(uid('n'),'proc',nm,n.unit||'');
      E.doc.nodes.push(b);
      E.doc.edges.push({id:uid('e'),from:n.id,to:b.id,l:''});
      outs.forEach(o=>E.doc.edges.push({id:uid('e'),from:b.id,to:o.to,l:''}));
    });
    autoLayout(E.doc,kind,units()); commit(); touch(); fit(); scene(); renderPanel(); renderTable();
    toast(names.length+' ramificações criadas. Use Desfazer (Ctrl+Z) para voltar.');
  }

  /* --- eventos do painel, tabela e barra --- */
  host.addEventListener('pointerdown',()=>{activeEd=E;},true);
  host.addEventListener('click',ev=>{
    const row=ev.target.closest('tr[data-nid]');
    if(row&&!ev.target.closest('input,select,button')){select('n',row.dataset.nid);return;}
    if(row&&ev.target.closest('input,select')&&!(E.sel&&E.sel.id===row.dataset.nid)){select('n',row.dataset.nid);}
    const b=ev.target.closest('[data-a]'); if(!b||!host.contains(b)) return;
    const a=b.dataset.a,n=E.sel&&E.sel.k==='n'?node(E.sel.id):null;
    switch(a){
      case 'add': addNode(b.dataset.t); break;
      case 'undo': if(E.hist.i>0) restore(E.hist.i-1); break;
      case 'redo': if(E.hist.i<E.hist.stack.length-1) restore(E.hist.i+1); break;
      case 'layout': relayout(); break;
      case 'zin': zoomAt((svg.clientWidth||800)/2,(svg.clientHeight||500)/2,1.2); break;
      case 'zout': zoomAt((svg.clientWidth||800)/2,(svg.clientHeight||500)/2,1/1.2); break;
      case 'fit': E.touched=false; fit(); break;
      case 'png': case 'svg': case 'pdf': doExport(a); break;
      case 'print': doPrint(); break;
      case 'deselect': select(null); break;
      case 'del': delSel(); break;
      case 'dup': if(n){
          const c=clone(n); c.id=uid(kind==='org'?'o':'n'); c.x=(n.x||0)+30; c.y=(n.y||0)+30;
          if(kind==='org'){const d=orgDisp(n,units());c.unitId='';c.t=d.t+' (cópia)';c.desc=d.desc;c.hue=d.hue;c.icone=d.icone;}
          E.doc.nodes.push(c); commit(); touch(); select('n',c.id); renderTable();
        } break;
      case 'child': if(n){
          const u={id:uid('u-'),nome:'Nova unidade',sigla:'',icone:'users',hue:HUES[state.units.length%HUES.length],page:'',externa:false,divisao:false,desc:'',obs:'',comp:[]};
          state.units.push(u);
          const c={id:uid('o'),tipo:'unidade',t:'',desc:'',unitId:u.id,hue:null,icone:'',obs:'',x:0,y:0};
          const sz=sizeOf(c),ss=sizeOf(n); c.x=snap((n.x||0)+(ss.w-sz.w)/2); c.y=snap((n.y||0)+ss.h+70);
          freeSpot(c,sz); E.doc.nodes.push(c); E.doc.edges.push({id:uid('e'),from:n.id,to:c.id,l:''});
          commit(); touch(); select('n',c.id);
          const f=$('[data-f="t"]',panel); if(f){f.focus();f.select();}
        } break;
      case 'hue': if(n){
          const h=b.dataset.h===''?null:Number(b.dataset.h);
          if(kind==='org'){const u=n.unitId&&units().find(x=>x.id===n.unitId);if(u) u.hue=h==null?u.hue:h;else n.hue=h;}
          else n.hue=h;
          commit(); touch(); scene(); renderPanel();
        } break;
      case 'edge-add': if(n){
          const l=b.dataset.l||defaultLabel(n);
          E.doc.edges.push({id:uid('e'),from:n.id,to:'',l});
          renderPanel(); touch();
        } break;
      case 'edge-del': {
          const id=b.closest('[data-eid]').dataset.eid;
          E.doc.edges=E.doc.edges.filter(e=>e.id!==id); commit(); touch(); scene(); renderPanel();
        } break;
      case 'elabel-set': { const e=E.doc.edges.find(x=>x.id===E.sel.id); if(e){e.l=b.dataset.l;commit();touch();scene();renderPanel();} } break;
      case 'erev': { const e=E.doc.edges.find(x=>x.id===E.sel.id); if(e){const t=e.from;e.from=e.to;e.to=t;commit();touch();scene();renderPanel();} } break;
      case 'branch': if(n) branch(n); break;
    }
  });
  const onField=(ev,final)=>{
    const t=ev.target,f=t.dataset&&t.dataset.f; if(!f) return;
    const inTable=!!t.closest('.ed-table');
    if(inTable){
      const n=node(t.dataset.nid); if(!n) return;
      if(!(E.sel&&E.sel.id===n.id)){E.sel={k:'n',id:n.id};renderPanel();markTable();}
      setField(n,f,t.value,'table'); return;
    }
    const eRow=t.closest('[data-eid]');
    if(eRow&&(f==='eto'||f==='el')){
      const e=E.doc.edges.find(x=>x.id===eRow.dataset.eid); if(!e) return;
      if(f==='eto'){e.to=t.value;if(final){commit();}} else e.l=t.value;
      scene(); commitSoon(); touch(); return;
    }
    if(f==='branches'){E.branchText=t.value;return;}
    if(E.sel&&E.sel.k==='e'){
      const e=E.doc.edges.find(x=>x.id===E.sel.id); if(!e) return;
      if(f==='elabel') e.l=t.value; else if(f==='efrom') e.from=t.value; else if(f==='eto2') e.to=t.value; else return;
      if(e.from===e.to){toast('Origem e destino devem ser diferentes.');return;}
      scene(); commitSoon(); touch(); return;
    }
    const n=E.sel&&E.sel.k==='n'?node(E.sel.id):null; if(!n) return;
    if(f==='parent'){setParent(n,t.value);return;}
    setField(n,f,t.value,'panel');
  };
  host.addEventListener('input',ev=>{if(ev.target.tagName==='SELECT') return; onField(ev,false);});
  host.addEventListener('change',ev=>{if(ev.target.tagName==='SELECT') onField(ev,true);});

  /* --- exportação --- */
  const title=()=>cfg.title();
  async function doExport(fmt){
    const sc=sceneStandalone(E.doc,kind,SP.light,{units:units(),title:title(),mid:'xp'});
    const base=slug(title());
    if(fmt==='svg') return saveFile(base+'.svg','<?xml version="1.0" encoding="UTF-8"?>\n'+sc.svg,'image/svg+xml');
    try{
      const canvas=await svgToCanvas(sc.svg,sc.w,sc.h,2);
      if(fmt==='png') return saveFile(base+'.png',await canvasBytes(canvas,'image/png'),'image/png');
      const jpg=await canvasBytes(canvas,'image/jpeg',0.92);
      const land=sc.w>=sc.h,W=land?842:595,H=land?595:842,m=28;
      const pdf=new PdfDoc({w:W,h:H,margin:m,footer:state.inst.nome+' · '+title()});
      const i=pdf.addImage(jpg,canvas.width,canvas.height);
      const s=Math.min((W-2*m)/sc.w,(H-2*m-14)/sc.h),dw=sc.w*s,dh=sc.h*s;
      pdf.drawImage(i,(W-dw)/2,H-m-dh,dw,dh);
      return saveFile(base+'.pdf',pdf.build(),'application/pdf');
    }catch(e){toast('Não foi possível gerar o arquivo. Tente exportar em SVG.');}
  }
  function doPrint(){
    const sc=sceneStandalone(E.doc,kind,SP.light,{units:units(),title:'',mid:'pp'});
    printHtml(title(),sc.svg);
  }

  /* --- inicialização --- */
  if(E.doc.nodes.some(n=>n.x==null||n.y==null)) autoLayout(E.doc,kind,units());
  commit(); renderPanel(); renderTable(); scene(); fit();
  E.api={
    del:delSel,select,
    undo(){if(E.hist.i>0) restore(E.hist.i-1);},
    redo(){if(E.hist.i<E.hist.stack.length-1) restore(E.hist.i+1);},
    resize(){if(!E.touched) fit();},
    theme(){scene();},
    rerender(){scene();renderPanel();renderTable();},
    destroy(){if(activeEd===E) activeEd=null;}
  };
  E.select=select;
  return E;
}

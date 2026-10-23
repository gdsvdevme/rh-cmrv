/* =====================================================================
   Volume para encadernação: capa, sumário, fluxogramas e manual em um só documento.
   Gera um documento HTML preparado para impressão (A4, margens espelhadas,
   numeração de páginas). O PDF sai da impressão do navegador ("Salvar como PDF").
   ===================================================================== */
const VOL_CSS=`/*VOLUME_CSS*/`;
const VOL_MOTIF='<svg class="motif" viewBox="0 0 400 400" fill="none" stroke="#fff" stroke-width="2.2"><rect x="150" y="20" width="100" height="46" rx="6"/><path d="M200 66v40M70 106h260M70 106v40M200 106v40M330 106v40"/><rect x="20" y="146" width="100" height="46" rx="6"/><rect x="150" y="146" width="100" height="46" rx="6"/><rect x="280" y="146" width="100" height="46" rx="6"/><path d="M70 192v40M200 192v40M330 192v40M30 232h80M160 232h80M290 232h80"/><rect x="20" y="232" width="100" height="46" rx="6"/><rect x="150" y="232" width="100" height="46" rx="6"/><rect x="280" y="232" width="100" height="46" rx="6"/></svg>';
const VOL_PW=172,VOL_PH=208,VOL_LW=259,VOL_LH=138;

function volFreeCut(ranges,target){
  const rs=ranges.slice().sort((a,b)=>a[0]-b[0]),m=[];
  rs.forEach(r=>{if(m.length&&r[0]<=m[m.length-1][1]) m[m.length-1][1]=Math.max(m[m.length-1][1],r[1]); else m.push([r[0],r[1]]);});
  const gaps=[];for(let i=0;i<m.length-1;i++) gaps.push((m[i][1]+m[i+1][0])/2);
  if(!gaps.length) return target;
  return gaps.reduce((a,g)=>Math.abs(g-target)<Math.abs(a-target)?g:a,gaps[0]);
}
function volPlan(d){
  let best=null;
  [[false,VOL_PW,VOL_PH],[true,VOL_LW,VOL_LH]].forEach(([rot,aw,ah])=>{
    for(let P=1;P<=3;P++) for(let K=1;K<=3;K++){
      const S=P*K; if(S>4) continue;
      const colw=(aw-6*(K-1))/K, s=Math.min(colw/d.w,ah/(d.h/S));
      const score=Math.min(s,0.30)-0.02*(P-1)-0.01*(K-1);
      if(!best||score>best.score) best={score,s,rot,P,K};
    }
  });
  const S=best.P*best.K, cuts=[0];
  for(let i=1;i<S;i++) cuts.push(volFreeCut(d.ranges,d.h*i/S));
  cuts.push(d.h);
  return {scale:best.s,rot:best.rot,P:best.P,K:best.K,cuts};
}
function volStrip(d,y0,y1,wmm,hmm){
  const h=y1-y0;
  let s=d.svg.replace(/<svg ([^>]*?)width="\d+" height="\d+" viewBox="[^"]*"/,(m,a)=>`<svg ${a}width="${wmm.toFixed(2)}mm" height="${hmm.toFixed(2)}mm" viewBox="0 ${y0.toFixed(1)} ${d.w} ${h.toFixed(1)}"`);
  return s.replace('<rect width="100%" height="100%"',`<rect x="0" y="${y0.toFixed(1)}" width="${d.w}" height="${h.toFixed(1)}"`);
}
function volFigPages(i,d){
  const pl=d.plan,S=pl.P*pl.K,out=[];
  for(let pi=0;pi<pl.P;pi++){
    let cols='';
    for(let ki=0;ki<pl.K;ki++){
      const si=pi*pl.K+ki,y0=pl.cuts[si],y1=pl.cuts[si+1];
      cols+=`<div class="col">${volStrip(d,y0,y1,d.w*pl.scale,(y1-y0)*pl.scale)}${si<S-1?'<div class="cont">continua na página seguinte ›</div>':''}</div>`;
    }
    const head=pi===0?`<div class="fh"><div class="kick" id="f${i}">Fluxograma ${i+1}</div><h2>${esc(d.t)}</h2><div class="sub">${esc(d.page)}${d.desc?' · '+esc(d.desc):''}</div></div>`:'';
    out.push(`<section class="fpg${pl.rot?' land':''}">${head}<div class="figs" style="gap:6mm">${cols}</div></section>`);
  }
  return out;
}
function volData(st){
  const pal=SP.light,out=[];
  const add=(t,page,desc,doc,kind,mid)=>{
    const sc=sceneStandalone(doc,kind,pal,{units:st.units,title:'',mid});
    const bb=sceneBBox(doc,kind,st.units);
    const ranges=doc.nodes.map(n=>{const s=nodeSize(n,kind,st.units),y=(n.y||0)-bb.y+36;return [y,y+s.h];});
    const d={t,page,desc,svg:sc.svg,w:sc.w,h:sc.h,ranges};d.plan=volPlan(d);out.push(d);
  };
  add('Organograma do RH','Organograma','Estrutura do Departamento de Recursos Humanos.',st.org,'org','vo');
  Object.keys(PAGES_FLOW).forEach(k=>st.flows.filter(f=>f.page===k).forEach(f=>add(f.nome,PAGES_FLOW[k],f.desc||'',f,'flow','vf'+out.length)));
  const ld={nodes:Object.keys(TIPOS_FLUXO).map((k,i)=>nd('l'+i,k,TIPOS_FLUXO[k],'',{x:(i%4)*275,y:Math.floor(i/4)*115})),edges:[]};
  const ru=st.units.filter(u=>!u.externa);
  const ud={nodes:ru.map((u,i)=>nd('u'+i,'proc',u.nome,u.id,{x:(i%3)*290,y:Math.floor(i/3)*95})),edges:[]};
  return {figs:out,leg1:sceneStandalone(ld,'flow',pal,{units:st.units,title:'',mid:'vl1'}).svg,leg2:sceneStandalone(ud,'flow',pal,{units:st.units,title:'',mid:'vl2'}).svg};
}
function volumeHtml(st){
  const D=volData(st),inst=st.inst,man=st.manual;
  const data=new Date().toLocaleDateString('pt-BR');
  const figs=D.figs.map((d,i)=>volFigPages(i,d).join('')).join('');
  const toc1=D.figs.map((d,i)=>`<li><a href="#f${i}"><span class="n">${i+1}</span><span class="tt">${esc(d.t)}<small>${esc(d.page)}</small></span><span class="d"></span><span class="pn" data-pg="f${i}"></span></a></li>`).join('');
  const toc2=man.map((c,i)=>`<li><a href="#c${i}"><span class="n">${i+1}</span><span class="tt">${esc(c.titulo)}</span><span class="d"></span><span class="pn" data-pg="c${i}"></span></a></li>`).join('');
  const chaps=man.map((c,i)=>`<section class="chap" id="c${i}"><div class="ck">Capítulo ${i+1}</div><h2>${esc(c.titulo)}</h2><div class="rulegold"></div>${richHtml(c.texto)}</section>`).join('');
  const figPages=D.figs.map(d=>d.plan.P);
  const script=`
(function(){
  var figP=${JSON.stringify(figPages)};
  function setPg(k,n){var e=document.querySelector('[data-pg="'+k+'"]');if(e) e.textContent=n;}
  function measure(){
    var chs=document.querySelectorAll('section.chap'),cur=5;
    figP.forEach(function(p,i){setPg('f'+i,cur);cur+=p;});
    cur+=1;
    chs.forEach(function(c,i){
      var m=document.createElement('div');m.className='chap';
      m.style.cssText='position:absolute;left:-99999px;top:0;width:172mm;height:251mm;column-width:172mm;column-gap:0;column-fill:auto;padding:0;margin:0;box-shadow:none;min-height:0;overflow:visible';
      m.innerHTML=c.innerHTML;document.body.appendChild(m);
      var pages=Math.max(1,Math.round(m.scrollWidth/m.clientWidth));
      document.body.removeChild(m);setPg('c'+i,cur);cur+=pages;
    });
  }
  function run(){try{measure();}catch(e){}}
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(run); else run();
  window.addEventListener('beforeprint',run);
  document.getElementById('printBtn').addEventListener('click',function(){window.print();});
})();`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(inst.nome)} — Fluxogramas e Manual de Procedimentos</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@600;700&display=swap">
<style>${VOL_CSS}</style></head><body>
<div class="vbar"><button id="printBtn" type="button">Imprimir / Salvar como PDF</button><span>Dica: use o Google Chrome ou o Edge, tamanho A4, margens “Nenhuma” ou “Padrão” e marque “Gráficos de plano de fundo”.</span></div>
<section class="cover">${VOL_MOTIF}<div class="in"><div class="org">${esc(inst.orgao)}</div><div class="rule"></div><h1>Fluxogramas e Manual de Procedimentos</h1><p>Departamento de Recursos Humanos</p><p style="margin-top:3mm;font-size:11pt;opacity:.75">${esc(inst.sub)}</p></div><div class="foot"><span>${esc(inst.nome)}</span><span>Edição de ${data}</span></div></section>
<section class="pg toc"><h2 class="t">Sumário</h2><div class="rulegold"></div>
<h3 style="margin-top:2mm">Parte 1 · Fluxogramas</h3><ol>${toc1}</ol>
<h3>Parte 2 · Manual de procedimentos</h3><ol>${toc2}</ol></section>
<section class="pg"><h2 class="t">Sobre este material</h2><div class="rulegold"></div>
<p class="lead">Reúne, em um só volume, os fluxogramas que descrevem o funcionamento do Departamento de Recursos Humanos e o manual de procedimentos administrativos correspondente.</p>
<div class="about">
<div class="card"><h4>Como ler os fluxogramas</h4><p>Cada fluxograma segue de cima para baixo, do início ao encerramento. Os losangos são decisões, com saídas rotuladas (por exemplo, Sim e Não). A cor de cada etapa indica a unidade responsável. Diagramas extensos foram divididos em páginas, indicadas por "continua". Alguns diagramas largos ocupam páginas na horizontal.</p></div>
<div><div class="legtitle">Símbolos</div><div class="leg">${D.leg1}</div><div class="legtitle">Unidades responsáveis (cores)</div><div class="leg">${D.leg2}</div></div>
</div></section>
<section class="part p1"><div class="num">1</div><div class="in"><div class="rule"></div><h1>Fluxogramas</h1><p>Organograma e fluxos de trabalho do Departamento de Recursos Humanos.</p></div></section>
${figs}
<section class="part m"><div class="num">2</div><div class="in"><div class="rule"></div><h1>Manual de Procedimentos Administrativos</h1><p>Competências, procedimentos, responsabilidades e indicadores do Departamento.</p></div></section>
${chaps}
<section class="closing"><div style="margin-top:80mm;text-align:center;color:#4f665a;font-size:9pt;max-width:120mm;margin-left:auto;margin-right:auto"><div class="rulegold" style="margin:0 auto 5mm"></div>${esc(LEGAL)}</div></section>
<script>${script}<\/script></body></html>`;
}
async function gerarVolume(){
  toast('Preparando o volume…');
  await new Promise(r=>setTimeout(r,30));
  let html;
  try{html=volumeHtml(state);}catch(e){toast('Não foi possível montar o volume.');return;}
  const nome='volume-fluxogramas-e-manual-rh.html';
  if(window.claude){
    // visualização restrita: entrega o arquivo para abrir no navegador e salvar como PDF
    const ok=await saveFile(nome,html,'text/html');
    if(ok) toast('Arquivo salvo. Abra-o no Chrome e use "Imprimir / Salvar como PDF".');
    return;
  }
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  const w=window.open(url,'_blank');
  if(!w){await saveFile(nome,html,'text/html');toast('Arquivo salvo. Abra-o no navegador e use "Imprimir / Salvar como PDF".');}
  else setTimeout(()=>URL.revokeObjectURL(url),120000);
}

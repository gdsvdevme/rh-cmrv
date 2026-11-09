/* ---------- PDF de saída ---------- */
const wa=s=>String(s==null?'':s).replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'?');
function ordemPaginas(g){return g.entradas.flatMap(e=>e.pag);}
async function gerar(lista,ctx){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const src=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false});
  const out=await PDFDocument.create();
  const fn=await out.embedFont(StandardFonts.Helvetica),fb=await out.embedFont(StandardFonts.HelveticaBold);
  const sl=stampAtual(),emb=sl.src.startsWith('data:image/jpeg')?await out.embedJpg(sl.src):await out.embedPng(sl.src);
  const ratio=emb.height/emb.width,fundo=$('#optFundo').checked,capas=$('#optCapas').checked;
  const total=lista.reduce((s,g)=>s+g.entradas.reduce((t,e)=>t+e.pag.length,0),0);let feitas=0;
  for(const g of lista){
    const idx=ordemPaginas(g),base=src.getPage(idx[0]).getSize();
    /* capa: página em branco só com o nome da hierarquia, centralizado */
    if(capas){
      const W=base.width,H=base.height,pg=out.addPage([W,H]),mx=60;
      let fs=30,linhas;
      const quebrar=sz=>{const ps=wa(g.nome).split(' '),L=[];let l='';
        ps.forEach(w=>{const t=l?l+' '+w:w;if(fb.widthOfTextAtSize(t,sz)>W-2*mx&&l){L.push(l);l=w;}else l=t;});
        if(l) L.push(l);return L;};
      linhas=quebrar(fs);
      while(linhas.some(l=>fb.widthOfTextAtSize(l,fs)>W-2*mx)&&fs>14){fs--;linhas=quebrar(fs);}
      const lh=fs*1.3,y0=H/2+(linhas.length*lh)/2-fs*.85;
      linhas.forEach((l,k)=>pg.drawText(l,{x:(W-fb.widthOfTextAtSize(l,fs))/2,y:y0-k*lh,size:fs,font:fb,color:rgb(0,0,0)}));
    }
    for(let a=0;a<idx.length;a+=40){
      const lote=idx.slice(a,a+40),cps=await out.copyPages(src,lote);
      cps.forEach((pg,k)=>{
        const pi=lote[k],o=over.get(pi);out.addPage(pg);
        const e=porPag[pi];
        if(o==='skip') return;
        const p=o||pos,{width:W,height:H}=pg.getSize(),w=p.w*W,h=w*ratio;
        if(fundo) pg.drawRectangle({x:p.x*W,y:H-p.y*H-h,width:w,height:h,color:rgb(1,1,1)});
        pg.drawImage(emb,{x:p.x*W,y:H-p.y*H-h,width:w,height:h});
      });
      feitas+=lote.length;
      ctx.p(feitas/total);await pausa();
    }
  }
  out.setTitle(nomeArq+' (carimbado)');out.setProducer('RH Câmara Rio Verde');
  return out.save();
}
function baixarBlob(by,nome){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([by],{type:'application/pdf'}));a.download=nome;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
}
const nomeSeguro=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'grupo';
async function baixar(k){
  if(!pdfDoc) return;
  const todos=grupos(),lista=k?todos.filter(g=>g.k===k):todos;
  if(!lista.length) return;
  carga(true,'Carimbando…','Montando o PDF',0);
  try{
    const by=await gerar(lista,{p:v=>carga(true,null,'Carimbando e organizando páginas… '+Math.round(v*100)+'%',v)});
    carga(true,null,'Salvando…',1);
    baixarBlob(by,k?nomeSeguro(nomeArq)+'-'+nomeSeguro(lista[0].nome)+'.pdf':nomeSeguro(nomeArq)+'-carimbado.pdf');
    carga(false);toast('PDF pronto: '+lista.reduce((s,g)=>s+ordemPaginas(g).length,0)+' páginas carimbadas.');
  }catch(e){carga(false);console.error(e);toast('Não foi possível gerar o PDF: '+(e&&e.message||e));}
}
$('#saveAll').addEventListener('click',()=>baixar(null));
$('#optFundo').addEventListener('change',()=>{if(pdfDoc) stampUi();guardar();});
$('#optCapas').addEventListener('change',guardar);

/* ---------- anexar ---------- */
const drop=$('#drop');
$('#file').addEventListener('change',ev=>{const f=ev.target.files[0];ev.target.value='';abrirPdf(f);});
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,ev=>{ev.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,ev=>{ev.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',ev=>{const f=ev.dataTransfer.files[0];if(f) abrirPdf(f);});
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',themeBtn);new MutationObserver(themeBtn).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }catch(e){}



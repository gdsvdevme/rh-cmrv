/* =====================================================================
   Exportações: arquivos, PDF (gerado aqui, sem bibliotecas), CSV, Excel, impressão
   ===================================================================== */
async function saveFile(name,data,mime){
  if(window.claude&&!window.__dl){toast('A exportação não está disponível nesta visualização.');return false;}
  if(window.__dl){
    try{await window.__dl.save({filename:name,data});return true;}
    catch(e){if(!e||e.code!=='declined') toast('Não foi possível salvar o arquivo.');return false;}
  }
  const blob=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  return true;
}

/* ---------- CSV e Excel ---------- */
function toCsv(rows){
  const q=v=>{v=String(v==null?'':v);return /[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  return '﻿'+rows.map(r=>r.map(q).join(';')).join('\r\n');
}
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>window.XLSX?res(window.XLSX):rej(new Error('xlsx'));
    s.onerror=()=>rej(new Error('xlsx'));
    document.head.appendChild(s);
  });
}
async function exportXlsx(filename,sheets){
  try{
    const X=await loadXlsx();
    const wb=X.utils.book_new();
    sheets.forEach(sh=>{
      const ws=X.utils.aoa_to_sheet(sh.rows);
      ws['!cols']=sh.rows[0].map((_,c)=>({wch:Math.min(60,Math.max(10,...sh.rows.map(r=>String(r[c]==null?'':r[c]).length)))}));
      X.utils.book_append_sheet(wb,ws,sh.name.slice(0,31));
    });
    const out=X.write(wb,{bookType:'xlsx',type:'array'});
    return saveFile(filename,new Uint8Array(out));
  }catch(e){
    toast('Não foi possível gerar o Excel agora. Use a exportação em CSV, que abre no Excel.');
    return false;
  }
}

/* ---------- PDF ---------- */
const HW=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WIN={0x2026:0x85,0x2013:0x96,0x2014:0x97,0x2022:0x95,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x20AC:0x80,0x2192:0x2D,0x2190:0x2D,0x2191:0x5E,0x2193:0x76,0x2212:0x2D};
function tw(str,size,bold){
  let w=0;
  for(const ch of String(str)){
    let c=ch.codePointAt(0);
    if(c<32||c>126){const b=ch.normalize('NFD').codePointAt(0);c=(b>=32&&b<=126)?b:0;}
    w+=c?HW[c-32]:556;
  }
  return w*size/1000*(bold?1.06:1);
}
function wrapPdf(str,maxW,size,bold){
  const out=[];
  String(str==null?'':str).split(/\r?\n/).forEach(par=>{
    const words=par.split(/\s+/).filter(Boolean);
    if(!words.length){out.push('');return;}
    let cur='';
    words.forEach(w=>{
      while(tw(w,size,bold)>maxW&&w.length>1){
        let k=w.length-1; while(k>1&&tw(w.slice(0,k),size,bold)>maxW) k--;
        if(cur){out.push(cur);cur='';}
        out.push(w.slice(0,k)); w=w.slice(k);
      }
      const t=cur?cur+' '+w:w;
      if(!cur||tw(t,size,bold)<=maxW) cur=t; else {out.push(cur);cur=w;}
    });
    if(cur) out.push(cur);
  });
  return out.length?out:[''];
}
class PdfDoc{
  constructor(o){
    o=o||{};
    this.W=o.w||595; this.H=o.h||842; this.m=o.margin||48; this.footer=o.footer||'';
    this.pages=[]; this.images=[]; this.newPage();
  }
  newPage(w,h){
    const p={w:w||this.W,h:h||this.H,ops:[],imgs:[]};
    this.pages.push(p); this.cur=p; this.y=p.h-this.m; return p;
  }
  _enc(s){
    let o='';
    for(const ch of String(s)){
      let c=ch.codePointAt(0);
      if(WIN[c]!==undefined) c=WIN[c]; else if(c>255) c=63;
      o+=String.fromCharCode(c);
    }
    return o.replace(/[\\()]/g,'\\$&');
  }
  text(s,x,y,size,bold,gray){
    this.cur.ops.push(`BT /${bold?'F2':'F1'} ${size||10} Tf ${gray==null?0:gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${this._enc(s)}) Tj ET`);
  }
  line(x1,y1,x2,y2,w,gray){
    this.cur.ops.push(`${gray==null?0.75:gray} G ${w||0.5} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  fillRect(x,y,w,h,gray){
    this.cur.ops.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  addImage(data,w,h){this.images.push({data,w,h});return this.images.length-1;}
  drawImage(i,x,y,w,h){
    if(this.cur.imgs.indexOf(i)<0) this.cur.imgs.push(i);
    this.cur.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q`);
  }
  ensure(h){if(this.y-h<this.m+10) this.newPage();}
  get width(){return this.cur.w-2*this.m;}
  h1(s){this.ensure(34);this.text(s,this.m,this.y-16,17,true,0.1);this.y-=30;}
  h2(s){this.ensure(30);this.y-=6;this.text(s,this.m,this.y-12,12.5,true,0.1);this.y-=22;}
  para(s,o){
    o=o||{}; const size=o.size||10.5,lh=size*1.38,ind=o.indent||0;
    wrapPdf(s,this.width-ind,size,false).forEach(l=>{this.ensure(lh);this.text(l,this.m+ind,this.y-size,size,false,o.gray);this.y-=lh;});
    this.y-=o.gap==null?4:o.gap;
  }
  bullet(s,o){
    o=o||{}; const size=10.5,lh=size*1.38,ind=14+(o.level||0)*14;
    const lines=wrapPdf(s,this.width-ind,size,false);
    lines.forEach((l,i)=>{this.ensure(lh);if(i===0) this.text(o.mark||'•',this.m+ind-11,this.y-size,size,false);this.text(l,this.m+ind,this.y-size,size,false);this.y-=lh;});
    this.y-=2;
  }
  gap(h){this.y-=h;}
  table(cols,rows,o){
    o=o||{}; const size=o.size||9,lh=size*1.3,pad=4,avail=this.width;
    const tot=cols.reduce((a,c)=>a+c.w,0); const xs=[];let acc=this.m;
    const ws=cols.map(c=>c.w/tot*avail); ws.forEach(w=>{xs.push(acc);acc+=w;});
    const head=()=>{
      this.ensure(lh+pad*2+4);
      this.fillRect(this.m,this.y-lh-pad*2,avail,lh+pad*2,0.9);
      cols.forEach((c,i)=>this.text(c.label,xs[i]+pad,this.y-pad-size,size,true,0.15));
      this.y-=lh+pad*2;
    };
    head();
    rows.forEach(r=>{
      const cells=r.map((v,i)=>wrapPdf(v,ws[i]-pad*2,size,false));
      const n=Math.max(1,...cells.map(c=>c.length)); const rh=n*lh+pad*2;
      if(this.y-rh<this.m+10){this.newPage();head();}
      cells.forEach((c,i)=>c.forEach((l,k)=>this.text(l,xs[i]+pad,this.y-pad-size-k*lh,size,false,0.1)));
      this.y-=rh; this.line(this.m,this.y,this.m+avail,this.y,0.5,0.8);
    });
    this.y-=8;
  }
  build(){
    const total=this.pages.length;
    this.pages.forEach((p,i)=>{
      this.cur=p;
      if(this.footer){this.text(this.footer,this.m,24,8,false,0.45);}
      const pg='Página '+(i+1)+' de '+total; this.text(pg,p.w-this.m-tw(pg,8,false),24,8,false,0.45);
    });
    const chunks=[];let off=0;const offs=[];
    const push=b=>{
      if(typeof b==='string'){const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i)&255;b=u;}
      chunks.push(b);off+=b.length;
    };
    const nImg=this.images.length, firstPage=5+nImg, nObj=4+nImg+total*2;
    const begin=n=>{offs[n]=off;push(n+' 0 obj\n');}, end=()=>push('\nendobj\n');
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    begin(1);push('<< /Type /Catalog /Pages 2 0 R >>');end();
    begin(2);push('<< /Type /Pages /Count '+total+' /Kids ['+this.pages.map((_,i)=>(firstPage+i*2)+' 0 R').join(' ')+'] >>');end();
    begin(3);push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');end();
    begin(4);push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');end();
    this.images.forEach((im,i)=>{
      begin(5+i);
      push('<< /Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.data.length+' >>\nstream\n');
      push(im.data);push('\nendstream');end();
    });
    this.pages.forEach((p,i)=>{
      const po=firstPage+i*2,co=po+1;
      const xo=p.imgs.map(k=>'/Im'+k+' '+(5+k)+' 0 R').join(' ');
      begin(po);
      push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+p.w+' '+p.h+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << '+xo+' >> >> /Contents '+co+' 0 R >>');end();
      const content=p.ops.join('\n');
      begin(co);push('<< /Length '+content.length+' >>\nstream\n');push(content);push('\nendstream');end();
    });
    const xref=off;
    push('xref\n0 '+(nObj+1)+'\n0000000000 65535 f \n');
    for(let n=1;n<=nObj;n++) push(String(offs[n]).padStart(10,'0')+' 00000 n \n');
    push('trailer\n<< /Size '+(nObj+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
    const out=new Uint8Array(off);let p=0;chunks.forEach(c=>{out.set(c,p);p+=c.length;});
    return out;
  }
}
/* Escreve texto simples do manual (linhas com "# ", "- " e "1. ") no PDF. */
function pdfRichText(pdf,text){
  String(text||'').split(/\r?\n/).forEach(line=>{
    if(!line.trim()){pdf.gap(5);return;}
    let m;
    if((m=/^#\s+(.*)/.exec(line))) {pdf.gap(4);pdf.ensure(24);pdf.text(m[1],pdf.m,pdf.y-11,11,true,0.15);pdf.y-=20;}
    else if((m=/^(\s*)[-*]\s+(.*)/.exec(line))) pdf.bullet(m[2],{level:Math.floor(m[1].length/2)});
    else if((m=/^(\d+)\.\s+(.*)/.exec(line))) pdf.bullet(m[2],{mark:m[1]+'.'});
    else pdf.para(line);
  });
}

/* ---------- imagem ---------- */
function svgToCanvas(svgStr,w,h,scale){
  return new Promise((res,rej)=>{
    const max=8000; scale=Math.min(scale,max/w,max/h);
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*scale)); c.height=Math.max(1,Math.round(h*scale));
      const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height); res(c);
    };
    img.onerror=()=>rej(new Error('img'));
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  });
}
function canvasBytes(canvas,type,q){
  return new Promise((res,rej)=>canvas.toBlob(b=>{
    if(!b) return rej(new Error('blob'));
    b.arrayBuffer().then(a=>res(new Uint8Array(a)),rej);
  },type,q));
}

/* ---------- impressão ---------- */
function printHtml(title,html){
  if(window.claude){toast('A impressão não está disponível nesta visualização. Exporte em PDF e imprima o arquivo.');return;}
  const sheet=$('#printSheet'); sheet.innerHTML=`<h2>${esc(title)}</h2>${html}`;
  document.body.classList.add('printing');
  const done=()=>{document.body.classList.remove('printing');sheet.innerHTML='';window.removeEventListener('afterprint',done);};
  window.addEventListener('afterprint',done);
  try{window.print();}catch(e){done();toast('Não foi possível abrir a impressão.');}
}

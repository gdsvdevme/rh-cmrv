/* ---------- telas: menu inicial, Carimbar (#carimbar) e Controle de devolução (#devolucao) ---------- */
const ICONES_ESP={
  carimbar:'<path d="M12 3a3 3 0 00-3 3c0 2 1 3 1 5H7a1 1 0 00-1 1v5h12v-5a1 1 0 00-1-1h-3c0-2 1-3 1-5a3 3 0 00-3-3z"/><path d="M5 21h14"/>',
  devolucao:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/>'
};
const TELAS_ESP={
  carimbar:{nome:'Carimbar',desc:'Carimbe os espelhos de ponto em PDF e organize pela hierarquia, com uma capa para cada setor ou gabinete.'},
  devolucao:{nome:'Controle de devolução',desc:'Acompanhe quais setores devolveram o espelho de ponto: devolvido ao RH, devolvido com pendências ou não devolvido, com observação.'}
};
function cartaoEsp(k,t){
  return `<a class="card2" href="#${k}"><span class="ic" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES_ESP[k]}</svg></span><b>${esc(t.nome)}</b><span class="d">${esc(t.desc)}</span><span class="go">Abrir<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></a>`;
}
function telaEsp(){
  const h=location.hash.replace('#',''),t=TELAS_ESP[h]?h:'';
  $('#menuEsp').hidden=!!t;$('#crumbEsp').hidden=!t;
  $('#abaCar').hidden=t!=='carimbar';$('#abaDev').hidden=t!=='devolucao';
  $('#mainEsp').classList.toggle('sub',!!t);
  if(!t){
    $('#menuEsp').innerHTML='<div class="intro"><h2>O que você quer fazer?</h2><p>Escolha uma opção.</p></div><div class="cards">'+Object.entries(TELAS_ESP).map(([k,v])=>cartaoEsp(k,v)).join('')+'</div>';
    return;
  }
  $('#crumbEsp').innerHTML='<a href="#">← Espelhos de ponto</a><h2>'+esc(TELAS_ESP[t].nome)+'</h2>';
  if(t==='devolucao') devDesenhar();else if(pdfDoc) mostrar(cur);
}
window.addEventListener('hashchange',()=>{telaEsp();window.scrollTo(0,0);});


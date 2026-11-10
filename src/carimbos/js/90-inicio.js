/* ---------- início ---------- */
(async function init(){
  themeBtn();stampsUi();telaEsp();
  try{aplicarConfig(JSON.parse(localStorage.getItem(LS)||'null'));}catch(e){}
  stampsUi();
  carga(true,'Carregando…','Conectando ao servidor',null);$('#ldB').style.width='30%';
  try{
    if(window.claude&&window.claude.use) dbh=await window.claude.use('db');
    if(!dbh) dbh=await PB.connect();
    if(dbh){
      const c=await dbh.doc('carimbos/config').get();
      if(c.exists){try{aplicarConfig(JSON.parse(c.data().json));}catch(e){}}
      const s=await dbh.doc('pessoal/dados').get();
      if(s.exists){try{const d=JSON.parse(s.data().json);if(d&&Array.isArray(d.pessoas)) pessoal=d;}catch(e){}}
    }
  }catch(e){dbh=null;}
  montarHierarquia();stampsUi();
  await devCarregar();devPronto=true;telaEsp();
  carga(false);
  if(!pessoal) toast('A hierarquia de pessoal ainda não está salva no servidor. Abra a Hierarquia de Pessoal e clique em Atualizar do Centi.');
})();

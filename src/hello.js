/* "Olá, Primeiro nome" — lê o nome do Centi guardado na sessão deste navegador */
(function(){
  function nome(){
    try{const a=JSON.parse(localStorage.getItem('rhcrv-pb-auth')||'null');const n=a&&a.centi&&(a.centi.nome||a.centi.user);
      if(!n) return '';const p=String(n).trim().split(/\s+/)[0];
      if(!p||/\d/.test(p)||/^[a-z]+\.[a-z]/i.test(p)) return '';
      return p.charAt(0).toLocaleUpperCase('pt-BR')+p.slice(1).toLocaleLowerCase('pt-BR');}catch(e){return '';}
  }
  function aplicar(){
    const n=nome();let el=document.getElementById('helloMod');
    if(!n){if(el) el.remove();return;}
    if(!el){
      const hero=document.querySelector('.hero h1'),top=document.querySelector('.side .brand');
      el=document.createElement(hero?'p':'div');el.id='helloMod';el.className='hello';
      el.innerHTML='<span class="wave" aria-hidden="true">👋</span><span></span>';
      if(hero) hero.parentNode.insertBefore(el,hero);
      else if(top) top.insertAdjacentElement('afterend',el);
      else return;
    }
    el.lastChild.textContent='Olá, '+n;
  }
  let i=0;aplicar();const t=setInterval(()=>{aplicar();if(++i>40)clearInterval(t);},500);
  window.addEventListener('storage',aplicar);
})();

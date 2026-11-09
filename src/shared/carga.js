/* Tela de carregamento (#load) simples, compartilhada (marcador SHARED:carga). */
function carga(on,msg){const l=$('#load');if(!l) return;l.hidden=!on;document.body.classList.toggle('carregando',!!on);if(msg) $('#ldS').textContent=msg;}

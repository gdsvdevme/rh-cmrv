/* Texto sem acento, minúsculo e aparado (para comparar nomes), compartilhado (marcador SHARED:norm). */
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

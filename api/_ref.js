/* Mês de referência das consultas ao Centi. Sem dependências, para poder ser testado sozinho.
   O prefixo "_" evita que a Vercel publique este arquivo como rota. */

/* O Centi recusa o relatório quando a folha do mês de referência ainda não foi processada
   ("A folha deste servidor não foi processada em 11/2026"). */
const semFolha = r => /n[ãa]o foi processada/i.test(String((r && r.data && r.data.Message && r.data.Message[0]) || ''));

/* mês pedido e os n-1 anteriores, do mais novo para o mais antigo */
function referencias(mes, ano, n) {
  const out = [];
  let m = mes, a = ano;
  for (let i = 0; i < n; i++) { out.push({ mes: m, ano: a }); m--; if (m < 1) { m = 12; a--; } }
  return out;
}

/* Token vencido ou inválido: o Centi responde HTTP 500 com ErrorCode 10304 e "Sessão inválida. Efetue login novamente." (ou 401).
   Sem esse reconhecimento a função devolvia 502 e o navegador não sabia que precisava pedir o login de novo. */
const sessaoInvalida = r => !!r && (r.status === 401 || !!(r.data && (String(r.data.ErrorCode) === '10304'
  || /sess[ãa]o inv[áa]lida|efetue login novamente/i.test(String((r.data.Message || []).join(' '))))));

module.exports = { semFolha, referencias, sessaoInvalida };

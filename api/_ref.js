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

module.exports = { semFolha, referencias };

/* Utilitários das funções que falam com o Centi. O prefixo "_" evita que a Vercel publique este arquivo como rota. */
const crypto = require('crypto');
const LZ = require('lz-string');

const BASE = (process.env.CENTI_BASE || 'https://go.centi.com.br/go02/wcf').replace(/\/+$/, '');
/* o Centi descobre o cliente (Câmara de Rio Verde) pelo Referer; um navegador não consegue enviá-lo, por isso tudo passa por aqui */
const REFERER = process.env.CENTI_REFERER || 'https://go.centi.com.br/camararioverde/';

const allowedUsers = () => (process.env.CENTI_ALLOWED_USERS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isAllowed = user => allowedUsers().includes(String(user || '').trim().toLowerCase());

async function centiPost(path, body, extra) {
  const r = await fetch(BASE + '/' + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', referer: REFERER }, extra || {}),
    body: JSON.stringify(body)
  });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

const centiLogin = (user, pass) =>
  centiPost('rest/login', { User: user, Pass: LZ.compressToBase64(pass), Encrypted: true, TypeRequest: 0, FrontBeta: true });

/* senha da conta no PocketBase: derivada do usuário e de um segredo do servidor, sem nunca mudar.
   Assim cada pessoa pode entrar em vários aparelhos sem derrubar a sessão das outras. */
const pbPassword = user => crypto.createHmac('sha256', process.env.APP_SECRET || '')
  .update('rhcmrv:' + user).digest('base64url');

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = { BASE, centiPost, centiLogin, isAllowed, allowedUsers, pbPassword, readBody, send };

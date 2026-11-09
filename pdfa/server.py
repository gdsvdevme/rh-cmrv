"""Serviço de conversão .docx -> PDF/A-2u.   POST /converter  (corpo = arquivo .docx)   Authorization: Bearer $PDFA_TOKEN
Responde o PDF/A. GET /health responde 200. Variáveis: PDFA_TOKEN (obrigatória), PORT (padrão 8080)."""
import hmac, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from converter import docx_para_pdfa

TOKEN = os.environ.get('PDFA_TOKEN', '')
MAX = 8 * 1024 * 1024
lock = threading.Semaphore(2)   # no máximo 2 conversões ao mesmo tempo

class H(BaseHTTPRequestHandler):
    def _r(self, code, body=b'', tipo='text/plain; charset=utf-8'):
        self.send_response(code); self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self._r(200, b'ok') if self.path == '/health' else self._r(404)
    def do_POST(self):
        if self.path != '/converter': return self._r(404)
        auth = self.headers.get('Authorization', '')
        if not TOKEN or not hmac.compare_digest(auth, 'Bearer ' + TOKEN): return self._r(401, 'Não autorizado.'.encode())
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX: return self._r(413, 'Arquivo inválido ou grande demais.'.encode())
        docx = self.rfile.read(n)
        if docx[:2] != b'PK': return self._r(400, 'Envie um arquivo .docx.'.encode())
        with lock:
            try: pdf = docx_para_pdfa(docx)
            except Exception as e: return self._r(500, str(e).encode())
        self._r(200, pdf, 'application/pdf')
    def log_message(self, *a): pass

if __name__ == '__main__':
    if not TOKEN: raise SystemExit('Defina PDFA_TOKEN.')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), H).serve_forever()

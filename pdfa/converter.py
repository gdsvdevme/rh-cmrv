"""Converte .docx em PDF/A-2u: LibreOffice (docx -> PDF) e Ghostscript (PDF -> PDF/A-2)."""
import glob, os, re, shutil, subprocess, tempfile

ICC = next(iter(glob.glob('/usr/share/color/icc/ghostscript/srgb.icc') + glob.glob('/usr/share/ghostscript/*/iccprofiles/srgb.icc')), None)

PDFA_DEF = """%!
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} <</N 3>> /PUT pdfmark
[{icc_PDFA} ({icc}) (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} <<
  /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA}
  /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1)
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
"""

def _run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, timeout=120, **kw)
    if r.returncode:
        raise RuntimeError('%s falhou: %s' % (cmd[0], (r.stderr or r.stdout).decode('utf-8', 'replace')[-400:]))

def docx_para_pdfa(docx: bytes, titulo: str = 'Documento') -> bytes:
    if not ICC:
        raise RuntimeError('Perfil ICC sRGB não encontrado (instale ghostscript).')
    with tempfile.TemporaryDirectory() as d:
        src, mid, out = (os.path.join(d, n) for n in ('doc.docx', 'doc.pdf', 'pdfa.pdf'))
        open(src, 'wb').write(docx)
        # perfil próprio por conversão: o LibreOffice não aceita dois processos no mesmo perfil
        _run(['soffice', '-env:UserInstallation=file://' + d + '/lo', '--headless', '--convert-to',
              'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"2"}}', '--outdir', d, src])
        if not os.path.exists(mid):
            raise RuntimeError('LibreOffice não gerou o PDF.')
        deff = os.path.join(d, 'PDFA_def.ps')
        open(deff, 'w').write(PDFA_DEF.replace('{icc}', ICC))
        _run(['gs', '--permit-file-read=' + ICC, '-dPDFA=2', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dNOOUTERSAVE', '-sColorConversionStrategy=RGB',
              '-dPDFACompatibilityPolicy=1', '-dEmbedAllFonts=true', '-sDEVICE=pdfwrite', '-sOutputFile=' + out, deff, mid])
        pdf = open(out, 'rb').read()
    # Ghostscript declara conformidade B; os fontes saem com ToUnicode, então declaramos U (mesmo tamanho: o xref não muda)
    novo, n = re.subn(rb"(pdfaid:conformance=['\"])B(['\"])", rb'\1U\2', pdf)
    if n != 1:
        raise RuntimeError('Metadados XMP PDF/A não encontrados no resultado.')
    return novo

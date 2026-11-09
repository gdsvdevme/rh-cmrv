FROM python:3.12-slim
# LibreOffice (docx -> PDF), Ghostscript (PDF -> PDF/A-2) e fontes. O Times New Roman e o Arial vêm do pacote
# ttf-mscorefonts-installer (repositório contrib); ao construir a imagem você aceita a licença (EULA) da Microsoft.
RUN (sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
     sed -i 's/ main$/ main contrib/' /etc/apt/sources.list 2>/dev/null; true) \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get update && apt-get install -y --no-install-recommends \
       libreoffice-writer-nogui ghostscript ttf-mscorefonts-installer fonts-liberation2 fonts-dejavu-core fontconfig \
    && fc-cache -f && fc-list | grep -qi "Times New Roman" \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY converter.py server.py ./
EXPOSE 8080
CMD ["python", "server.py"]

FROM python:3.12-slim
# LibreOffice (docx -> PDF), Ghostscript (PDF -> PDF/A-2) e fontes métricas do Times New Roman/Arial (Liberation)
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer-nogui ghostscript fonts-liberation2 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY converter.py server.py ./
EXPOSE 8080
CMD ["python", "server.py"]

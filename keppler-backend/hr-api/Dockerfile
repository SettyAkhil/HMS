FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY . .
# /data/hr-documents is pre-created so a fresh named volume inherits hr's ownership.
RUN useradd --uid 1000 --create-home hr && mkdir -p /data/hr-documents && chown -R hr /app /data/hr-documents
USER hr

EXPOSE 8020
CMD ["sh", "-c", "python -m app.bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port 8020 --proxy-headers --forwarded-allow-ips='*'"]

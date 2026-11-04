FROM python:3.11-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5001
# Worker count deliberately NOT hardcoded with -w: gunicorn natively reads the
# WEB_CONCURRENCY env var (set in docker-compose.yml) as its worker count, so it
# can be tuned per-deployment without rebuilding the image.
CMD ["gunicorn", "-b", "0.0.0.0:5001", "app:app"]

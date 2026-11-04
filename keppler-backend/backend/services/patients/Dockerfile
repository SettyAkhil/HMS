FROM python:3.11-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# /app/uploads is where the hospital_uploads volume mounts (bulk-import files,
# shared with celery-worker). It has to exist in the image, owned by appuser:
# Docker seeds an empty named volume from the image directory, ownership
# included -- without it the mount point is root's and every upload 500s with
# "Permission denied: '/app/uploads/bulk_import'".
RUN mkdir -p /app/uploads \
    && adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8012
# Worker count deliberately NOT hardcoded with -w: gunicorn natively reads the
# WEB_CONCURRENCY env var (set in docker-compose.yml) as its worker count, so it
# can be tuned per-deployment without rebuilding the image.
CMD ["gunicorn", "-b", "0.0.0.0:8012", "services.patients.app:app"]

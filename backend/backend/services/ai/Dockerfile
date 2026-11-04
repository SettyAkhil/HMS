FROM python:3.11-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# The Hugging Face cache (Whisper's weights) is a named volume in docker-compose.yml;
# the directory must exist here, owned by appuser, or Docker creates the empty volume
# root-owned and the model can never be cached.
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /home/appuser/.cache/huggingface \
    && chown -R appuser:appuser /app /home/appuser/.cache
USER appuser

EXPOSE 8018
# Worker count deliberately NOT hardcoded with -w: gunicorn natively reads the
# WEB_CONCURRENCY env var (set in docker-compose.yml) as its worker count, so it
# can be tuned per-deployment without rebuilding the image.
# --timeout 300: gunicorn's 30s default is too short for CPU-bound Whisper
# transcription (ai/whisper_provider.py) on a longer recording, or for the
# app-startup model pre-warm (see services/ai/app.py) on a slow first pull
# from Hugging Face Hub -- both are legitimately slow, not hung.
# Threaded worker: one sync worker meant a single 30-90 s OCR/transcription
# call blocked every other AI request behind it (S-5). Threads share the one
# loaded Whisper model; extra processes would each load their own copy.
CMD ["gunicorn", "-b", "0.0.0.0:8018", "--timeout", "300", "--worker-class", "gthread", "--threads", "8", "services.ai.app:app"]

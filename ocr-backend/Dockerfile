# ── Python API ───────────────────────────────────────────────────────────
# The frontend is a separate app (ocr-frontend/, served by its own Vite
# dev server) and is not built or served from this image.
FROM python:3.11-slim

WORKDIR /app

# 🚀 CRITICAL SYSTEM DEPENDENCIES
# - build-essential/pkg-config/libcairo2-dev: xhtml2pdf's native deps.      
# - libgl1/libglib2.0-0: cv2 (opencv) needs libGL.so.1 even via the
#   "headless" package, pulled in transitively by ultralytics/other deps —
#   this bit us for real: the host dev machine has these from its desktop
#   GPU drivers, masking the missing dependency until the first container
#   run (ImportError: libGL.so.1: cannot open shared object file).
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    pkg-config \
    libcairo2-dev \
    libgl1 \
    libglib2.0-0 \
    libpango-1.0-0 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Copy your requirements file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Expose the FastAPI gateway's port
EXPOSE 8111

# Command to run the application
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8111"]

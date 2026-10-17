# namo-video, the video pipeline's worker (docs/06 Phase 19, part D).
#
# Debian's ffmpeg brings libx264, AAC and libwebp, which is all encode.py
# uses. One gunicorn worker on purpose: the job queue and the encoder
# thread live in that one process.
#
# Deploy (CPU always allocated, so the encoder thread keeps running after
# the 202; one job at a time per instance):
#   gcloud run deploy namo-video --source video-worker --region asia-south1 \
#     --no-cpu-throttling --cpu 2 --memory 2Gi --concurrency 8 \
#     --max-instances 3 --timeout 60

FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY encode.py main.py ./

CMD exec gunicorn main:app --bind "0.0.0.0:${PORT:-8080}" --workers 1 --threads 4 --timeout 0

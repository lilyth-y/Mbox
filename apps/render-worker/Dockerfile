# Render worker image (headless Chromium + ffmpeg)

FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY scripts scripts

ENV MBOX_WEB_BASE_URL=https://mbox-web-newmedia-496107.storage.googleapis.com
ENV VITE_API_BASE_URL=https://mbox-api-118689443638.asia-northeast3.run.app
ENV RENDER_WORKER_POLL_MS=5000

CMD ["node", "scripts/render-worker.mjs"]

# Production-like web preview (no Vite HMR) — pairs with docker-compose.yml
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
COPY scripts/sync-havok-wasm.mjs scripts/sync-havok-wasm.mjs

ARG VITE_API_BASE_URL=http://localhost:8787
ARG VITE_API_KEY=
ARG VITE_USE_SERVER_VAULT=false
ARG VITE_RENDER_BACKEND=local
ARG VITE_SHOWCASE_LOCAL_ONLY=true
ARG VITE_LOCALHOST_DEMO=true
ARG VITE_ENABLE_DEV_ASSET_BATCH=false

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_KEY=$VITE_API_KEY
ENV VITE_USE_SERVER_VAULT=$VITE_USE_SERVER_VAULT
ENV VITE_RENDER_BACKEND=$VITE_RENDER_BACKEND
ENV VITE_SHOWCASE_LOCAL_ONLY=$VITE_SHOWCASE_LOCAL_ONLY
ENV VITE_LOCALHOST_DEMO=$VITE_LOCALHOST_DEMO
ENV VITE_ENABLE_DEV_ASSET_BATCH=$VITE_ENABLE_DEV_ASSET_BATCH

RUN node scripts/sync-havok-wasm.mjs \
  && npm run build --workspace @mbox/shared \
  && npm run build --workspace @mbox/web

FROM nginx:1.27-alpine
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 4173

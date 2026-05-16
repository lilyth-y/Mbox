FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @mbox/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN rm -f packages/shared/tsconfig.tsbuildinfo apps/api/tsconfig.tsbuildinfo && \
    npm run build --workspace @mbox/shared && \
    npm run build --workspace @mbox/api

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=8080
ENV WORKSPACE_DATA_DIR=/var/lib/mbox/workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @mbox/api --omit=dev --include-workspace-root
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /var/lib/mbox/workspaces
VOLUME ["/var/lib/mbox/workspaces"]
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]

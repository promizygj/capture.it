# syntax=docker/dockerfile:1
# One image runs the API (serving the built React app) or the worker, chosen by the command.
# The Playwright base image ships Chromium, Firefox and WebKit with all OS dependencies.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci --ignore-scripts
COPY backend backend
COPY frontend frontend
RUN npm run build -w frontend && npm run build -w backend && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.65.0-noble AS runtime
ENV NODE_ENV=production PORT=4100 STORAGE_DIR=/data/storage
WORKDIR /app
COPY --chown=pwuser:pwuser --from=build /app/package.json ./
COPY --chown=pwuser:pwuser --from=build /app/node_modules node_modules
COPY --chown=pwuser:pwuser --from=build /app/backend/package.json backend/
COPY --chown=pwuser:pwuser --from=build /app/backend/dist backend/dist
COPY --chown=pwuser:pwuser --from=build /app/backend/prisma backend/prisma
COPY --chown=pwuser:pwuser --from=build /app/backend/demo-site backend/demo-site
COPY --chown=pwuser:pwuser --from=build /app/frontend/dist frontend/dist
WORKDIR /app/backend
RUN mkdir -p /data/storage && chown -R pwuser:pwuser /data
USER pwuser
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply migrations, then start the API. Override with `node dist/worker.js` for worker containers.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

# syntax=docker/dockerfile:1

# ---- build stage: compile TypeScript, then drop dev dependencies -------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime stage: only compiled code and production dependencies, running as the unprivileged "node" user -----
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8080
# Cloud Run sets PORT and sends SIGTERM on shutdown; src/index.ts handles both.
CMD ["node", "dist/index.js"]

# ── Install & build everything ─────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY client/ ./client/
COPY server/ ./server/
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# ── Production ────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev

# Copy compiled server
COPY --from=build /app/server/dist ./server/dist

# Copy built client SPA
COPY --from=build /app/client/dist ./client/dist

# Config directory — extend this image and COPY your config.yml here
RUN mkdir -p /app/config

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/dist/index.js"]

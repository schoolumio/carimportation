# Multi-stage build for the web app and worker (same image, different command).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 autovault && mkdir -p /app/storage/private && chown -R autovault /app/storage
COPY --from=build --chown=autovault /app /app
USER autovault
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]

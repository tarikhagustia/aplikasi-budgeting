# ── Build stage ────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Install build tools (better-sqlite3 native build) + dependencies
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci \
    && rm -rf /var/lib/apt/lists/*

# Copy source & build
COPY . .
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV MONEY_DB_PATH=/data/money_management.db

# Runtime dependencies only (better-sqlite3 perlu native build — pakai build tools lalu bersihkan)
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Build output + schema (untuk auto-init DB kalau kosong)
COPY --from=builder /app/build ./build
COPY schema.sql ./schema.sql

# Volume untuk database — data persist walau container dihapus
VOLUME ["/data"]

EXPOSE 3000

# Healthcheck — cek server hidup
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]

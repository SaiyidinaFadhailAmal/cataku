# syntax=docker/dockerfile:1

# ---------- Tahap 1: dependensi ----------
# Memasang dependensi produksi berdasarkan package-lock.json.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Tahap 2: runtime ----------
# Image akhir hanya berisi runtime Node.js, dependensi, dan source aplikasi.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public

# Menjalankan proses sebagai user non-root bawaan image Node.
USER node

EXPOSE 3000
CMD ["node", "server.js"]

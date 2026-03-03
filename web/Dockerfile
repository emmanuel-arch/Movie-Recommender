# ── Web Dockerfile (Next.js) ──────────────────────────────
# Build context: web/
#   docker build -f web/Dockerfile -t birgenai-web web/
# ──────────────────────────────────────────────────────────

# ── Stage 1: Install deps ────────────────────────────────
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# ── Stage 2: Build ───────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public

# The API URL is baked in at build time for client components
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Stage 3: Production ─────────────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public/

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

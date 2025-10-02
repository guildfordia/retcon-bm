# Multi-stage build for Next.js application
FROM node:20-alpine AS deps
# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package*.json ./
# Install ALL dependencies with optimized settings
RUN npm config set fetch-retries 3 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set loglevel error && \
    npm install --no-audit --no-fund --omit=optional

# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_ORBITDB_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SIGNALING_URL
ARG NEXT_PUBLIC_TURN_URL
ENV NEXT_PUBLIC_ORBITDB_URL=${NEXT_PUBLIC_ORBITDB_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_SIGNALING_URL=${NEXT_PUBLIC_SIGNALING_URL}
ENV NEXT_PUBLIC_TURN_URL=${NEXT_PUBLIC_TURN_URL}

# Build the application
RUN npm run build

# Runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts

# Create data and uploads directories with proper ownership
RUN mkdir -p /data /uploads && \
    chown -R nextjs:nodejs /data /uploads && \
    chown -R nextjs:nodejs /app/scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
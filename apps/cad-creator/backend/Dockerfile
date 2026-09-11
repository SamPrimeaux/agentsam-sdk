# ----------------------------------------------------
# AgentSam CAD Studio - Web & API Server Dockerfile
# ----------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV CAD_STORAGE_ROOT=/app/storage/cad

# Create non-root user for security
RUN addgroup -S cadgroup && adduser -S caduser -G cadgroup

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend

# Setup storage directory with proper permissions
RUN mkdir -p /app/storage/cad/artifacts /app/storage/cad/renders /app/storage/cad/temp \
    && chown -R caduser:cadgroup /app

USER caduser
EXPOSE 3000

CMD ["node", "dist/server.cjs"]

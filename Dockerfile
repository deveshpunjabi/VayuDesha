# VayuDesha — Production Container for Google Cloud Run
FROM node:22-alpine

WORKDIR /app

# Copy zero-dependency application source
COPY package.json ./
COPY server ./server
COPY public ./public
COPY api ./api

# Google Cloud Run injects PORT=8080 by default
ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root user for container security
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.mjs"]

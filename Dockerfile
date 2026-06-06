# Minimal container for the Student Portal.
# Node 24 so the built-in `node:sqlite` is stable (no flag needed).
# Alpine keeps the image small and the CVE surface low — nice for image scanning.
FROM node:24-alpine

# Run as the built-in non-root `node` user (security best practice).
WORKDIR /app

# There are zero runtime dependencies, so there's nothing to `npm install`.
# We still copy package.json first for metadata + better layer caching if you
# ever add deps later.
COPY package.json ./

# Copy the application source.
COPY app.js server.js db.js views.js ./
COPY public ./public

# SQLite needs a writable data dir. Create it and hand ownership to `node`
# so the app can create/seed ./data/portal.db at runtime as a non-root user.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Container-native health check — mirrors the /healthz endpoint used by CI/CD.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

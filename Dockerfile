# Build and runtime share Debian/glibc so Argon2's native prebuild stays compatible.
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
# Explicit generation below; no dependency lifecycle telemetry or implicit DB work.
RUN npm ci --ignore-scripts
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run db:generate && npm run build
RUN node --input-type=module -e "import {hash,verify} from 'argon2'; const h=await hash('build-only-native-probe'); if(!await verify(h,'build-only-native-probe')) process.exit(1)"

# Explicit operator jobs retain the pinned Prisma CLI and TypeScript runner.
FROM build AS tools
RUN mkdir -p local-data && chown node:node local-data
USER node
CMD ["npm", "run", "db:migrate:deploy"]

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer --omit=optional --ignore-scripts && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(2000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

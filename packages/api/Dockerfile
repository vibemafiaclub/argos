FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @argos/shared build
RUN pnpm --filter @argos/api build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/prisma ./packages/api/prisma
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

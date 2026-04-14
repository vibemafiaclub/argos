FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm install --frozen-lockfile
WORKDIR /app/packages/api
RUN pnpm exec prisma generate
WORKDIR /app
RUN pnpm --filter @argos/shared build
RUN pnpm --filter @argos/api build
RUN pnpm --filter @argos/api deploy --prod /app/deploy

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/deploy ./
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/packages/shared/dist ./node_modules/@argos/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@argos/shared/package.json
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]

FROM node:20-alpine
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
ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]

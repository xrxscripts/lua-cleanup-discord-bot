FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/lua-cleanup-bot/package.json apps/lua-cleanup-bot/package.json
RUN pnpm install --frozen-lockfile --filter @workspace/lua-cleanup-bot...

COPY tsconfig.base.json tsconfig.json ./
COPY apps/lua-cleanup-bot apps/lua-cleanup-bot
RUN pnpm --filter @workspace/lua-cleanup-bot run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/lua-cleanup-bot/package.json apps/lua-cleanup-bot/package.json
COPY --from=build /app/apps/lua-cleanup-bot/dist apps/lua-cleanup-bot/dist
RUN pnpm install --prod --frozen-lockfile --filter @workspace/lua-cleanup-bot...

WORKDIR /app/apps/lua-cleanup-bot
CMD ["pnpm", "run", "start"]
# Lua Cleanup Discord Bot

A Discord bot and CLI that conservatively cleans authorized Lua source without
executing or storing uploaded code.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/lua-cleanup-bot run dev` — run the Discord bot and
  health server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `DISCORD_TOKEN` — set through Replit Secrets, never in code
- Optional env: `PORT` — health server port, defaults to 3000

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `apps/lua-cleanup-bot/src/lua-cleaner.ts` — static cleanup and report engine
- `apps/lua-cleanup-bot/src/discord-bot.ts` — Discord slash commands
- `apps/lua-cleanup-bot/src/cli.ts` — local file cleanup command
- `apps/lua-cleanup-bot/Dockerfile` — container deployment
- `.github/workflows/lua-cleanup-bot.yml` — GitHub verification workflow

## Architecture decisions

- The cleanup engine is pure TypeScript and is separate from Discord so it can
  be used in scripts or another interface.
- The default output is line-stable: removed statements become whitespace so
  source locations remain useful.
- Dynamic execution is reported and preserved; it is never evaluated by the
  bot.
- Uploads are processed in memory and are not persisted by this project.

## Product

Users upload a `.lua` file with `/clean` and receive a cleaned file plus a
plain-text report. `/about` explains the safety boundary. A CLI provides the
same engine for local files.

## User preferences

- Keep the project repo-ready with a full README, Dockerfile, and GitHub
  Actions workflow.

## Gotchas

- GitHub stores the source and runs CI, but an always-on Discord bot still needs
  a container host.
- Generic Lua deobfuscation cannot honestly guarantee semantic equivalence, so
  the engine only applies conservative rewrites.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

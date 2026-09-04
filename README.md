# Lua Cleanup Discord Bot

This project contains a Discord bot that accepts a `.lua` attachment, applies a
small set of conservative static cleanups, and returns:

1. A cleaned Lua file.
2. A plain-text report describing every applied change and every suspicious
   pattern that was detected but intentionally preserved.

The bot never executes, emulates, imports, or evaluates the uploaded Lua. It
does not store uploads after the Discord response is complete.

## Important behavior

No generic tool can honestly promise to completely deobfuscate arbitrary Lua
while also guaranteeing 100% behavioral equivalence. Obfuscators can use
dynamic code loading, metatables, debug hooks, environment mutation, native
extensions, and intentionally ambiguous runtime behavior. This project
therefore defaults to **line-stable conservative mode**:

- Printable hexadecimal and decimal escapes in quoted strings are decoded.
- Obvious local discard assignments such as `local _ = nil` are blanked.
- Empty `do end` blocks are blanked.
- Original line numbers are kept by replacing removed source with whitespace.
- Dynamic execution and suspicious identifiers are reported, not guessed at.
- The original upload is never overwritten.

The output is a cleanup aid for Lua you are authorized to inspect, not a
security bypass or a guarantee that unknown code is safe.

## Run locally

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm --filter @workspace/lua-cleanup-bot run typecheck
pnpm --filter @workspace/lua-cleanup-bot run build
```

For the Discord service:

```bash
export DISCORD_TOKEN="set-this-in-the-Replit-Secrets-panel"
pnpm --filter @workspace/lua-cleanup-bot run dev
```

Never put `DISCORD_TOKEN` in a committed `.env` file, an issue, or a GitHub
Actions log. Store it as a secret in the runtime host.

## Discord setup

1. Open the Discord Developer Portal and create an application.
2. Open **Bot**, create the bot user, and copy the token once.
3. Add the token to the project secret named `DISCORD_TOKEN`.
4. Open **OAuth2 > URL Generator**.
5. Select the `bot` and `applications.commands` scopes.
6. Grant the bot the `View Channels`, `Send Messages`, and `Attach Files`
   permissions.
7. Open the generated URL and invite the bot to a server where you have
   permission to manage apps.
8. Start the service. On login it registers `/clean` and `/about`.
9. Use `/clean`, attach a `.lua` file, and select line-stable or compact mode.

## CLI mode

The same cleanup engine works without Discord:

```bash
pnpm --filter @workspace/lua-cleanup-bot run clean -- ./input.lua
```

This creates `input.clean.lua` and `input.clean.lua.report.txt`.

## GitHub and hosting

GitHub is the source-code host and runs the included typecheck/build workflow.
It is not an always-on process host for a Discord gateway bot. The repository
includes a Dockerfile so the service can run on Railway, Render, Fly.io, or
another container host:

1. Create a GitHub repository.
2. Push this project to the repository.
3. Connect the repository to your chosen container host.
4. Set the `DISCORD_TOKEN` secret there.
5. Deploy the Dockerfile from `apps/lua-cleanup-bot/Dockerfile`.
6. Confirm the host health check returns JSON from `/healthz`.

The bot listens on `PORT` when provided and defaults to `3000`. The health
server is only a liveness endpoint; Discord functionality still requires a
valid bot token.

## Project files

- `apps/lua-cleanup-bot/src/lua-cleaner.ts` — static cleanup engine.
- `apps/lua-cleanup-bot/src/discord-bot.ts` — Discord slash commands and
  attachment handling.
- `apps/lua-cleanup-bot/src/cli.ts` — local file interface.
- `apps/lua-cleanup-bot/Dockerfile` — production container.
- `.github/workflows/lua-cleanup-bot.yml` — GitHub verification workflow.
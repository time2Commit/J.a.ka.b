# CLAUDE.md

J.a.ka.b ("Just another kanban board") is a **calendar** board for scheduling projects, with a **collaborative project note** (OneNote-style) linked to every card. The full plan and architecture are in `docs/ARCHITECTURE.md`: read it before starting a new milestone.

## Language

- **Everything written to the repository is in English**: code, comments, docs, commit messages, PR titles and descriptions, issues.
- The maintainer talks to Claude in Italian; reply in Italian in chat, but keep the repository in English.
- UI strings go through i18n (next-intl) with Italian and English locales; never hard-code user-facing text.

## Commands

```bash
pnpm install          # dependencies (pnpm workspace, Node >= 22)
pnpm lint             # ESLint (flat config, typescript-eslint)
pnpm format           # Prettier write; `pnpm format:check` in CI
pnpm typecheck        # tsc across all packages
pnpm test             # Vitest (unit); single file: pnpm vitest run <path>
pnpm secrets          # secretlint scan of the whole working tree
```

Before every commit: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm secrets`.

## Never commit personal or secret material (mandatory)

Before **every** commit and push:

1. Run `pnpm secrets` and review `git status` / `git diff --cached` file by file.
2. Never commit: `.env` files, API keys, tokens, passwords, private keys or certificates, credentials JSON, SSH keys, password vaults, `.claude/settings.local.json`, IDE settings, uploads, backups or database dumps.
3. No personal data: no real names, emails, phone numbers or home paths in code, fixtures, docs or commit messages. Use obviously fake data (`mario.rossi@example.com`).
4. The only credentials allowed in the repo are throwaway local-dev values (e.g. the `jakab`/`jakab` Postgres user in the SessionStart hook) and placeholders in `.env.example`.
5. If something sensitive was committed, stop and tell the maintainer: it must be rotated, not just deleted.

## Git workflow (mandatory)

`main` is protected by a GitHub ruleset. The maintainer is allowed to bypass it, and Claude Code acts with the maintainer's credentials, so **GitHub would accept a direct push from Claude: this rule is enforced by Claude, not by GitHub.**

1. Never commit or push directly to `main` (no `git push origin main`, no `HEAD:main`, no force-push to `main`).
2. Every change goes on a branch created from the latest `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`. Claude sessions use the `claude/…` branch they were assigned.
3. Commit on the branch, push it, and open a pull request against `main`. The maintainer reviews and merges.
4. Keep PRs focused (one milestone or topic). Title and description in English, with a summary and a test plan.
5. All checks (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm secrets`) must pass before opening or updating a PR.
6. Once a PR is merged, follow-up work starts from a fresh branch off the updated `main`, never on top of the merged branch.
7. Never rewrite history on someone else's branch.

As a safety net, the `PreToolUse` hook `.claude/hooks/block-main.mjs` (registered in `.claude/settings.json`) blocks Bash commands that push to `main` or commit/push while `main` is checked out. Do not disable or work around it.

## Layout (pnpm monorepo)

```
apps/web/        Next.js (App Router): calendar UI, API, uploads, export, SSE   [milestones 1-2]
apps/collab/     Hocuspocus (Yjs) server for real-time notes                    [milestone 4]
packages/db/     Prisma schema, client, migrations, seed                        [milestone 1]
packages/editor/ Shared Tiptap extensions + Markdown serializer                 [milestone 4]
packages/shared/ zod schemas, types, shared utilities (e.g. normalizeProjectName)
docker/          Dockerfiles and Caddyfile; docker-compose.yml at the root      [milestone 8]
docs/            Plan and documentation
```

Internal packages are named `@jakab/<name>` and export TypeScript sources directly (`"exports": { ".": "./src/index.ts" }`).

## Domain (do not mix these up)

- **Project** = main entity holding the note, attachments and versions. Unique name; `nameNormalized` (from `normalizeProjectName`) powers pg_trgm suggestions.
- **Card** = a scheduled block on the calendar (start/end/allDay). **Many cards → one project.**
- **Status and progress %** live on the project and are shown on the card; board columns do NOT represent status. A card may override them.
- Creating a card always creates (or links) a project and its note, in the same transaction.
- Restoring a version is **non-destructive**: save a `pre-restore` version first.
- Attachments are `fileEmbed` nodes inside the note, not a separate list; never delete files referenced by a version.

## Stack and conventions

- TypeScript `strict` everywhere (`tsconfig.base.json`); no `any` without a comment explaining why.
- UI: Tailwind v4 + shadcn/ui, lucide-react icons, sonner toasts, light/dark theme with next-themes. Accessible components (Radix), responsive layout.
- Calendar: FullCalendar (MIT plugins only: dayGrid, timeGrid, list, interaction). No premium plugins.
- Editor: Tiptap + Yjs/Hocuspocus. Shared extensions live in `packages/editor` so web, collab and export use the same schema.
- Data: Prisma + PostgreSQL 16 with `pg_trgm`. Validate input with zod (schemas in `packages/shared`).
- Dates with date-fns; always store UTC, display in the workspace time zone.
- Tests next to the code: `*.test.ts`. Playwright E2E in `apps/web/e2e/` (Chromium is preinstalled in cloud sessions: do not run `playwright install`).

## Environment

- In cloud sessions `.claude/hooks/session-start.sh` runs `pnpm install` and starts a local PostgreSQL 16 with database/user `jakab` (password `jakab`), exporting `DATABASE_URL=postgresql://jakab:jakab@localhost:5432/jakab`.
- Locally: `docker compose -f docker-compose.dev.yml up -d` for Postgres (from milestone 1).
- Secrets only in `.env` (git-ignored); document every variable in `.env.example`.

# J.a.ka.b

Just another kanban board (J.a.ka.b) is an open-source project aimed at creating a Kanban board with features useful for project management. It is simply how I think a Kanban board should be.

> **Status: feature complete.** Everything below is implemented and covered by unit and end-to-end tests, and the Docker deployment is built and smoke-tested in CI. It is a young project: read [Security](#security) and keep [backups](#backups-and-restore) before trusting it with real work.

## How it works

- **The board is a calendar.** Projects are scheduled on a day, week or month view, with start and end times. The board answers _"what are we working on, and when?"_.
- **Progress lives on the card.** Each card shows its own status (from a list you configure) and a completion percentage, so updating progress never means moving the card.
- **Every card has a project note.** Behind each card there is a rich, collaborative note that describes the whole project and keeps its history. Many cards scheduled on different days can share the same project and note.

## Features

### Calendar board

- Day, week and month views with timed and all-day cards.
- Drag and drop to reschedule, resize to change duration.
- Customizable labels, members and statuses; filters and quick search.
- Cards show project name, status badge, progress bar, labels and member avatars.
- A "To schedule" side panel for projects that are not on the calendar yet.
- Live updates for everyone looking at the board.

### Project notes

- Created automatically when a card is created, or linked to an existing project.
- Rich text: headings, lists, checklists, tables, highlights, links, @mentions.
- **Real-time co-editing** with live cursors and presence.
- **Who changed what**: hover a paragraph to see who last edited it and when.
- **Files placed inside the text**: drop images, PDFs or any file exactly where you want them in the note, not in a separate attachment list.

### Versioning

- Automatic and manual versions of every project note.
- Version history with authors, preview and visual diff.
- **Rollback** to any previous version; restoring is non-destructive and can itself be undone.

### Templates and cloning

- Templates hold default status, labels, people, first-card length, a checklist and the initial note text. Save any project as a template, or start a new project from one.
- Start a new project as a copy of an existing one: settings, and optionally the note with its files duplicated, so the two never share files.

### Smart suggestions

- While creating a card, J.a.ka.b suggests existing projects whose names start with (or closely match) what you type, so new cards are linked to the same note and history instead of creating duplicates.

### Export, import and backups

- Export a project, or the whole board, as one archive: each note as Markdown for reading plus a lossless copy for importing, with its files, cards and (optionally) version history.
- Import an archive into any instance, after a preview of what it contains: move a board to a new server, or restore after a failure.
- Scheduled nightly backups (board archive plus database dump) with rotation, from the admin settings.

### Self-hosted

- Ships as a Docker Compose stack: web app, real-time notes server, PostgreSQL and Caddy (automatic HTTPS).
- Local accounts with email and password, admin and member roles.
- Designed for small teams on a single server; files live on a Docker volume.

## Tech stack

TypeScript monorepo (pnpm) · Next.js · Tailwind CSS + shadcn/ui · FullCalendar · Tiptap + Yjs/Hocuspocus · PostgreSQL + Prisma · Better Auth · Vitest + Playwright · Docker Compose + Caddy.

The full design (domain model, data model, architecture and feature design) is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Roadmap

All eight planned milestones are done: foundations, calendar board, smart creation, collaborative notes, versioning, export/import, templates and cloning, scheduled backups, and production deployment. Ideas that are deliberately out of scope for now are listed in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (notifications, recurring cards).

## Getting started (development)

Requirements: Node.js 22+, pnpm and Docker (only for the development database).

```bash
pnpm install
cp .env.example .env                           # set AUTH_SECRET (openssl rand -base64 32)
docker compose -f docker-compose.dev.yml up -d # PostgreSQL on localhost:5432
pnpm --filter @jakab/db generate
pnpm --filter @jakab/db migrate:deploy
pnpm dev                                       # web on :3000, notes server on :1234
```

Open <http://localhost:3000> and register: the first account becomes the administrator, who creates the others in **Settings**.

Before every commit (this is also what CI runs):

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm secrets
```

End-to-end tests drive a real browser against a production build. They **reset the database** they are pointed at, so use a throwaway one:

```bash
pnpm --filter @jakab/web exec playwright install chromium   # once
pnpm --filter @jakab/web test:e2e
```

## Deploying with Docker

You need a Linux server with Docker (Compose v2), and, for HTTPS, a domain name pointing at it with ports 80 and 443 open.

```bash
git clone <this repository> jakab && cd jakab
cp .env.production.example .env
# edit .env: POSTGRES_PASSWORD, AUTH_SECRET, APP_URL, COLLAB_PUBLIC_URL, SITE_ADDRESS
docker compose up -d --build
```

Open the site and register: the first account is the administrator. The stack is:

| Service    | What it does                                                                          |
| ---------- | ------------------------------------------------------------------------------------- |
| `postgres` | PostgreSQL 16 (volume `pgdata`)                                                       |
| `migrate`  | applies database migrations, then exits; the apps start after it succeeds             |
| `web`      | the app (volumes `uploads` for files and `backups` for backups)                       |
| `collab`   | real-time notes; reachable only through Caddy, and only as a WebSocket                |
| `caddy`    | TLS (Let's Encrypt for a domain name), proxy, request size limits (volumes `caddy_*`) |

`docker/smoke-test.sh` checks a running stack end to end (migrations, headers, WebSocket, a backup); CI runs it on every pull request.

**Updating:** `git pull && docker compose up -d --build`. Migrations run automatically.

**Without HTTPS or behind another proxy:** set `SITE_ADDRESS=:80`, `APP_URL=http://…` and `COLLAB_PUBLIC_URL=ws://…/collab`, and send `/collab` WebSocket upgrades to the `collab` service and everything else to `web`.

### Configuration

Set in `.env` (see [`.env.production.example`](.env.production.example) for all of them):

| Variable                         | Meaning                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`              | database password (letters and digits only; it goes into a URL)               |
| `AUTH_SECRET`                    | signs sessions, 32+ random characters                                         |
| `APP_URL`, `COLLAB_PUBLIC_URL`   | public address of the site and of the notes endpoint (`wss://…/collab`)       |
| `SITE_ADDRESS`                   | what Caddy serves: a domain name, or `:80` for plain HTTP                     |
| `TZ`                             | server time zone (backup schedule); the calendar uses the workspace time zone |
| `ALLOW_SIGNUP`                   | `true` lets anyone create an account (default: only the admin does)           |
| `UPLOAD_MAX_MB`, `IMPORT_MAX_MB` | largest file in a note, largest backup archive to import                      |
| `BACKUP_CRON`, `BACKUP_KEEP`     | nightly backup schedule (empty = off) and how many to keep                    |
| `ORPHAN_FILE_DAYS`               | days an unreferenced file is kept                                             |

## Backups and restore

Back up the Docker volumes (`pgdata`, `uploads`, `backups`) as you would any server data, and keep copies **off the machine**. In addition, the app makes its own backups every night (default 03:00, see `BACKUP_CRON`) into the `backups` volume: an importable board archive (`jakab-board-….zip`, with files and version history) and a database dump (`jakab-db-….dump`). **Settings → Automatic backups** lists them, lets you download them and back up on demand.

- **Move to a new server, or restore a board:** on the new installation open **Settings → Import a backup** and choose an archive (a board archive, or the archive of a single project). You get a preview first.
- **Restore the database exactly as it was:** create an empty database and run `pg_restore --no-owner --dbname <url> jakab-db-….dump`, then put the `uploads` volume back (the dump has no files; the archive does).

## Security

- Sessions are cookies signed with `AUTH_SECRET`; sign-in is rate-limited; expensive requests (uploads, exports, imports, backups) are rate-limited per user.
- Every page carries a Content-Security-Policy with a per-request nonce, plus the usual hardening headers; HSTS is on when `APP_URL` is HTTPS.
- Uploaded files are never served as pages: images and PDFs inline with `nosniff`, everything else as a download.
- The notes server checks the browser origin and the session on every connection; its HTTP API is not reachable from outside.
- The web app and the notes server run without root and with all Linux capabilities dropped.

Found a vulnerability? Please report it privately to the maintainer instead of opening a public issue.

## Contributing

- Work on a branch created from `main` and open a pull request; `main` is protected.
- Everything in the repository (code, comments, docs, commits, PRs) is written in English.
- All checks above must pass, and secrets or personal data must never be committed.

See [`CLAUDE.md`](CLAUDE.md) for the full conventions.

## License

[GNU General Public License v3.0](LICENSE)

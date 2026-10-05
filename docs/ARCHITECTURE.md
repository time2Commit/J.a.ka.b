# Plan: Calendar Kanban with collaborative project notes

## Context

J.a.ka.b is a self-hosted web app (Docker) for a small team (<50 users, internal server) that combines:

- a **calendar board** (day / week / month, with times) used to _schedule_ projects;
- **progress shown on the card** (not as board columns): configurable statuses plus a percentage;
- a **collaborative project note** linked to every card: rich text, files placed exactly where you want them in the text, who changed what, real-time co-editing, versions with rollback, Markdown export with an attachments folder;
- project **templates** and **cloning**, plus **auto-suggestions** to link new cards to existing projects.

Decisions taken: multi-user full-stack web app · configurable statuses + % · real-time collaborative editing · local email+password accounts · single Docker host with attachments on a volume.

---

## 1. Key concepts (domain)

| Concept              | Meaning                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**          | The main entity. It has a unique name, a **project note** (collaborative document), attachments and version history.                                                  |
| **Card**             | A _scheduled_ block on the calendar (start/end, all-day or timed). **Many cards → one project** (e.g. "Client X" Monday 9–12 and Thursday 14–18 share the same note). |
| **Status**           | Configurable list per workspace (name, color, order, "done" flag). Shown as a badge on the card plus an optional % bar.                                               |
| **Labels / Members** | Customizable; assigned to the project (inherited by its cards), with per-card overrides.                                                                              |
| **Template**         | Default settings (status, labels, members, duration, checklist) plus initial note content.                                                                            |

Design choice: status, % and labels live on the **project** and are visible on all of its cards, so progress stays consistent when work is spread over several days. A single card can override status and %.

---

## 2. Tech stack

| Layer           | Choice                                                                                                                                                      | Why                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Language        | **TypeScript** everywhere                                                                                                                                   | Types shared between frontend, API and collaboration server                       |
| Monorepo        | **pnpm workspaces + Turborepo**                                                                                                                             | Shared packages (db, editor, schemas)                                             |
| Web app + API   | **Next.js (App Router)**, Server Actions + Route Handlers                                                                                                   | One service for UI and API; `standalone` build fits Docker                        |
| UI              | **Tailwind CSS v4 + shadcn/ui** (Radix), **lucide-react**, **next-themes** (dark mode), **sonner** (toasts), **motion** (animations), **Inter/Geist** fonts | Modern, accessible look                                                           |
| Calendar        | **FullCalendar 6** (dayGrid, timeGrid, list, interaction – MIT licensed)                                                                                    | Day/week/month views, drag & drop, resizing, dragging in from an external backlog |
| Note editor     | **Tiptap (ProseMirror)** + Collaboration / CollaborationCaret extensions                                                                                    | Rich text, custom nodes for embedded files                                        |
| Real-time notes | **Yjs (CRDT) + Hocuspocus** (dedicated Node service)                                                                                                        | Simultaneous editing, cursors, persistence in Postgres                            |
| Real-time board | **Postgres LISTEN/NOTIFY → Server-Sent Events**                                                                                                             | Live calendar updates without extra infrastructure                                |
| Client state    | **TanStack Query** + **react-hook-form + zod**                                                                                                              | Caching, optimistic updates on drag, validation                                   |
| Database        | **PostgreSQL 16** + **Prisma** + **pg_trgm** extension                                                                                                      | Relational; similarity search for suggestions                                     |
| Auth            | **Better Auth** (email+password, DB sessions, admin/member roles)                                                                                           | Easy to self-host; the session token also authenticates the Hocuspocus WebSocket  |
| Files           | `StorageDriver` abstraction → **filesystem on a Docker volume** (S3/MinIO driver possible later)                                                            | Simple for a single host                                                          |
| Export          | **prosemirror-markdown** (custom serializer) + **archiver** (zip)                                                                                           | Markdown + `attachments/` folder                                                  |
| i18n            | **next-intl**, Italian and English locales                                                                                                                  | UI usable by everyone                                                             |
| Dates           | **date-fns** with locales, configurable time zone                                                                                                           |                                                                                   |
| Tests           | **Vitest** (unit), **Playwright** (E2E)                                                                                                                     |                                                                                   |
| Quality         | ESLint, Prettier + `prettier-plugin-tailwindcss`, Husky + lint-staged, GitHub Actions CI                                                                    |                                                                                   |
| Reverse proxy   | **Caddy** (automatic HTTPS or internal certificate)                                                                                                         | Routes `/` → web and `/collab` → Hocuspocus (WebSocket)                           |

---

## 3. Architecture

```
            ┌──────────── Caddy (443) ─────────────┐
 Browser ──►│  /           → web:3000 (Next.js)    │
            │  /collab     → collab:1234 (WS)      │
            └──────────────────────────────────────┘
 web (Next.js)          collab (Hocuspocus)
  - calendar UI          - onAuthenticate: verify Better Auth session
  - REST API/Actions     - onLoadDocument / onStoreDocument → Postgres (bytea)
  - file upload/download - periodic snapshots → NoteVersion
  - MD/zip export        - author attribution (PermanentUserData)
  - board SSE
        │                       │
        └──── PostgreSQL ───────┘      Volume /data/uploads (attachments)
```

### Monorepo layout

```
apps/
  web/        Next.js (app/, components/, features/calendar, features/projects, features/notes, features/templates)
  collab/     Hocuspocus server (extensions: auth, database, snapshot)
packages/
  db/         Prisma schema, client, seed, migrations
  editor/     shared Tiptap extensions (FileEmbed, BlockAttribution, …) + Markdown serializer
  shared/     zod schemas, DTO types, constants, utilities
  config/     tsconfig / eslint / tailwind presets
docker/       Dockerfile.web, Dockerfile.collab, Caddyfile
docker-compose.yml, .env.example
```

---

## 4. Data model (Prisma, summary)

- `User` (id, name, email, avatarColor, role) + Better Auth session/account tables
- `Workspace` (settings: time zone, working hours, first day of week) — a single one at first, ready for multiple teams
- `Status` (id, name, color, order, isDone)
- `Label` (id, name, color)
- `Project` (id, name, `nameNormalized` with trigram index, statusId, progress 0–100, color, archivedAt, createdBy, `templateId?`, `clonedFromId?`)
- `ProjectLabel`, `ProjectMember` (join tables)
- `Card` (id, projectId, title?, start, end, allDay, statusOverrideId?, progressOverride?, short notes, createdBy) + `CardMember` / `CardLabel` for overrides
- `NoteDocument` (projectId PK, `yState bytea`, `json jsonb` – latest readable copy for search/export, updatedAt, updatedBy)
- `NoteVersion` (id, projectId, `yState bytea`, json, authors[], reason: `auto|manual|pre-restore`, label?, createdBy, createdAt)
- `Attachment` (id, projectId, originalName, mime, size, sha256, storageKey, uploadedBy, createdAt)
- `Template` (id, name, defaults jsonb {statusId, labelIds, memberIds, durationMin, checklist}, `noteJson`, attachment refs)
- `Activity` (id, projectId, userId, type, payload jsonb, createdAt) — "who did what" log for cards and projects

---

## 5. Features: how they are built

### 5.1 Calendar board

- FullCalendar with **Day / Week (timeGrid) / Month (dayGrid) / List** views and a custom shadcn toolbar.
- **Custom card rendering** (`eventContent`): project name, colored status badge, % bar, label dots, member avatars, note/attachment icon.
- Drag & drop and resize → optimistic update (TanStack Query) + `PATCH /api/cards/:id`; "Undo" toast.
- **"To schedule" side panel**: projects without future cards, draggable onto the calendar (FullCalendar `Draggable`).
- Filters by member, label, status; quick search (⌘K with `cmdk`).
- Clicking a card → **side panel (Sheet)** with card details, note preview and an "Open full note" button.
- Live updates via SSE (`/api/events`), fed by `NOTIFY board_changed` after every write.

### 5.2 Card creation + auto-suggestion

- "New card" dialog with a combobox (shadcn `Command`): while typing, a debounced call to `GET /api/projects/suggest?q=` → `WHERE nameNormalized ILIKE q||'%'` (ranked first) combined with `similarity(nameNormalized, q) > 0.3` (pg_trgm), max 8 results, showing status and last card date.
- Menu options: **Link to existing project** · **New empty project** · **New from template…** · **Clone from project…**.
- Creating a new project happens in one transaction: `Project` + empty (or template-prefilled) `NoteDocument` + `Card` + `Activity`.

### 5.3 Project note

- `/projects/[id]` page with a full-width Tiptap editor: headings, lists, checklists, tables, highlight, colors, code, links, @member mentions, "/" slash commands.
- **Collaboration**: `HocuspocusProvider` (document `project:<id>`), colored cursors with each user's name, presence (avatars of who is in the note).
- **Who changed what**:
  1. `BlockAttribution` extension (in `packages/editor`): an `appendTransaction` writes `lastEditedBy` / `lastEditedAt` on changed blocks → hovering the margin shows "Edited by Mario · 10:42";
  2. a "Show authors" toggle that colors text by author using `Y.PermanentUserData` + Yjs snapshots;
  3. `Activity` log for high-level events (file added, version restored).
- **Files placed anywhere in the note**: custom `fileEmbed` node (block or inline) with attributes `{attachmentId, name, mime, size}`; drop or paste into the editor → upload `POST /api/projects/:id/attachments` (streamed to disk, sha256 hash) → node inserted at the cursor or drop position. Rendering: resizable inline images, PDF preview, other files as a chip with icon, size and download. Unreferenced files are marked orphaned and cleaned up after N days (job), never deleted while a version references them.

### 5.4 Versioning and rollback

- Hocuspocus `onStoreDocument` (~2 s debounce) saves the current state; a _snapshot_ extension creates an **automatic** `NoteVersion` when ≥10 minutes have passed since the last one and there are changes, and at the end of an editing session. "Save version" button for labelled **manual** versions.
- "Version history" UI: list with authors and date, read-only preview, **visual diff** against the current version (block-level JSON comparison).
- **Non-destructive restore**: first creates a `pre-restore` version, then the server replaces the live Yjs document content with the selected version (server-side Yjs transaction, propagated to all connected clients). Restoring can therefore always be undone. Saving a manual version and restoring need the live document, so they are small HTTP routes on the collab server (`/internal/projects/:id/versions[/:versionId/restore]`); the web API forwards the user's session cookie and the collab server authorizes it exactly like a WebSocket connection (`COLLAB_INTERNAL_URL`).
- Retention: manual versions kept forever; automatic versions all kept for 7 days, then one per day (configurable).

### 5.5 Templates and cloning

- `/templates` section: template CRUD with the same editor, without collaboration, for the initial content, plus defaults: status, labels, people, length of the first card and a checklist that is added to the top of the note. **Files are not part of a template** (a template owns no attachments); embeds are stripped when it is saved.
- "Save as template" on the project page: the project's settings and note text become a template; the first card's length becomes the default duration.
- **New project from a template**: in the new-card dialog, "Start from" a template pre-fills status, labels and people (explicit choices win; entries deleted since are ignored) and the end time of the card; the note is created from the template's content. The link to the template is kept and cleared if the template is deleted.
- **Copy of an existing project** (same "Start from" menu): copies colour, labels, people (the status is the first status, progress starts at 0) and, optionally, the note with **physical duplication of the attachments it embeds** (new attachment ids, references rewritten, so the two projects never share files; embeds whose file is gone are dropped). The files are copied before the transaction that creates the project and removed again if it fails.
- Templates are part of the board archive (5.6) and are matched by name on import.

### 5.6 Backup, export and import

Everything leaves and enters the app through one **structured archive format** (a zip), so a project or a whole board can be moved to another instance (hardware upgrade, system recovery, new server).

```
manifest.json            { format: "jakab-backup", version, kind: "project" | "board", exportedAt }
board.json               (board only) workspace settings, statuses, labels, members (name, email, colour, role: no passwords), templates
projects/<slug>/
  project.json           name, status, progress, colour, archived flag, labels, members (by email), cards, attachment list (sha256), note as editor JSON
  note.md                readable Markdown with YAML front matter (GFM: tables, checklists; colours/highlights degrade gracefully)
  attachments/<file>     images → ![](attachments/x.png), others → [name](attachments/x.pdf)
  versions.json          optional: version history (labels, authors, dates, editor JSON)
```

- **Single project**: `GET /api/projects/:id/export` → streamed zip with one `projects/<slug>/` folder.
- **Whole board**: `GET /api/export` (admin) → streamed zip with `board.json` and every project. Options: include archived projects, include version history.
- **Import** (admin), in two steps so nothing is written before it is confirmed: `POST /api/import` receives the zip as the raw body (streamed to a temporary file in the upload volume, capped by `IMPORT_MAX_MB`), validates the manifest and every JSON file (zod; folder names are never paths; entry sizes are capped), and returns a **preview** and an `importId`; `POST /api/import/:importId` then runs it with the choices made in the preview (`DELETE` cancels; unconfirmed uploads are dropped after an hour). Statuses and labels are matched by name and created when missing; members by e-mail. People the archive mentions but the instance lacks can be created with a one-time temporary password (shown once, only its hash is stored). Attachments are re-stored under new ids (SHA-256 and size are verified) and the `fileEmbed` references and mentions in the note and its versions are rewritten. A project whose name already exists is skipped, renamed (`… (imported)`) or replaced, as chosen. Each project is imported on its own: one failure does not affect the others, and its stored files are removed again.
- The imported note has no Yjs state: the collab server builds it from the JSON the first time the note is opened.
- The Markdown is for people and portability; the **JSON is the lossless source** used by import (round-trips the note exactly, including authorship-free structure).
- Markdown serializer shared in `packages/editor` (same schema as web and collab).
- **Automatic backups** run inside the web process (no extra service), on the cron expression `BACKUP_CRON` (in `TZ`; empty = off). Each run writes to `BACKUP_DIR` (a volume in production) two files named by UTC time: `jakab-board-YYYYMMDD-HHMMSS.zip` (the whole-board archive above, with version history and archived projects: importable on any instance) and `jakab-db-YYYYMMDD-HHMMSS.dump` (`pg_dump --format=custom`), then keeps the newest `BACKUP_KEEP` of each kind. Files are written under a temporary name and renamed, a run still in progress is never doubled, and if `pg_dump` is missing or fails the archive is still kept and the problem is reported. Admins see, download and trigger backups from the settings (`/api/admin/backups`; only names the job creates are served).
- **Restoring**: to bring a board back on a fresh instance, import the archive (settings → "Import a backup"); to restore the whole database as it was, create an empty database and run `pg_restore --no-owner --dbname <url> jakab-db-….dump`, then put back the upload volume (the dump has no files; the archive does). The archive is the portable copy, the dump is the exact one.
- The Docker image (milestone 8) must include the PostgreSQL client tools (`pg_dump`).

### 5.7 Authentication and permissions

- Better Auth with email+password; first registered user = admin; afterwards invitations by the admin only (open sign-up can be disabled).
- Roles: **admin** (statuses, labels, users, backups), **member** (everything else). The Hocuspocus WebSocket validates the session cookie in `onAuthenticate`.

**Hardening** (milestone 8):

- `AUTH_SECRET` is checked at start-up in production (present, at least 32 characters, not a placeholder from the docs); the build itself needs no secret.
- **Content-Security-Policy** on every page, set in the Next proxy with a fresh nonce per request (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no inline scripts or `eval` in production; the collab WebSocket origin is derived from `COLLAB_PUBLIC_URL`). Plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS when `APP_URL` is HTTPS. Uploaded files are served from the app's origin as downloads or inert images/PDFs with `nosniff`, never as pages.
- **Rate limiting** per signed-in user on the expensive routes (uploads, exports, imports, manual backups), answering `429` with `Retry-After`; the auth library rate-limits sign-in itself. The limiter is in memory, which fits the single web process the app runs as.
- The collab server closes connections that send a message above `COLLAB_MAX_PAYLOAD_MB` and checks the browser origin and the session on every connection.

---

## 6. Docker deployment

`docker-compose.yml` (the images come from one multi-stage `docker/Dockerfile`, targets `web`, `collab` and `migrate`):

- `postgres:16-alpine` (volume `pgdata`, healthcheck, `pg_trgm` created at first start).
- `migrate`: one-shot job running `prisma migrate deploy` (the schema engine is fetched at image build, so running it needs no internet); `web` and `collab` wait for it with `service_completed_successfully`.
- `web`: Next.js `output: "standalone"` on Alpine with the PostgreSQL client tools (for `pg_dump`); volumes `uploads` and `backups`; runs as `node`, no capabilities, `no-new-privileges`. The nightly backup runs inside it (5.6), so there is no separate backup service.
- `collab`: Hocuspocus on Node 22 Alpine (TypeScript sources of the workspace packages run with `tsx`), same hardening. It does not need the upload volume.
- `caddy`: ports 80/443, automatic HTTPS for a domain name. Only WebSocket upgrades on `/collab` reach the collab server (its HTTP API for versions stays internal); request bodies are capped (`UPLOAD_MAX_MB`, and `IMPORT_MAX_MB` for `/api/import`).
- Volumes: `pgdata`, `uploads`, `backups`, `caddy_data`, `caddy_config`.
- Configuration: `.env` (template `.env.production.example`; compose refuses to start without `POSTGRES_PASSWORD`, `AUTH_SECRET`, `APP_URL`, `COLLAB_PUBLIC_URL`). The images contain no secrets and read everything at start, so one image works behind any domain.
- `docker-compose.dev.yml` for development (Postgres only; apps started with `pnpm dev`).
- **Verification**: the CI job `docker` builds the images, starts the stack and runs `docker/smoke-test.sh` (migrations, security headers, WebSocket upgrade through Caddy, internal API not exposed, first sign-up, a backup with its database dump).

---

## 7. Roadmap (milestones)

1. **Foundations** – monorepo, configs, Prisma + migrations, Better Auth, shadcn layout with light/dark theme, i18n, CI (lint, typecheck, test, secretlint secret scan) and a Husky pre-commit hook running secretlint, dev compose.
2. **Calendar board** – statuses/labels/members CRUD, projects and cards, FullCalendar views with drag & drop, custom card with status and %, filters, live SSE.
3. **Smart creation** – pg_trgm suggestions, linking to existing projects, "To schedule" backlog.
4. **Collaborative notes** – Hocuspocus service, Tiptap editor, cursors/presence, block attribution, `fileEmbed` + upload.
5. **Versioning** – snapshots, history, preview/diff, non-destructive restore, retention.
6. **Templates and cloning**.
7. **Export, import and backup** – MD serializer, structured archive format, per-project and whole-board export, import with preview (move a board to a new instance), scheduled backups with rotation.
8. **Production** – hardening (CSP, rate limiting, secret and payload checks), Dockerfiles, Caddy, full compose, CI smoke test, README.

Each milestone ends with tests and a working demo, so the app is usable from milestone 2 onwards.

---

## 8. Recommended libraries and tools

**Libraries (look & UX):** shadcn/ui, Tailwind v4, lucide-react, sonner, motion, next-themes, cmdk, @tiptap/\* (starter-kit, table, task-list, highlight, color, mention, collaboration, collaboration-caret, drag-handle), FullCalendar, react-dropzone, nanoid, date-fns, next-intl.

**Development:** Prettier + prettier-plugin-tailwindcss, secretlint (secret scanning), ESLint (typescript-eslint, react-hooks, jsx-a11y), Husky + lint-staged, Vitest + Testing Library, Playwright, Prisma Studio.

**Claude Code:** Context7 and Playwright MCP plugins, frontend-design skill, SessionStart hook (`.claude/hooks/session-start.sh`), `CLAUDE.md` with project conventions.

---

## 9. Open points (non-blocking, with proposed default)

- Notifications (email / in-app for due dates and mentions)? → out of initial scope, planned later.
- Recurring cards (e.g. every Monday)? → can be added with RRULE in a later milestone.
- Mobile: responsive layout, no native app.

---

## 10. Verification

- **Unit (Vitest):** Markdown serializer (JSON fixture → expected MD), suggestion logic, version retention, cloning with attachment rewriting, block attribution.
- **Integration:** API against a test Postgres, file upload/download, version restore on a Yjs document.
- **E2E (Playwright):** log in → create a card with a new project → drag it to another day/time → open the note in two browser contexts and check simultaneous editing and authorship → insert a file mid-text → save a version, edit, restore → create a project from a template → type a prefix and check the suggestion → export the zip and check `.md` + `attachments/`.
- **Deployment:** `docker compose up -d --build` on a clean host, green healthchecks, E2E smoke test against `https://localhost`, restore from backup into a fresh compose.

# J.a.ka.b

Just another kanban board (J.a.ka.b) is an open-source project aimed at creating a Kanban board with features useful for project management. It is simply how I think a Kanban board should be.

> **Status: early development.** The architecture is defined and the repository skeleton is in place; the features below are being built milestone by milestone (see [Roadmap](#roadmap)).

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

- Create project templates with default status, labels, members, duration, checklist and initial note content.
- Start a new project from a template or clone an existing project's settings.

### Smart suggestions

- While creating a card, J.a.ka.b suggests existing projects whose names start with (or closely match) what you type, so new cards are linked to the same note and history instead of creating duplicates.

### Backup and export

- Export any project as Markdown plus an `attachments/` folder (zipped).
- Export all projects at once, with optional scheduled backups.

### Self-hosted

- Ships as a Docker Compose stack (web app, collaboration server, PostgreSQL, Caddy reverse proxy with HTTPS).
- Local accounts with email and password, admin and member roles.
- Designed for small teams on a single server; attachments stored on a Docker volume.

## Tech stack

TypeScript monorepo (pnpm) · Next.js · Tailwind CSS + shadcn/ui · FullCalendar · Tiptap + Yjs/Hocuspocus · PostgreSQL + Prisma · Better Auth · Vitest + Playwright · Docker Compose + Caddy.

The full design (domain model, data model, architecture and feature design) is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Roadmap

1. Foundations: monorepo, database, authentication, base UI with light/dark theme, i18n, CI
2. Calendar board
3. Smart card creation and suggestions
4. Collaborative project notes with inline files
5. Versioning and rollback
6. Templates and cloning
7. Markdown export and backups
8. Production Docker deployment

## Getting started (development)

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm secrets
```

Running the app and the Docker deployment will be documented here as the corresponding milestones land.

## Contributing

- Work on a branch created from `main` and open a pull request; `main` is protected.
- Everything in the repository (code, comments, docs, commits, PRs) is written in English.
- All checks above must pass, and secrets or personal data must never be committed.

See [`CLAUDE.md`](CLAUDE.md) for the full conventions.

## License

[GNU General Public License v3.0](LICENSE)

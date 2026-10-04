# CLAUDE.md

J.a.ka.b ("Just another kanban board") è una board a **calendario** per pianificare progetti, con una **nota di progetto collaborativa** (stile OneNote) collegata a ogni scheda. Il piano completo e l'architettura sono in `docs/PIANO-ARCHITETTURA.md`: leggilo prima di iniziare una nuova fase.

## Comandi

```bash
pnpm install          # dipendenze (pnpm workspace, Node >= 22)
pnpm lint             # ESLint (flat config, typescript-eslint)
pnpm format           # Prettier in scrittura; `pnpm format:check` in CI
pnpm typecheck        # tsc su tutti i pacchetti
pnpm test             # Vitest (unit); un file: pnpm vitest run <percorso>
```

Prima di ogni commit: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`.

## Struttura (monorepo pnpm)

```
apps/web/        Next.js (App Router): UI calendario, API, upload, export, SSE   [fase 1-2]
apps/collab/     Server Hocuspocus (Yjs) per le note in tempo reale              [fase 4]
packages/db/     Schema Prisma, client, migrazioni, seed                         [fase 1]
packages/editor/ Estensioni Tiptap condivise + serializer Markdown                [fase 4]
packages/shared/ Schemi zod, tipi, utilità condivise (es. normalizeProjectName)
docker/          Dockerfile e Caddyfile; docker-compose.yml in root              [fase 8]
docs/            Piano e documentazione
```

I pacchetti interni si chiamano `@jakab/<nome>` ed esportano direttamente i sorgenti TypeScript (`"exports": { ".": "./src/index.ts" }`).

## Dominio (non confondere)

- **Progetto** = entità principale con la nota, gli allegati e le versioni. Nome univoco; `nameNormalized` (da `normalizeProjectName`) serve per i suggerimenti con pg_trgm.
- **Scheda (Card)** = blocco pianificato sul calendario (inizio/fine/allDay). **Più schede → un progetto.**
- **Stato e % di avanzamento** stanno sul progetto e si vedono sulla scheda; le colonne della board NON rappresentano lo stato. La scheda può avere un override.
- Creare una scheda crea (o collega) sempre un progetto e la sua nota, nella stessa transazione.
- Il ripristino di una versione è **non distruttivo**: salva prima una versione `pre-restore`.
- Gli allegati sono nodi `fileEmbed` dentro la nota, non una lista separata; non cancellare mai file referenziati da una versione.

## Stack e convenzioni

- TypeScript `strict` ovunque (`tsconfig.base.json`); niente `any` senza motivo commentato.
- UI: Tailwind v4 + shadcn/ui, icone lucide-react, toast con sonner, tema chiaro/scuro con next-themes. Componenti accessibili (Radix), layout responsive.
- Calendario: FullCalendar (plugin MIT: dayGrid, timeGrid, list, interaction). Non usare plugin premium.
- Editor: Tiptap + Yjs/Hocuspocus. Le estensioni condivise vivono in `packages/editor`, così web, collab ed export usano lo stesso schema.
- Dati: Prisma + PostgreSQL 16 con `pg_trgm`. Validazione input con zod (schemi in `packages/shared`).
- Date con date-fns e locale `it`; salvare sempre in UTC, fuso del workspace per la visualizzazione.
- Testi dell'interfaccia, commenti e documentazione in **italiano**; identificatori del codice in inglese.
- Test accanto al codice: `*.test.ts`. E2E Playwright in `apps/web/e2e/` (Chromium preinstallato: non eseguire `playwright install`).

## Ambiente

- Nelle sessioni cloud `.claude/hooks/session-start.sh` esegue `pnpm install` e avvia PostgreSQL 16 locale con database/utente `jakab` (password `jakab`) ed esporta `DATABASE_URL=postgresql://jakab:jakab@localhost:5432/jakab`.
- In locale: `docker compose -f docker-compose.dev.yml up -d` per Postgres (dalla fase 1).
- Segreti solo in `.env` (ignorato da git); documentare ogni variabile in `.env.example`.

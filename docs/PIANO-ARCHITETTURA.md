# Piano: Kanban-Calendario con note di progetto collaborative

## Contesto

Il repo `J.a.ka.b` è vuoto (solo README e LICENSE). Si vuole un'app web self-hosted (Docker) per un piccolo team (<50 utenti, server interno) che unisce:

- una **board a calendario** (giorno / settimana / mese, con orari, come la vista calendario di Trello) usata per _pianificare_ i progetti;
- lo **stato di avanzamento sulla scheda** (non nelle colonne): stati configurabili più una percentuale;
- una **nota di progetto** (in stile OneNote) collegata a ogni scheda: testo formattato, file inseriti nel punto desiderato, chi ha modificato cosa, modifica in tempo reale, versioni con ripristino, export in Markdown con cartella degli allegati;
- **modelli** e **clonazione** dei progetti, **suggerimenti automatici** per collegare schede nuove a progetti già esistenti.

Decisioni prese con te: web full-stack multiutente · stack scelto da me · stati configurabili + % · editing collaborativo in tempo reale · account locali email+password · un solo host Docker con allegati su volume.

---

## 1. Concetti chiave (dominio)

| Concetto               | Significato                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Progetto**           | Entità principale. Ha un nome univoco, una **nota di progetto** (documento collaborativo), allegati e cronologia delle versioni.                                                               |
| **Scheda (Card)**      | Un blocco _pianificato_ sul calendario (inizio/fine, giornata intera o con orario). **Più schede → stesso progetto** (es. "Cliente X" lunedì 9–12 e giovedì 14–18 condividono la stessa nota). |
| **Stato**              | Elenco configurabile per workspace (nome, colore, ordine, flag "concluso"). Mostrato come badge sulla scheda + barra % opzionale.                                                              |
| **Etichette / Membri** | Personalizzabili; assegnati al progetto (ereditati dalle schede) con override sulla singola scheda.                                                                                            |
| **Modello**            | Impostazioni predefinite (stato, etichette, membri, durata, checklist) + contenuto iniziale della nota.                                                                                        |

Scelta progettuale: stato, % ed etichette stanno sul **progetto** e sono visibili su tutte le sue schede, così l'avanzamento resta coerente anche quando il lavoro è distribuito su più giorni. _(Da confermare: se preferisci uno stato indipendente per ogni scheda, il modello lo supporta con un campo di override.)_

---

## 2. Stack tecnologico consigliato

| Livello           | Scelta                                                                                                                                                         | Perché                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Linguaggio        | **TypeScript** ovunque                                                                                                                                         | Tipi condivisi tra frontend, API e server di collaborazione                                   |
| Monorepo          | **pnpm workspaces + Turborepo**                                                                                                                                | Pacchetti condivisi (db, editor, schemi)                                                      |
| Web app + API     | **Next.js 15 (App Router)**, Server Actions + Route Handlers                                                                                                   | Un solo servizio per UI e API, build `standalone` adatta a Docker                             |
| UI                | **Tailwind CSS v4 + shadcn/ui** (Radix), **lucide-react**, **next-themes** (tema scuro), **sonner** (notifiche), **motion** (animazioni), font **Inter/Geist** | Estetica moderna e accessibile                                                                |
| Calendario        | **FullCalendar 6** (dayGrid, timeGrid, list, interaction – licenza MIT)                                                                                        | Viste giorno/settimana/mese, drag & drop, ridimensionamento, trascinamento da backlog esterno |
| Editor note       | **Tiptap 2/3 (ProseMirror)** + estensioni Collaboration / CollaborationCaret                                                                                   | Testo ricco, nodi personalizzati per i file incorporati                                       |
| Tempo reale note  | **Yjs (CRDT) + Hocuspocus** (servizio Node dedicato)                                                                                                           | Modifica simultanea, cursori, persistenza su Postgres                                         |
| Tempo reale board | **Postgres LISTEN/NOTIFY → Server-Sent Events**                                                                                                                | Aggiornamento live del calendario senza infrastruttura aggiuntiva                             |
| Stato client      | **TanStack Query** + **react-hook-form + zod**                                                                                                                 | Cache, aggiornamenti ottimistici al trascinamento, validazione                                |
| Database          | **PostgreSQL 16** + **Prisma** + estensione **pg_trgm**                                                                                                        | Relazionale, ricerca per similarità per i suggerimenti                                        |
| Auth              | **Better Auth** (email+password, sessioni su DB, ruoli admin/membro)                                                                                           | Facile da self-hostare; il token di sessione autentica anche il WebSocket Hocuspocus          |
| File              | Astrazione `StorageDriver` → **filesystem su volume Docker** (driver S3/MinIO pronto per il futuro)                                                            | Semplice per un singolo host                                                                  |
| Export            | **prosemirror-markdown** (serializer personalizzato) + **archiver** (zip)                                                                                      | Markdown + cartella `allegati/`                                                               |
| Date              | **date-fns** con locale `it`, fuso orario configurabile                                                                                                        |                                                                                               |
| Test              | **Vitest** (unit), **Playwright** (E2E, Chromium già installato)                                                                                               |                                                                                               |
| Qualità           | ESLint, Prettier + `prettier-plugin-tailwindcss`, Husky + lint-staged, GitHub Actions CI                                                                       |                                                                                               |
| Reverse proxy     | **Caddy** (HTTPS automatico o certificato interno)                                                                                                             | Instrada `/` → web e `/collab` → Hocuspocus (WebSocket)                                       |

---

## 3. Architettura

```
            ┌──────────── Caddy (443) ─────────────┐
 Browser ──►│  /           → web:3000 (Next.js)    │
            │  /collab     → collab:1234 (WS)      │
            └──────────────────────────────────────┘
 web (Next.js)          collab (Hocuspocus)
  - UI calendario        - onAuthenticate: verifica sessione Better Auth
  - API REST/Actions     - onLoadDocument / onStoreDocument → Postgres (bytea)
  - upload/download file - snapshot periodici → NoteVersion
  - export MD/zip        - attribuzione autori (PermanentUserData)
  - SSE board
        │                       │
        └──── PostgreSQL ───────┘      Volume /data/uploads (allegati)
```

### Struttura del monorepo

```
apps/
  web/        Next.js (app/, components/, features/calendar, features/projects, features/notes, features/templates)
  collab/     Server Hocuspocus (estensioni: auth, database, snapshot)
packages/
  db/         schema Prisma, client, seed, migrazioni
  editor/     estensioni Tiptap condivise (FileEmbed, BlockAttribution, ecc.) + serializer Markdown
  shared/     schemi zod, tipi DTO, costanti
  config/     tsconfig / eslint / tailwind preset
docker/       Dockerfile.web, Dockerfile.collab, Caddyfile
docker-compose.yml, .env.example
```

---

## 4. Modello dati (Prisma, sintesi)

- `User` (id, name, email, avatarColor, role) + tabelle sessione/account di Better Auth
- `Workspace` (impostazioni: fuso orario, orario di lavoro, primo giorno della settimana) — una sola all'inizio, pronta per più team
- `Status` (id, name, color, order, isDone)
- `Label` (id, name, color)
- `Project` (id, name, `nameNormalized` con indice trigram, statusId, progress 0–100, color, archivedAt, createdBy, `templateId?`, `clonedFromId?`)
- `ProjectLabel`, `ProjectMember` (tabelle ponte)
- `Card` (id, projectId, title?, start, end, allDay, statusOverrideId?, progressOverride?, notes breve, createdBy) + `CardMember` / `CardLabel` per gli override
- `NoteDocument` (projectId PK, `yState bytea`, `json jsonb` – ultima copia leggibile per ricerca/export, updatedAt, updatedBy)
- `NoteVersion` (id, projectId, `yState bytea`, json, authors[], reason: `auto|manual|pre-restore`, label?, createdBy, createdAt)
- `Attachment` (id, projectId, originalName, mime, size, sha256, storageKey, uploadedBy, createdAt)
- `Template` (id, name, defaults jsonb {statusId, labelIds, memberIds, durataMin, checklist}, `noteJson`, attachment refs)
- `Activity` (id, projectId, userId, type, payload jsonb, createdAt) — registro "chi ha fatto cosa" per schede e progetti

---

## 5. Funzionalità: come vengono realizzate

### 5.1 Calendario-board

- FullCalendar con viste **Giorno / Settimana (timeGrid) / Mese (dayGrid) / Elenco**, barra degli strumenti personalizzata con shadcn.
- **Rendering personalizzato della scheda** (`eventContent`): nome del progetto, badge di stato colorato, barra %, pallini etichette, avatar membri, icona nota/allegati.
- Drag & drop e ridimensionamento → aggiornamento ottimistico (TanStack Query) + `PATCH /api/cards/:id`; annullamento con toast "Annulla".
- **Pannello laterale "Da pianificare"**: progetti senza schede future, trascinabili sul calendario (FullCalendar `Draggable`).
- Filtri per membro, etichetta, stato; ricerca rapida (⌘K con `cmdk`).
- Clic su una scheda → **pannello laterale (Sheet)** con dettagli della scheda + anteprima della nota e pulsante "Apri nota a schermo intero".
- Aggiornamenti live via SSE (`/api/events`), alimentati da `NOTIFY board_changed` dopo ogni scrittura.

### 5.2 Creazione scheda + suggerimento automatico

- Dialog "Nuova scheda" con combobox (shadcn `Command`): mentre si digita, chiamata con debounce a `GET /api/projects/suggest?q=` → query `WHERE nameNormalized ILIKE q||'%'` (priorità) unita a `similarity(nameNormalized, q) > 0.3` (pg_trgm), max 8 risultati, con stato e data dell'ultima scheda.
- Opzioni nel menu: **Collega a progetto esistente** · **Nuovo progetto vuoto** · **Nuovo da modello…** · **Clona da progetto…**.
- Alla creazione di un nuovo progetto, nella stessa transazione: `Project` + `NoteDocument` vuoto (o pre-compilato da modello) + `Card` + `Activity`.

### 5.3 Nota di progetto (in stile OneNote)

- Pagina `/projects/[id]` con editor Tiptap a tutta larghezza: titoli, liste, checklist, tabelle, evidenziatore, colori, codice, link, menzioni @membro, comandi rapidi con "/".
- **Collaborazione**: `HocuspocusProvider` (documento `project:<id>`), cursori colorati con il nome di ogni utente, presenza (avatar di chi è dentro).
- **Chi ha modificato cosa**:
  1. estensione `BlockAttribution` (in `packages/editor`): un `appendTransaction` scrive `lastEditedBy` / `lastEditedAt` sui blocchi modificati → al passaggio del mouse a margine compare "Modificato da Mario · 10:42" (come OneNote);
  2. interruttore "Mostra autori" che colora il testo per autore usando `Y.PermanentUserData` + snapshot Yjs;
  3. registro `Activity` per eventi di alto livello (file aggiunto, versione ripristinata).
- **File nel punto desiderato**: nodo personalizzato `fileEmbed` (blocco o in linea) con attributi `{attachmentId, name, mime, size}`; trascinamento o incolla nell'editor → upload `POST /api/projects/:id/attachments` (streaming su disco, hash sha256) → inserimento del nodo nella posizione del cursore o del rilascio. Rendering: immagini ridimensionabili in linea, PDF con anteprima, altri file come "chip" con icona, dimensione e download. I file non più referenziati vengono marcati "orfani" e ripuliti dopo N giorni (job), mai cancellati se presenti in una versione.

### 5.4 Versioning e rollback

- Hocuspocus `onStoreDocument` (debounce ~2 s) salva lo stato corrente; un'estensione _snapshot_ crea una `NoteVersion` **automatica** quando sono passati ≥10 minuti dall'ultima e ci sono modifiche, e a fine sessione di modifica. Pulsante "Salva versione" per versioni **manuali** con etichetta.
- UI "Cronologia versioni": elenco con autori e data, anteprima in sola lettura, **diff visivo** rispetto alla versione corrente (confronto JSON dei blocchi).
- **Ripristino non distruttivo**: crea prima una versione `pre-restore`, poi il server sostituisce il contenuto del documento Yjs live con quello della versione scelta (transazione Yjs lato server, propagata a tutti i client connessi). Ripristinare è quindi sempre annullabile.
- Politica di conservazione: versioni manuali per sempre; automatiche tutte negli ultimi 7 giorni, poi una al giorno (configurabile).

### 5.5 Modelli e clonazione

- Sezione `/templates`: CRUD dei modelli con lo stesso editor (non collaborativo) per il contenuto iniziale, più i valori predefiniti (stato, etichette, membri, durata predefinita della scheda, checklist).
- "Salva progetto come modello" dalla pagina del progetto.
- **Clona da progetto esistente**: copia impostazioni (etichette, membri, stato iniziale = primo stato) e, a scelta, il contenuto della nota con **duplicazione fisica degli allegati** (nuovi `attachmentId`, riferimenti riscritti nel JSON).

### 5.6 Backup / export Markdown

- `GET /api/projects/:id/export` → zip in streaming:
  ```
  <nome-progetto>/
    <nome-progetto>.md     front-matter YAML (stato, %, etichette, membri, schede pianificate, date)
    allegati/<file>        immagini → ![](allegati/x.png), altri → [nome](allegati/x.pdf)
  ```
- Serializer Markdown condiviso in `packages/editor` (GFM: tabelle, checklist; colori/evidenziazioni degradati elegantemente).
- Export **di tutti i progetti** (zip unico) dalla pagina admin + servizio di backup schedulato opzionale nel compose (export MD notturno + `pg_dump`) su volume `/backups` con rotazione.

### 5.7 Autenticazione e permessi

- Better Auth con email+password; primo utente registrato = admin; poi solo inviti dall'admin (registrazione libera disattivabile).
- Ruoli: **admin** (stati, etichette, utenti, backup), **membro** (tutto il resto). Il WebSocket di Hocuspocus valida il cookie di sessione in `onAuthenticate`.

---

## 6. Deploy Docker

`docker-compose.yml`:

- `postgres:16-alpine` (volume `pgdata`, healthcheck)
- `web` (immagine multi-stage, Next.js `output: "standalone"`, esegue `prisma migrate deploy` all'avvio)
- `collab` (Hocuspocus, Node 22 alpine)
- `caddy` (porte 80/443, `Caddyfile` con proxy di `/collab` in WebSocket)
- `backup` (opzionale, profilo compose `backup`: cron export + pg_dump)
- Volumi: `pgdata`, `uploads` (condiviso web/collab), `backups`, `caddy_data`
- `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `TZ=Europe/Rome`, `UPLOAD_MAX_MB`, `BACKUP_CRON`
- `docker-compose.dev.yml` per lo sviluppo (solo Postgres; app avviate con `pnpm dev`).

---

## 7. Roadmap a fasi (milestone)

1. **Fondamenta** – monorepo, configurazioni, Prisma + migrazioni, Better Auth, layout shadcn con tema chiaro/scuro, CI (lint, typecheck, test), compose dev.
2. **Calendario-board** – CRUD stati/etichette/membri, progetti e schede, FullCalendar con viste e drag & drop, scheda personalizzata con stato e %, filtri, SSE live.
3. **Creazione intelligente** – suggerimenti pg_trgm, collegamento a progetto esistente, backlog "Da pianificare".
4. **Note collaborative** – servizio Hocuspocus, editor Tiptap, cursori/presenza, attribuzione blocchi, `fileEmbed` + upload.
5. **Versioning** – snapshot, cronologia, anteprima/diff, ripristino non distruttivo, conservazione.
6. **Modelli e clonazione**.
7. **Export/backup** – serializer MD, zip per progetto e completo, servizio di backup.
8. **Produzione** – Dockerfile, Caddy, compose completo, hardening (limiti upload, rate limit, CSP), documentazione README in italiano.

Ogni fase si chiude con test e una demo funzionante, così l'app è usabile già dopo la fase 2.

---

## 8. Plugin e strumenti consigliati

**Librerie (estetica e UX):** shadcn/ui, Tailwind v4, lucide-react, sonner, motion, next-themes, cmdk, @tiptap/* (starter-kit, table, task-list, highlight, color, mention, collaboration, collaboration-caret, drag-handle), FullCalendar, react-dropzone, nanoid, date-fns.

**Sviluppo:** Prettier + prettier-plugin-tailwindcss, ESLint (typescript-eslint, plugin react-hooks, jsx-a11y), Husky + lint-staged, Vitest + Testing Library, Playwright, Prisma Studio.

**Per lavorare con Claude Code:**

- **Context7 MCP** (documentazione aggiornata di Next.js, Tiptap, FullCalendar, Prisma).
- **Playwright MCP** / skill `run` per far verificare a Claude l'interfaccia nel browser.
- Skill **`session-start-hook`**: hook che installa le dipendenze e avvia Postgres nelle sessioni cloud, così test e lint girano sempre.
- Un `CLAUDE.md` con convenzioni del progetto (comandi, struttura, regole UI) creato nella fase 1.

---

## 9. Punti ancora aperti (non bloccanti, con default proposto)

- Stato/% per progetto (default) o per singola scheda? → override per scheda disponibile.
- Notifiche (email / in-app per scadenze e menzioni)? → fuori scope iniziale, previste in seguito.
- Lingua dell'interfaccia: solo italiano (default) o predisposta all'i18n (next-intl)?
- Ricorrenze delle schede (es. ogni lunedì)? → supportabili con RRULE in una fase successiva.
- Mobile: layout responsive (sì) ma senza app nativa.

---

## 10. Verifica

- **Unit (Vitest):** serializer Markdown (fixture JSON → MD atteso), logica di suggerimento, conservazione versioni, clonazione con riscrittura degli allegati, attribuzione blocchi.
- **Integrazione:** API contro Postgres di test (container), upload/download file, ripristino versione su documento Yjs.
- **E2E (Playwright, Chromium preinstallato):** login → crea scheda con nuovo progetto → trascina su altro giorno/ora → apri nota con due contesti browser e verifica la modifica simultanea e l'autore → inserisci file a metà testo → salva versione, modifica, ripristina → crea progetto da modello → digita prefisso e verifica il suggerimento → esporta zip e controlla `.md` + `allegati/`.
- **Deploy:** `docker compose up -d --build` su ambiente pulito, healthcheck verdi, smoke test E2E contro `https://localhost`, ripristino da backup in un compose nuovo.

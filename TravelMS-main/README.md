# Waypoint

A personal travel workspace built from the TravelMS software engineering course project. Waypoint brings daily itineraries, budget alerts, review history, profile settings, expenses, and saved reports into an English interface with a cream and forest-green theme.

## Local setup

Use Node.js 22.12+ or a newer Angular 21-compatible version and a running MySQL server. Node 26.5.0 and MySQL 9.6.0 were used for verification on this Mac. A global Angular CLI installation is unnecessary.

```sh
npm ci
cp .env.example .env
# Edit .env with your MySQL connection details before the next command.
npm run setup -- --demo
npm start
```

If `.env` already exists, keep its working connection details. The default database is `travelms`. Setup needs permission to create that database if absent and alter its tables. It backs up existing business tables to ignored `.local/backups/` JSON files before migration. These files contain account hashes and must remain private. Setup never drops business tables or resets existing passwords.

Open <http://127.0.0.1:4200>. `npm start` starts both the Angular frontend and Express API; Ctrl+C stops both. The API listens on `127.0.0.1:3000` by default. A development proxy sends `/api` requests to the API so cookies work on the frontend's origin. MySQL must continue running separately.

| Account                 | Email                     | Password for a newly seeded account |
| ----------------------- | ------------------------- | ----------------------------------- |
| Workspace owner / ADMIN | `owner@waypoint.local`    | `Waypoint2026!`                     |
| Traveler / USER         | `traveler@waypoint.local` | `Waypoint2026!`                     |

The login page has demo buttons for these local sample accounts. Existing passwords are preserved; after changing a demo password, use the regular sign-in form. Public registration always creates a traveler. Administrators manage accounts in **People**. Legacy accounts without a password hash cannot sign in with a fallback password; an administrator must assign a password through People.

## A solo demonstration

1. Sign in as Traveler and create a trip with valid dates and a budget.
2. Open **View journey** and add activities, transport, accommodation, or notes in **Itinerary**.
3. Sign out, sign in as Owner, and approve the pending trip. **Revise** requires a comment explaining the changes needed. The **Activity** tab records decisions and itinerary changes.
4. Sign in as Traveler, edit and resubmit a rejected trip if needed, then record expenses after approval. Budget alerts appear at 80% usage and show the overrun when expenses exceed the budget.
5. Attach a private receipt from the **Receipt** column, preview it, and create a report from the journey's **Reports** tab. Export PDF/CSV, submit it, then sign in as Owner and approve it.
6. Use **Settings** to update your profile or change your password using the current password.

One computer is sufficient for both roles, the frontend, API, and database. Sample trips show the interface immediately; the core application needs no external account or service. Optional AI assistance uses a separately configured OpenAI API connection.

## Optional AI assistance

- **AI Trip Planner:** generate an English itinerary draft from the trip's dates, budget and your interests. Edit and select activities before saving them together; duplicate imports are skipped and the reviewed action appears in Activity.
- **Smart Receipt Scan:** extract a private receipt into a review form, then explicitly apply corrected USD expense fields. The server rejects stale drafts if the receipt or expense changed.
- **Budget Insights:** explain an exact-cent snapshot of recorded spending and category totals without changing expenses or reports.

Add `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4.1-mini`) and optional `AI_TIMEOUT_MS` to the existing ignored `.env`, then restart the app. Keep working database settings. AI calls require internet access and provider allowance; the relevant inputs are sent to OpenAI only when requested. Without a key, the interface explains that AI is unavailable and manual workflows remain usable. See [AI_SETUP.md](AI_SETUP.md) for setup, data sharing, limits and a complete demonstration.

## Behavior

- **Overview:** real totals, upcoming trips, category spending, recent expenses, and budget alerts linking to affected trips.
- **Trips:** `PLANNED` (Pending approval), `APPROVED`, `REJECTED` (Needs revision), `COMPLETED`. Travelers edit/delete only pending or rejected trips; an edit resubmits a rejected trip. Administrators review trips and complete approved trips. Existing `CANCELLED` records can be displayed.
- **Expenses:** `FLIGHT`, `LODGING`, `FOOD`, `TRANSPORT`, `OTHER`; positive USD amounts to two decimals and dates within the trip dates. The owner is derived from the trip.
- **Reports:** `GENERATED` (Draft) → `SUBMITTED` → `APPROVED`. A report saves its trip and expense snapshot. Later expense edits do not change its saved total or CSV. Travelers delete only their own drafts; administrators can delete reports. Delete associated reports before deleting a trip.
- **People:** administrator-only account management. Self-deletion and self-demotion are blocked; password or role changes revoke that user's sessions.
- **Journey details:** Overview, Itinerary, Expenses, Reports, and Activity tabs keep one trip's records together. Itinerary dates must fall within the trip dates; optional times use HH:MM. Completed/cancelled itineraries are read-only. Changing a trip's dates cannot exclude saved expenses or itinerary items.
- **Review history:** records the signed-in actor, decision, comment, and time. Revision comments are required; approval/completion comments are optional. Profile name changes do not rewrite the saved actor name. Existing trips accumulate history from new actions; setup does not invent past events.
- **Budgets:** spending is calculated from saved expenses in cents. At least 80% usage is flagged; spending above the allocation shows the exact overrun. Zero budgets display a prompt or an overrun without an undefined percentage.
- **Settings:** edit your own name, phone, and one of five built-in avatar styles. Email and role remain owner-managed. Password changes verify the current password, rotate the current session, and revoke all other sessions. No password is returned in profile responses.
- **Receipts:** one private PNG, JPEG or PDF per expense, up to 5 MB. Save an expense first, then use Add receipt in its Receipt column. Replace, preview, download and remove controls are available to the traveler and administrators. Images are decoded and re-encoded; PDFs must be readable, unencrypted and contain up to 50 pages without active scripts or embedded files. The PDF preview renders pages with a locally bundled PDF.js worker and provides Previous/Next controls without relying on a browser PDF plugin. Its code loads only when needed. Content lives in MySQL; normal API lists only return metadata. Deleting an expense also deletes its attachment. Saved reports retain receipt filenames, not a permanent archive of the binary attachment.
- **PDF reports:** journey details, category totals, saved expense rows, receipt names and trip review comments captured at report creation, with wrapping and page numbers. Expense/trip data remains immutable; report approval status reflects the current saved status. Legacy snapshots without reviews remain exportable and show an explicit empty-history message. A bundled OFL font supports Latin and common Chinese text without network access.

## Authentication and scope

Passwords are hashed with bcrypt. Login creates a random token; only its SHA-256 hash is stored in MySQL. The browser receives an HttpOnly, SameSite=Lax cookie with a seven-day expiration. Every business API checks the session, current role, and record ownership on the server. Registration cannot choose an administrator role. Cross-site mutations and unapproved browser origins are rejected; login/registration requests are rate-limited.

The default bind address is loopback for local use. For hosted HTTPS deployment, set `COOKIE_SECURE=true`, configure `FRONTEND_ORIGIN`, replace demo accounts, and use an appropriately restricted database account. Hosting, email-based password reset, payments, and travel booking are outside this local course version. Optional HTTP/HTTPS receipt links remain supported alongside uploads. The upload service is intended for local course use; it does not provide malware scanning for public hosting.

## Commands

| Command                                   | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `npm start`                               | Run frontend and API together                  |
| `npm run setup`                           | Back up and migrate the configured database    |
| `npm run setup -- --demo`                 | Also create idempotent local sample data       |
| `npm run frontend` / `npm run server`     | Run either process separately                  |
| `npm run build`                           | Build the production frontend                  |
| `npm test`                                | Run frontend, provider-contract and API tests  |
| `npm run test:e2e`                        | Build and run two isolated Chromium workflows  |
| `npm run test:all`                        | Run unit, API and browser tests                |
| `npm run backup`                          | Make a private consistent business-data backup |
| `npm run restore -- --help`               | Explain new-database recovery                  |
| `npm run format` / `npm run format:check` | Format or check source files                   |

API tests use uniquely named temporary `waypoint_test_*` databases, never the configured business database. The MySQL account needs CREATE/DROP DATABASE privileges. Test cleanup drops only those test databases.

For a built local version, run `npm run build`, stop development processes, then run `npm run server` and open <http://127.0.0.1:3000>. Express serves the compiled frontend and API on one origin.

For browser tests, install the official test browser once with `npx playwright install chromium`, then run `npm run test:e2e`. Chromium tests use `waypoint_e2e_*` databases on port 4211; port 4211 must be free. They never use the configured business database. Traces, screenshots and HTML reports are ignored by Git.

## Backup and recovery

`npm run backup` writes a private snapshot to `.local/backups/`, including account hashes, business tables and receipt bytes from one consistent database transaction. Login sessions are omitted. Keep this folder private and copy it when moving the project to another computer.

First validate a backup without any database writes:

```sh
npm run restore -- --file .local/backups/YOUR_BACKUP.json --dry-run
```

Then restore to a database name that does not exist:

```sh
npm run restore -- --file .local/backups/YOUR_BACKUP.json --database travelms_recovered
```

Recovery refuses the active database, the backup's source database, system databases and any existing target. It creates the canonical schema, imports only supported tables/columns, verifies row counts and receipt checksums, and preserves password hashes. Saved DDL is never executed. A failed restore removes only its newly created target. Older Waypoint snapshots without receipt/itinerary/history tables are supported; missing tables start empty. The single-file restore limit is 256 MB.

After inspecting the recovered copy, choose whether to set `DB_NAME=travelms_recovered` in `.env` and restart the app. The tool does not change `.env` or replace your current database. All recovered users sign in again because sessions are not restored.

## Project layout

```text
app/
  components/       dashboard, login, trips, journey details, expenses, reports, people, settings
  services/         API client, session identity, expired-session handling
  guards/           authenticated and administrator routes
  shared/           icons, avatars, budgets, review dialog, labels, formatting, page states
  models.ts         frontend data contracts
backend/
  app.js            API, authorization, workflows, CSV export
  features.js       profile, password change, trip details, itineraries, history
  budget.js         budget thresholds and balance calculation
  receipts.js       private receipt validation, storage and downloads
  report-pdf.js     paginated snapshot reports
  backups.js        consistent backup and new-database recovery
  ai-service.js     optional OpenAI provider, schemas, timeouts and usage limits
  ai.js             authorized AI drafts, reviewed imports and receipt application
  itinerary.js      shared validation for manual items and reviewed AI batches
  schema.js         non-destructive legacy migration
  validation.js     request validation and business errors
scripts/
  setup-db.cjs      local backup, migration, sample accounts and data
  dev.cjs           paired frontend/API launcher
  backup-db.cjs / restore-db.cjs  local data management
tests/              isolated MySQL integration and Chromium workflow tests
assets/fonts/       bundled PDF font and OFL license
src/                page metadata, global design system, entry point
public/mark.svg     Waypoint compass mark
setup.sql           canonical CREATE IF NOT EXISTS table definitions
server.js           loopback server and built frontend hosting
db.js               database configuration and connection factory
```

Change colors and typography in `src/styles.css`, navigation/brand copy in `app/app.html`, login copy in `app/components/login/login.component.ts`, and browser metadata in `src/index.html`. Data and labels live in `app/models.ts` and `app/shared/ui.ts`. Preserve the TravelMS course provenance and applicable license/attribution when presenting or sharing this edition.

## Troubleshooting

- **Database unavailable:** start MySQL, check `.env`, and run `npm run setup`.
- **Port already in use:** stop an earlier instance before `npm start`. `PORT` configures the API and proxy together.
- **Slow dependencies in a cloud-synced folder:** make the project available offline and reinstall with `npm ci`; avoid placeholder `node_modules` files.
- **Tests cannot create a database:** use a MySQL account with the permissions above, or run `npm run test:unit` while arranging them.
- **Legacy account cannot log in:** use the valid existing password or assign a new one as an administrator. There is no universal `admin` password.
- **Receipt rejected:** check its extension, actual file content, size and PDF protection/active-content settings. The server returns a specific message.
- **Browser tests fail to start:** install Chromium, ensure port 4211 is free and use a MySQL account with CREATE/DROP DATABASE privileges.

The application remains on Angular 21 with compatible package updates. The MCP SDK dependency override is for the Angular CLI's development tooling and avoids its vulnerable pinned version; it does not add any MCP endpoint to Waypoint. The lockfile records the verified dependency set.

Course materials live at the repository root: `COURSE_PROJECT.md`, `TEST_REPORT.md`, and `DEMO_GUIDE.md`.

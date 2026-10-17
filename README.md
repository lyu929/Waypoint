# Waypoint · Personal Travel Workspace

Waypoint is a personal extension of the TravelMS software engineering course project. It retains the Angular, Express and MySQL architecture and adds an English interface, profile settings, daily itineraries, budget alerts, review history, expense tracking and report exports.

This repository preserves the original course project's `frontend/`, `backend/` and commit history. **The complete current personal edition is in `TravelMS-main/`; use the startup instructions below.** The original course README is retained in [Course baseline](docs/TRAVELMS_COURSE_BASELINE.md). See [GITHUB_GUIDE.md](GITHUB_GUIDE.md) for cloning and updating the repository.

One person can run the entire application on one computer and demonstrate the complete workflow by switching between the Owner and Traveler demo accounts.

## Start on this Mac

Keep MySQL running. The existing `.env` configuration has been preserved; use its working connection details and existing database.

```sh
cd TravelMS-main
npm start
```

Open <http://127.0.0.1:4200>. This command starts both the frontend and backend. Press `Control + C` to stop them.

## First installation on another computer

1. Install and start MySQL, and install Node.js 22.12+ or a newer Angular 21-compatible version.
2. Enter `TravelMS-main` and run `npm ci`.
3. Copy `.env.example` to `.env` and fill in your own MySQL connection details. The default database name is `travelms`.
4. Run `npm run setup -- --demo` to initialize or upgrade the database and create demo accounts.
5. Run `npm start` and open <http://127.0.0.1:4200>.

Setup first backs up existing business records to `TravelMS-main/.local/backups/`, then upgrades the schema while preserving those records. Repeated setup runs retain existing account passwords and avoid duplicate sample trips.

## Demo accounts

| Role                     | Email                     | Password for a newly seeded account |
| ------------------------ | ------------------------- | ----------------------------------- |
| Owner / Administrator    | `owner@waypoint.local`    | `Waypoint2026!`                     |
| Traveler / Standard user | `traveler@waypoint.local` | `Waypoint2026!`                     |

The login page's **Owner demo** and **Traveler demo** buttons sign in to these initialized sample accounts. These accounts are intended for local course demonstrations. After changing a demo account's password, use the regular sign-in form.

## Course demonstration workflow

1. Sign in as Traveler and create a trip in **Trips**, including travel dates and a budget.
2. Open **View journey** and add activities, transport, accommodation or notes in **Itinerary**.
3. Sign out and sign in as Owner. Approve the trip, or select **Revise** and provide a reason. Both roles can view decisions and history in **Activity**.
4. Sign in as Traveler again and add expenses to the approved trip. After saving an expense, upload and preview a PNG, JPEG or PDF from its **Receipt** column. Each file may be up to 5 MB. Budget alerts begin at 80% usage; overspending displays the exact difference.
5. Generate a report from the journey's **Reports** tab or the main **Reports** page. Export PDF/CSV and submit the report, then sign in as Owner to approve it. The PDF includes journey details, category totals, expense rows and trip review comments saved at report creation.
6. Use **Settings** to edit your name, phone number and avatar icon. Password changes require the current password and revoke other sessions.

On the demonstration computer, Vancouver includes daily plans, a revision/resubmission history and USD 120 spending against a USD 100 budget. Portland includes an approved report. A fresh database instead seeds San Francisco, Seattle, New York and Austin; create the Vancouver example manually or privately restore your own backup. Git does not synchronize database records. All interface text is in English, and amounts use USD.

## Completed improvements

- Consistent trip statuses, five expense categories and report statuses restore the approval and editing workflows.
- The backend verifies authentication, administrator privileges and record ownership; standard users can access only their own business data.
- Expiring server sessions and HttpOnly cookies replace reliance on browser-stored roles.
- Dates, amounts, emails, passwords and expense ownership are validated, with clear business errors.
- Saved expense snapshots support report generation, submission, approval and PDF/CSV export. Private receipts support upload, preview, replacement, download and removal.
- Preserving database migrations and demo accounts with hashed passwords replace destructive setup and default-password fallback behavior.
- Profile settings, trip details, daily planning, budget alerts, review comments and activity timelines are connected to the backend.
- Sign-in returns to the requested journey or Settings page. API and browser workflow tests use isolated databases.
- Consistent backups and recovery into a new database preserve password hashes and receipt bytes while leaving the active database unchanged.
- Redesigned login, overview, navigation, trip, expense, report and user pages support desktop and narrow screens.
- Optional AI itinerary drafts, reviewed receipt extraction and budget explanations connect to existing workflows. See [AI setup](TravelMS-main/AI_SETUP.md) to configure your own server-side OpenAI API key; core workflows remain available without AI.

Activity history records new actions after the upgrade; older approval events are not invented. Avatars use built-in icons. Email password reset, maps and multiple currencies are not implemented.

## Backups, recovery and course materials

Run `npm run backup` from `TravelMS-main` to create a private backup. Run `npm run restore -- --help` for recovery instructions. Recovery requires a new database name and does not automatically change `.env`. Detailed steps are in the app README.

Course materials are in English:

- [COURSE_PROJECT.md](COURSE_PROJECT.md): requirements, roles, use cases, architecture, database relationships and status diagrams.
- [TEST_REPORT.md](TEST_REPORT.md): test coverage, results and database isolation.
- [DEMO_GUIDE.md](DEMO_GUIDE.md): a 5–7 minute presentation workflow and speaking notes.

These documents describe the implemented version. Confirm the required submission format against the instructor's rubric.

See the [App README](TravelMS-main/README.md) for installation, structure and limitations, and [PROJECT_NOTES.md](PROJECT_NOTES.md) for the development record. The [Initial inspection report](LOCAL_RUN_REVIEW.md) is retained as historical evidence.

The complete personal edition is included in the private [lyu929/TravelMS](https://github.com/lyu929/TravelMS) repository. Git ignores `.env`, local backups, dependencies and build output; real accounts and database contents remain local. Retain the original project's provenance and applicable attribution, and explain the personal extensions accurately when presenting.

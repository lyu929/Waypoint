# Waypoint Personal Edition: Development Record

Completed on October 6, 2026 (America/Los_Angeles). The work builds on the existing TravelMS course project and local changes, retains the original technology stack and uses the Waypoint name for the English personal edition.

The results below describe each phase at completion. Earlier test counts and statements about unpublished changes are historical; later phases supersede them. See [TEST_REPORT.md](TEST_REPORT.md) for current validation results.

## Phase 1: Original issues resolved

| Original issue                                                                   | Implementation and verification                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inconsistent trip statuses hid approval and editing buttons.                     | Frontend and backend use consistent uppercase statuses; browser trip creation and approval succeeded.                                                   |
| Flight, Hotel and Meals could not be recorded.                                   | Five distinct categories are supported; API tests covered all five and the browser saved a meal expense.                                                |
| Report generation failed with a database error.                                  | Reports follow GENERATED → SUBMITTED → APPROVED; generation, CSV download, submission and administrator approval succeeded in the browser.              |
| The backend did not verify authentication, roles or ownership.                   | Server sessions, HttpOnly cookies, administrator checks and ownership checks reject unauthenticated requests, forged roles and cross-user access.       |
| Conflicting setup scripts could delete existing data.                            | The default database is consistently `travelms`; setup backs up data before migration, and demo passwords use bcrypt hashes.                            |
| Invalid dates, amounts, emails and missing records produced incorrect responses. | Backend validation returns clear errors, the interface displays them and regression tests pass.                                                         |
| Tests were not discovered and still asserted an old template.                    | Test discovery was repaired; 10 frontend tests and 11 MySQL API tests passed at this phase.                                                             |
| The interface lacked a distinct personal identity.                               | English branding, overview statistics, navigation, travel illustrations, trip cards, expense tables, report cards and narrow-screen layouts were added. |

### Local acceptance

- One `npm start` command runs both frontend and backend; MySQL remains a separate service.
- The production build succeeded and 21 automated tests passed. API test databases were removed afterward.
- In the browser, Owner created and approved a fictional Portland trip. Traveler recorded a USD 12.50 meal expense, generated a snapshot report, downloaded CSV and submitted it; Owner approved it.
- Desktop at 1280px and narrow screens at 390px were checked, along with session restoration after refresh and sign-out.
- The original user and trip were preserved. Fictional demo accounts and records labeled Demo were added. Pre-migration backups are in the ignored `TravelMS-main/.local/backups/` folder.

Screenshots: `review-evidence/waypoint-dashboard.jpg`, `waypoint-trips.jpg` and `waypoint-mobile.jpg`.

## Phase 2: Personal features

Completed on October 6, 2026.

- **Settings:** name, phone number, five avatar icons and password changes that verify the current password. A successful change rotates the current session and revokes other sessions. Isolated test accounts verified this behavior; the original account password was unchanged.
- **Journey details:** Overview, Itinerary, Expenses, Reports and Activity tabs. Daily activities, transport, accommodation and notes support creation, editing and deletion. The backend checks dates and ownership.
- **Budget alerts:** warnings begin at 80% usage; overspending shows the exact difference. Calculations use cents to avoid rounding errors, and Overview links to affected trips.
- **Reviews and history:** returning a trip requires a reason. Events record the actor, comment, status changes, itinerary updates and time. History begins with new actions; no past events were fabricated.
- **Browser walkthrough:** a fictional Vancouver trip was returned, given a revised itinerary, resubmitted and approved. A USD 85 expense triggered the budget warning; another USD 35 expense produced a USD 20 overrun. A USD 120 report was generated, submitted and approved from journey details.
- **Preservation:** field-by-field comparison with the pre-phase backup confirmed that 3 accounts, 6 trips, 10 expenses, 1 report and existing password hashes were unchanged. Test databases were cleaned up.
- **Verification:** five API tests were added, bringing this phase to 10 frontend and 16 API tests. They cover profile permissions, password session revocation, itinerary access and validation, review events and budget thresholds. The production build and desktop/390px layouts passed.

Screenshots: `review-evidence/waypoint-settings.jpg`, `waypoint-trip-detail.jpg`, `waypoint-itinerary.jpg`, `waypoint-activity.jpg` and `waypoint-detail-mobile.jpg`.

The core business workflow could be demonstrated independently at this stage. Course explanations can focus on status transitions, access control, validation, migrations, snapshot reports and responsive design.

The project retains its TravelMS provenance. The instructor's rubric was not provided, so additional requirements for UML notation, traceability, team contributions, deployment or submission formats still need to be checked.

At the end of Phase 2, booking, payments, email password reset, receipt uploads, PDF export and public hosting were not implemented. Receipt uploads and PDF export were completed in Phase 3. This edition uses USD and is intended for local course demonstrations.

No commits, pushes, pull requests or public publication were made during Phases 1–2. `LOCAL_RUN_REVIEW.md` describes the version before these repairs and should not be used to assess current functionality.

## Phase 3: Completion and validation

Completed on October 6, 2026 (America/Los_Angeles).

- **Sign-in return page:** protected Settings and journey pages return to the requested location after sign-in. Invalid or external destinations fall back to Overview.
- **Private receipts:** PNG/JPEG/PDF upload, replacement, preview, download and removal, with a 5 MB limit, content validation and ownership checks. Image metadata is removed; PDFs with scripts, active operations or embedded files are rejected. Ordinary lists return metadata instead of file bytes.
- **PDF receipt preview:** a local PDF.js renderer provides page navigation and an error message if loading fails. It fixes blank previews caused by browser-dependent PDF viewing. The preview code loads on demand; desktop and mobile checks passed.
- **PDF reports:** journey details, category totals, expense rows, receipt names, saved trip review comments and pagination. Trip and expense values come from the creation snapshot; report approval status reflects the current saved status. Footer-only blank pages were fixed, and rendered checks covered international text wrapping and long tables.
- **Backup and recovery:** consistent backups include account hashes, business records and receipt bytes. Recovery accepts a new database only, leaves current and existing databases intact and does not change `.env`. Actual recovery was tested in an isolated database; the business database was only backed up and used for a recovery dry-run.
- **Automated browser tests:** sign-in return behavior, profile settings, revisions and resubmission, itinerary, image/PDF previews, report export and approval, and 390px layouts. All 12 frontend, 20 API and 2 browser tests passed. The production build's initial assets totaled 444.92 kB. Formatting and whitespace checks passed; dependency auditing reported 0 known vulnerabilities at verification time.
- **Preservation:** all original fields in 3 users, 7 trips, 12 expenses, 2 reports and their password hashes matched the pre-phase backup. This phase added one fictional Demo receipt to the existing Vancouver sample and one USD 120 snapshot report. All automated test databases were removed.
- **Private backup:** `TravelMS-main/.local/backups/travelms-1791352705496-ba3d71.json` passed recovery validation. Backups are ignored and should remain private.
- **English course documents:** `COURSE_PROJECT.md` covers requirements, use cases, statuses, architecture, ER relationships, design and provenance; `TEST_REPORT.md` records validation; `DEMO_GUIDE.md` provides a 5–7 minute presentation script. Submission details still need to be checked against the course rubric.

Sample PDF: `TravelMS-main/output/pdf/waypoint-demo-report.pdf`.

Screenshots: `review-evidence/waypoint-receipt-preview.png`, `waypoint-receipt-mobile.png`, `waypoint-pdf-receipt-preview.png`, `waypoint-pdf-receipt-mobile.png` and `waypoint-pdf-reports.png`.

The version supports independent local course demonstrations. Booking, payments, email password reset, multiple currencies and public hosting remain outside its scope. No code was committed or pushed during Phase 3.

## GitHub integration and English documentation

The personal edition was subsequently added to the existing private `lyu929/TravelMS` repository on `master`, in commit `2c9c1119`. The original split course source and repository history were retained. Reproducible dependencies and build caches were removed from tracking. Real database records, local configuration and backups were excluded from the upload.

The repository homepage, development record and historical inspection report have now been translated into English. Interface text, business messages and maintained source comments were already English. The international-text PDF test uses Unicode escapes to preserve its existing coverage while keeping the source readable in an English project.

These latest language edits are local working changes. The user will review, commit and push them personally; no commit or push was performed for this language revision.

## Phase 4: Optional AI assistance

Implemented on October 17, 2026 (America/Los_Angeles), after the user's English documentation commit `8e2aa32e`.

- **AI Trip Planner:** English draft generation from existing trip context and interests, editable/selectable activity cards, atomic reviewed imports, duplicate prevention and verified Activity events. Existing manual itinerary validation is shared by both entry paths.
- **Smart Receipt Scan:** private inline PNG/JPEG/PDF extraction into a review dialog. Only explicit confirmation updates the expense fields. USD and trip-date checks remain enforced, and receipt/expense fingerprints reject stale drafts. Saved report snapshots are preserved.
- **Budget Insights:** the server computes an exact-cent snapshot of category spending and budget state, then requests an explanation without changing business records.
- **Optional provider:** server-side environment configuration, strict structured outputs, no automatic retry, bounded timeouts, per-user request limits and no overlap. The normal app has no fabricated AI mode. Core workflows remain available without an API key.
- **English documentation:** `TravelMS-main/AI_SETUP.md` explains local setup, feature workflows, transmitted data, limits and live-provider verification. The README, course requirements and demonstration guide include the new features.
- **Verification:** provider-contract tests and isolated MySQL/browser tests use deterministic test fixtures. No real API key was present, no live AI request was made, and no business record or current account password was changed by this phase. Latest results are recorded in `TEST_REPORT.md`.

These AI changes remain local for the user to review, commit and push personally. No Git history, access settings, commit or remote push was changed.

# Waypoint Validation Report

This report covers local functional verification, not a formal penetration test or proof that all possible defects are absent. The original baseline was verified on October 6, 2026. The optional AI extension and full regression were verified on October 17, 2026 (America/Los_Angeles); latest results appear below.

## Automated checks

| Check                       | Purpose                                                                                                                           | Command                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Frontend unit tests         | Session restoration, shell behavior, labels/dates and safe return-page handling.                                                  | `npm run test:unit`    |
| MySQL API integration tests | Authorization, validation, status transitions, snapshots, CSV/PDF, receipts and backup/recovery.                                  | `npm run test:api`     |
| Chromium browser tests      | Login return behavior, profile persistence, Traveler/Owner workflow, itinerary, receipt preview, report export and 390px layouts. | `npm run test:e2e`     |
| Production build            | Angular compilation and production asset budget.                                                                                  | `npm run build`        |
| Source formatting           | Consistent source formatting.                                                                                                     | `npm run format:check` |
| Dependency audit            | Known vulnerabilities reported by the current npm advisory database.                                                              | `npm audit`            |

## Important test cases

| Area              | Positive case                                                                        | Negative or boundary case                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Session           | Valid account restores after refresh.                                                | Unauthenticated API calls fail; expired sessions require sign-in.                                                |
| Roles / ownership | Owner reviews; Traveler reads their own data.                                        | Forged role/owner identifiers and cross-user reads/writes fail.                                                  |
| Return page       | Login returns to Settings or an individual journey.                                  | External, malformed and unknown destinations fall back to Overview.                                              |
| Trip / itinerary  | Correct dates, optional HH:MM time and supported item types save.                    | Reversed/out-of-range dates, invalid times and completed-trip edits fail.                                        |
| Review            | Required revision reason and verified actor are recorded.                            | Missing or excessive comments fail; body data cannot forge the actor.                                            |
| Expenses / budget | Five categories, positive cents and valid trip dates.                                | 79.99%, 80%, 100%, overrun and zero-budget cases; invalid values rejected.                                       |
| Receipts          | Valid PNG/PDF can be uploaded, replaced, previewed/downloaded and removed.           | Unsupported types, mismatched content, oversized files, active PDF and cross-user access fail.                   |
| Reports           | Snapshot totals remain stable, exports require authorization and long PDFs paginate. | Cross-user export fails; later expense changes do not update the snapshot.                                       |
| Password          | Correct current password changes hash and rotates the session.                       | Wrong current password / invalid confirmation fail; other sessions are revoked on success.                       |
| Recovery          | New copy preserves rows, password hashes and receipt bytes; sessions start empty.    | Unknown tables, corrupt checksums, active/source/existing database targets fail; supplied DDL is never executed. |

## Isolation and preservation

API tests create uniquely named `waypoint_test_*` databases and remove them afterward. Browser tests create a `waypoint_e2e_*` database with fictional accounts and use a separate local port. Recovery is tested only on a temporary target. The configured `travelms` business database is not used for automated workflows.

Setup makes a private backup before migration. Existing records and password hashes are compared with the pre-upgrade backup. Browser demonstration records are fictional and distinguishable from the original course data.

## Manual verification

Review the new controls in the running app, inspect receipt previews, export an existing report, render PDF pages and inspect table alignment, wrapping, pagination, footers and Unicode text. Check desktop and mobile widths. Screenshots are stored under `review-evidence/`; test traces and local backups are ignored by Git.

## Original baseline — October 6, 2026

| Check                       | Result                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend unit tests         | 12 passed; no failures.                                                                                                                                                                           |
| MySQL API integration tests | 20 passed; no failures.                                                                                                                                                                           |
| Chromium browser workflows  | 2 passed; no failures. PDF preview checks include nonblank rendered pixels, two-page navigation and a 390px viewport.                                                                             |
| Total                       | 34 automated tests passed.                                                                                                                                                                        |
| Production build            | Passed; initial assets 444.92 kB, below the 500 kB warning budget. PDF.js loads separately when a PDF preview is opened.                                                                          |
| Formatting / Git whitespace | Passed.                                                                                                                                                                                           |
| npm dependency audit        | 0 known vulnerabilities reported for the final lockfile at verification time.                                                                                                                     |
| Data preservation           | All original fields in 3 users, 7 trips, 12 expenses and 2 reports match the pre-upgrade backup, including password hashes. Only one fictional receipt and a new demonstration report were added. |
| Backup command / dry-run    | Private backup created; validation passed for all 7 supported business tables, including receipt bytes.                                                                                           |
| Test cleanup                | No temporary API, browser or recovery test databases remain.                                                                                                                                      |

The running development app was restarted with the final backend and frontend. Image receipt previews were inspected manually on desktop and at 390px; rendered PDF receipt previews were inspected in desktop and mobile screenshots. The one-page Vancouver sample report and all four pages of a synthetic long report were rendered and inspected for wrapping, repeated table headers, Unicode text and page footers. The footer-only blank page and browser-dependent blank PDF preview found during validation were fixed.

Evidence is in `review-evidence/waypoint-receipt-preview.png`, `waypoint-receipt-mobile.png`, `waypoint-pdf-receipt-preview.png`, `waypoint-pdf-receipt-mobile.png` and `waypoint-pdf-reports.png`. A fictional sample export is saved as `TravelMS-main/output/pdf/waypoint-demo-report.pdf`.

Before GitHub publication, the prepared source copy was installed with `npm ci` using the committed lockfile. `npm run test:all` again passed all 34 tests and the production build (444.92 kB initial assets); formatting passed. The existing TravelMS repository's 36 original application source files were retained unchanged. Previously tracked dependency/build caches were removed from the current tree; original commits remain in history. No local configuration, backup or current private credentials are staged for upload.

## AI extension and regression — October 17, 2026

The final `npm run test:all` completed successfully against the updated source.

| Check                   | Result                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend unit tests     | 12 passed.                                                                                                                                                |
| Backend checks          | 32 passed: 20 original API tests, 4 AI provider/limiter tests and 8 AI integration tests.                                                                 |
| Chromium workflows      | 4 passed: 2 original workflows, 1 complete AI review workflow and 1 unconfigured-AI/manual-planning workflow.                                             |
| Total                   | 48 automated tests passed; no failures or skipped tests.                                                                                                  |
| Production build        | Passed; 471.22 kB initial assets, below the 500 kB warning budget. PDF.js remains a separate lazy chunk.                                                  |
| Layout review           | AI planner, receipt review and budget screenshots inspected; mobile workflows check 390px document width. Receipt action labels wrap as complete buttons. |
| Formatting / whitespace | Prettier and Git whitespace checks passed.                                                                                                                |
| Dependencies            | No package or lockfile changes. The earlier dependency audit above is historical, not a new October 17 audit.                                             |
| Business data           | Automated workflows used only uniquely named temporary databases. Existing local configuration, business records and passwords were not changed.          |
| Live provider           | Not verified: no real API key was configured. Tests used an explicit deterministic provider and made no billable AI calls.                                |

AI coverage includes session/ownership checks before provider calls, no writes during generation, invalid provider output, trip-date and read-only-state rules, atomic selective imports, duplicate/retry/concurrent-import handling, full-size edited notes, unchanged size limits on other requests, exact category budget snapshots, private inline receipt input, reviewed USD application, stale receipt/expense detection and bounded PDF scanning. Provider tests cover strict request schemas, server credentials, disabled storage, refusals, incomplete output, invalid JSON, unavailable credentials, usage limits, network failures, timeouts and per-user concurrency/limit expiry.

The browser workflow edits an AI draft title, deselects an activity, saves the selected batch, reloads to verify persistence, checks Activity, switches roles for trip approval, uploads a fictional receipt, edits its extracted amount, confirms the expense update and checks the resulting budget explanation. A separate workflow verifies that missing AI configuration leaves manual itinerary creation usable.

Selected screenshots are saved in `review-evidence/waypoint-ai-planner-mobile.png`, `waypoint-ai-receipt-mobile.png` and `waypoint-ai-budget-desktop.png`. They show deterministic test-provider output, not live AI results. Setup and a real-provider demonstration are documented in `TravelMS-main/AI_SETUP.md`.

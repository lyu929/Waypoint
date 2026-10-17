# Waypoint AI Assistance

Waypoint includes three optional AI workflows. The English interface, trip approvals, manual itinerary editing, expenses, receipts, reports and budget calculations work without an AI connection.

## Connect OpenAI

1. Open the existing `TravelMS-main/.env` file locally. Keep all working MySQL settings. Do not replace this file with `.env.example` if it already exists.
2. Add these settings. Replace the placeholder with your own OpenAI API key:

   ```dotenv
   OPENAI_API_KEY=replace_with_your_own_key
   OPENAI_MODEL=gpt-4.1-mini
   AI_TIMEOUT_MS=45000
   ```

3. Stop Waypoint with Ctrl+C, then run `npm start` from `TravelMS-main` and reload the browser. No database migration is needed for these AI features.
4. Open a trip, choose **Itinerary**, and select **Plan with AI**. The **Generate plan** button becomes available after the connection configuration is detected.

The key stays on the Express server. `.env` is ignored by Git. Do not paste the real key into Angular source, screenshots, documentation or a chat. Use your own API account with access to the configured model and sufficient usage allowance. Changing the model requires a model that supports the Responses API, structured outputs and image/PDF input for receipt scanning. The default model supports text/image input and structured outputs; see the [model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Availability indicates that a key is configured, not that a billable provider request has already succeeded. An invalid key, unavailable model, exhausted allowance, offline connection or timeout produces an English error when generating. The app does not retry billable requests automatically.

## AI Trip Planner

1. Use a pending, rejected or approved trip of up to 14 days.
2. Select **Itinerary → Plan with AI**.
3. Describe interests, accessibility needs or other preferences, then choose Relaxed, Balanced or Active.
4. Select **Generate plan**. Generation sends the destination, dates, trip purpose, USD budget, existing itinerary and preferences to OpenAI. It does not send account credentials or email addresses.
5. Review the returned draft. Edit dates, times, types, titles, locations and notes; uncheck or remove unwanted items. No itinerary changes have been saved yet.
6. Select **Add selected activities**. All selected entries are validated and saved together. Matching entries are skipped, including repeated or concurrent saves. Existing itinerary items are retained.
7. View **Activity** for the reviewed import event.

Drafts stay in memory until saved and are discarded when leaving the itinerary view or reloading. Changing the trip's context clears an older draft. AI suggestions are not live price quotes, opening-hour checks, reservations or bookings. Verify these details yourself before traveling.

Generation accepts up to 1,000 characters of preferences and up to 200 existing itinerary items. A draft can contain up to 42 items. Completed and cancelled itineraries remain read-only.

## Smart Receipt Scan

1. Save an expense and attach a fictional or appropriate PNG, JPEG or PDF receipt using the existing receipt controls.
2. Select **Scan with AI**, review the data-sharing notice, and select **Scan receipt**.
3. Check the suggested merchant, amount, printed currency, date, category and description. Missing or unreadable values are left empty for you to enter. Warnings remain visible.
4. Edit the fields and select **Apply reviewed details**. This replaces only the existing expense's amount, date, category and description; the receipt and saved report snapshots are preserved.

The file is sent directly from the server as an inline image or PDF. Private attachments are not made public, and remote receipt links are not fetched for scanning. Receipt scanning supports files up to 5 MB and PDF receipts up to 5 pages. The ordinary receipt viewer still supports the existing 50-page upload limit.

Only confirmed USD amounts can be applied. The app does not convert currencies. For a foreign-currency receipt, calculate the USD amount separately and edit the expense manually. Dates must be within the trip dates, and the trip must still allow expense recording. If the expense or receipt has changed since scanning, applying the stale draft is rejected; scan it again.

## Budget Insights

Open **View journey → Expenses → Explain my budget**. The server first calculates an exact-cent snapshot of the budget, spending, category totals, expense count, remaining amount and overrun. OpenAI receives the trip details and these aggregate values, not the receipt files or account credentials.

The interface shows server-calculated amounts separately from AI commentary. AI suggestions are explanatory and do not change expenses, approvals or saved reports. Refresh the insights after changing expenses; each explanation describes the snapshot taken when it was generated.

## Limits and privacy

- All AI routes require a current session and enforce the existing trip/expense ownership rules. Owners can access records across the workspace.
- AI requests have a shared per-user limit of 12 requests per 15 minutes and allow one request at a time. Restarting the local server resets this in-memory limit.
- The default provider timeout is 45 seconds; `AI_TIMEOUT_MS` can configure 1–60 seconds.
- The server uses strict output schemas and revalidates results before displaying or saving them. Unexpected, refused or incomplete responses produce a bounded error.
- OpenAI requests use `store: false`; this does not mean that the provider never processes or retains any data under its API policies. Send only information appropriate for the service you choose.
- No new dependency, local model download, public hosting, automatic booking or background AI job is required.

Implementation references: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [image understanding](https://developers.openai.com/api/docs/guides/images-vision), [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), and [server-side credentials](https://developers.openai.com/api/reference/overview).

## Verification

`npm test` includes provider-contract and isolated MySQL integration tests for drafts, permissions, atomic imports, duplicate prevention, exact budget snapshots, receipt review, stale-data detection, error handling and rate limits. `npm run test:e2e` includes desktop/mobile AI review workflows and the unconfigured-AI state.

Automated tests use an explicit deterministic provider in isolated test servers. They never spend real API credits or send business records to OpenAI. The normal application does not include a fake AI mode. A successful live provider call must be verified separately after configuring your own key.

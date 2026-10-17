# Waypoint Course Demo

The interface and this presentation script are in English. Allow about 5-7 minutes. MySQL must be running; start the app with `npm start` from `TravelMS-main` and open `http://127.0.0.1:4200`.

| Time      | Show                              | Suggested explanation                                                                                                                                                                                                  |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:40 | Login and Overview                | "Waypoint is my personal extension of the TravelMS course project. It brings trip requests, daily plans, expenses and reports into one workspace. I can run the complete system locally."                              |
| 0:40-1:30 | Traveler -> Trips -> View journey | "A Traveler can only manage their own records. This journey has dates, a budget and a daily itinerary. Activities, transport, accommodation and notes are organized by day."                                           |
| 1:30-2:30 | Owner review / Activity           | "The Owner reviews pending trips. Returning a request requires a reason. The Traveler can make changes and resubmit. The Activity tab keeps the decision, actor, comment and time."                                    |
| 2:30-3:30 | Vancouver budget and Expenses     | "Budget warnings begin at 80 percent. This example has a 100-dollar allocation and 120 dollars of expenses, so the app shows a 20-dollar overrun. A receipt can be attached and previewed privately."                  |
| 3:30-4:30 | Reports -> Export PDF / CSV       | "A report saves a snapshot of the trip and expenses. Later edits do not alter its saved totals. PDF presents the journey, category totals, detailed expenses and recorded trip reviews. CSV supports spreadsheet use." |
| 4:30-5:10 | Settings                          | "A user can update their profile and avatar. Password changes verify the current password and revoke other sessions. The Owner manages accounts separately."                                                           |
| 5:10-6:00 | Design / test documentation       | "The application validates access on the server. Tests cover permissions, workflows, files, snapshots and recovery. Browser tests demonstrate the user journey using a separate database."                             |

Use the existing Vancouver sample for history and budget examples. Portland has an approved report. For a live approval demonstration, create a new trip and switch accounts using Sign out and the demo login buttons. Demo buttons sign in to separate sample accounts; they do not change one account's role.

Vancouver and Portland are existing records on the demonstration computer. A fresh GitHub clone seeds other fictional trips; recreate the Vancouver example with a USD 100 budget and USD 120 total spending before presenting, or privately restore your own backup into a new database. Git does not synchronize real database records.

For receipts, use fictional demonstration files. Save an expense before attaching a receipt from its Receipt column. Supported formats are PNG/JPEG/PDF up to 5 MB. PDF receipts render in the app's preview with Previous/Next page controls; download the file for use in another PDF reader.

Do not change a real account password during the presentation. Explain password behavior using the interface and test evidence. Backup/recovery can be explained from the documented commands; an actual recovery should use a new database and never switch the live demo's configuration mid-presentation.

When asked about limitations: the version is local, USD-based and has no booking, payment, email reset or public hosting. Existing records only acquire activity history from new actions. Preserve credit for the original TravelMS project and explain the personal extension accurately.

## Optional AI demonstration

Configure the OpenAI connection before presenting using `TravelMS-main/AI_SETUP.md`. Use fictional trip preferences and receipts; AI requests send the relevant inputs to OpenAI. This part needs internet access and provider allowance. Do not open a real API key on the projector.

1. Create a short Chicago trip, open **Itinerary → Plan with AI**, and enter: "Museums, local food and time to relax." Choose Relaxed and generate a plan.
2. Explain: "The AI creates a draft. I can edit it and choose which activities to keep. The app checks every date and saves only the activities I confirm."
3. Change an activity title, deselect another and select **Add selected activities**. Show the saved plan and its Activity event.
4. On an approved trip, attach a fictional USD receipt and select **Scan with AI**. Explain: "The extracted amount, currency and date must be reviewed. Applying the result updates the expense, while existing report snapshots remain unchanged."
5. Open the trip's **Expenses → Explain my budget**. Explain: "The server calculates the amounts; AI helps explain this saved spending snapshot."

If the provider is unavailable, show the English connection/error state and continue with manual planning. Automated test fixtures verify the UI without real API calls; describe them as test fixtures, not as live AI output.

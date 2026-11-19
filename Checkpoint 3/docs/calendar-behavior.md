# Google Calendar: intended behavior

This page describes how Google Calendar is meant to behave in InboxToTask for CP4: what the user
sees, what the app writes to Google and when, and the contract between the backend and the
designed screens. It is the target, not a status report. What is built, tested and deployed is in
[current state](../CURRENT_STATE.md); the earlier design and rollout steps are in the
[Calendar plan](calendar-integration-2026-11-05.md); tables and functions are in the
[storage contract](../app/supabase/STORAGE.md).

## Rules that hold everywhere

- **Calendar is optional.** The app works without it, and downloading a calendar file (.ics) is
  always offered instead.
- **Nothing is written to Google Calendar without its own confirmation.** Approving a task, a
  task edit or a cancellation never creates, changes or removes an event by itself. Each write
  follows a Calendar-specific action the user chose.
- **The app only touches events it created.** It asks Google for permission over events it
  created (`calendar.events.owned`), and it checks its own marker on an event before acting on it.
- **One event per task at a time,** in the primary calendar of the one connected Google account.
- **No pressure to use Calendar.** A missing Calendar permission is never shown as a warning or
  status on cards or the dashboard.

## Connecting and disconnecting

- **Onboarding:** the Connect step has a checkbox, unticked by default, to also let the app add
  events the user approves to Google Calendar. Ticked, Google shows one consent screen for Gmail
  and Calendar. Unticked, it asks for Gmail only. There is no separate Calendar step.
- **Later, from a task:** choosing Add to Calendar without Calendar permission offers Google
  Calendar or a calendar file. Choosing Google Calendar sends the user to Google's consent screen
  and returns them to the same task's form with their entries kept. Nothing is created until they
  confirm there. Cancelling at Google returns them with their entries kept and nothing created.
- **Settings:** the Google connection shows whether it covers Gmail only or Gmail and Calendar.
- **Disconnect Calendar only:** Google cannot remove one permission, so this disconnects Google
  completely and then starts a Gmail-only reconnect. The user is told this first. If they cancel
  at Google, Gmail stays disconnected. Events already created stay in Google.
- **After Calendar is disconnected:** tasks whose events were added earlier keep their "Added to
  Google Calendar" line, because the events still exist. Any Calendar action on them asks the user
  to authorize Calendar first ("Authorize Google Calendar to change this event") and then returns
  to where they were.
- **A different Google account:** event records belong to the Google account that created them.
  Connecting a different account hides them.

## Adding an event

- **Where it starts:** an open, approved task without an event shows **Add to Calendar**.
  Completed and cancelled tasks do not offer it.
- **The form** is a compact card in the style of Google's quick-create event: title; date, start
  and end on one line; the time zone beneath as read-only text, shown for timed events only
  ("Times are in Central Time."); and a read-only destination row,
  "Calendar · Primary only", with the connected account.
- **The task's email:** above the form, this dialog, Manage event and Export calendar file show
  the email the task came from (the one that created it, or the Passive email for a task made with
  Turn into task) as "From the email": sender, subject, sent time, the deadline's wording when the
  email stated one, the saved excerpt or "The saved excerpt has expired.", and Open in Gmail. It
  uses only text the app already saved; if the source emails did not load, it is left out.
- **What is filled in:** every field the app has from the task. A field it does not have, or is
  unsure of, stays blank. Blank required fields are outlined, and the create button stays disabled
  until they are filled.
- **All day:** an "All day" checkbox is always available and starts unticked. Ticking it hides the
  times and creates an all-day event. A task with only a date opens with the date filled in and
  the times blank, so the user enters times or ticks All day. The title of an all-day event is the
  task title, with no "Due:" prefix.
- **Times:**
  - Task has a start and an end: both are filled in.
  - Task has a start only: the end is filled in as 30 minutes after the start.
  - Task has no time: both stay blank, and nothing is filled in after the user types a start.
  - When the form opened with times filled in from the task, changing the start moves the end by
    the same amount, until the user edits the end themselves.
- **Confirming** creates the event in the primary calendar. A toast confirms it, with a **View in
  Google Calendar** link that works like the card's link (see "What the task card shows"). Nothing
  opens by itself after adding an event. There is no timed Undo.
- **Cancel** in the form, at any point before confirming, sends nothing to Google.
- **Events only.** The app does not create Google Tasks.

## What the task card shows

- **No event:** Add to Calendar.
- **Has an event:** "Added to Google Calendar · <date and time>" from the saved details, and one
  **Manage event** action. This survives leaving, returning and refreshing.
- **The calendar line is a link** that opens the event in Google Calendar in a new tab. A click
  first asks Google whether the event still exists:
  - If it does, the event opens and the card's details are refreshed from Google.
  - If it was deleted in Google, no Google page opens. The app says "This event was deleted in
    Google Calendar. You can add it again." and the task returns to Add to Calendar.
  - If Google cannot be asked (no Calendar permission, or Google unreachable), the saved link opens.
- **Returning from an event:** when the user comes back to the app's tab after opening an event
  from it, the app reads that one event again and updates its card.
- The card uses the details the app saved. They are refreshed whenever Manage event reads the
  event from Google, when the event's link is clicked, and on returning from it. A plain dashboard
  load does not ask Google.

## Managing an event

Opening **Manage event** reads the event from Google and shows the form with its current details
and three actions.

- **Save changes** updates the same event; it never creates a second one.
  - If saving fails, the form stays open with the user's entries.
  - If the event was changed in Google after the form opened, the save is refused, the form says
    "This event changed in Google Calendar" and offers to load the latest details. The app never
    silently overwrites a change made in Google.
  - If the event was deleted in Google meanwhile, the form says so and the task returns to Add to
    Calendar.
- **Open in Google Calendar** opens the event there.
- **Remove from calendar** asks "Remove this event from your Google Calendar?" and then deletes
  the event as it is now in Google, including changes made there. No guests are notified.
  - Afterwards a toast says it was removed and the task returns to Add to Calendar. It can be
    added again, as a new event.
  - An event already deleted in Google counts as removed, not as an error.
- **When the event cannot be read** (no Calendar permission, or Google unavailable), the form
  shows the app's saved details with a note.
- **When Google says the event was deleted,** the form says "This event was deleted in Google
  Calendar", the app records it as removed and the task returns to Add to Calendar.
- **When the event was changed in Google,** the form shows Google's details and the card's summary
  is updated to match.

The app notices changes made in Google only when Manage event is opened, when an event's link is
clicked, and when the user returns to the app after opening an event from it. It does not check
Google on a dashboard load.

## When the task changes later

- **Deadline changed** (an approved change from a newer email, or a manual edit) on a task with
  an event: the task is saved first. Then a follow-up asks, for example, "Deadline updated to
  Friday. Move your calendar event?" and shows the event's current date and time.
  - **Review calendar event** opens the form with the current schedule and the new deadline for
    reference; Save changes updates the same event.
  - **Keep current time** closes it. The new deadline stays saved and the event is unchanged.
  - **One-click move:** when the task's deadline is the time something happens (a meeting) and
    the change gives a new time, the follow-up also offers a button naming the exact new time,
    such as "Move to Dec 1, 3:00–3:30 p.m.". With a new start and no new end, the event keeps its
    current length. A toast then shows the new and old times. For a deadline something is due by
    or before, there is no one-click, because the event may be a work block placed earlier. For a
    change of date with no time, there is no one-click either: Review calendar event opens the
    form with the same times on the new date.
  - If the event changed or was deleted in Google, or Calendar permission is missing, the
    one-click does not write. It opens the form with Google's details, reports the deletion, or
    asks to authorize Calendar.
- **Title edited:** no prompt. The event keeps its title until the user changes it in Manage
  event.
- **Task completed:** nothing happens to the event.
- **Cancellation approved** on a task with an event: a follow-up asks "Task cancelled. Remove its
  calendar event too?" with **Remove** (no second confirmation) and **Keep**. Keep leaves the
  event; it can still be removed later from the cancelled task.
- **Completed and cancelled tasks** keep the calendar line and Manage event, with Open in Google
  Calendar and Remove from calendar. Save changes and Add to Calendar are not offered on them.
- **Task deleted** while it has an event: the app first asks "Also remove its calendar event?".
  Yes removes the event and then deletes the task. No says the event stays in Google and the app
  will no longer manage it, then deletes the task.
- **Task moved back to Passive** (a task the user made from a Passive email) while it has an
  event: the app first asks "Keep the calendar event?". Remove deletes the event through the same
  removal as Remove from calendar and then moves the task back; if removal fails the task is not
  moved. Keep says the event stays in Google and the app will no longer manage it, then moves the
  task back. Undo in the "Task created" pop-up never touches Calendar.
- **Task changed while the Add to Calendar form is open:** if the task was edited, completed,
  cancelled or deleted before the user confirms, nothing is sent to Google and the user is asked
  to reopen the form on the current task.

## When a result is uncertain

- **Status updates automatically:** when the form or Manage event opens, after a failed attempt,
  when the user returns to the tab, and every few seconds while a request is in progress, showing
  "Checking…". There is no Reload status button.
- **Lost result:** if the app cannot tell whether Google made the change, the form says so (for
  example "We couldn't confirm whether the event was added") and shows **Retry**, with the fields
  locked to what the user confirmed. Retry is a button because it may write to Calendar.
  - Retrying a create looks for the event in Google first and creates it only if it is absent, so
    there is never a duplicate.
  - Retrying an update sends the same values again.
  - Retrying a remove treats an already-deleted event as removed.
- **Google refuses** (for example the details are invalid): the user can correct the form and try
  again.
- **Two requests at once** for the same task: the second is refused as busy.

## Backend contract for the designed screens

The names below are the intended contract. Where the code differs, the code and the storage
contract are authoritative and this page should be corrected.

- **One function, four actions.** `calendar_event` takes an `action`: `create` (the default when
  absent), `read`, `update` or `remove`. Each action accepts only its own fields; anything else is
  refused as `INVALID_REQUEST`.
  - `create`: `{ taskId, taskRevision, draft }`
  - `read`: `{ action: "read", taskId }`
  - `update`: `{ action: "update", taskId, version, draft }`, where `version` comes from `read`
  - `remove`: `{ action: "remove", taskId }`
- **Draft shape:** `{ title, date, allDay, timeZone }`, plus `startTime`, `endDate` and `endTime`
  for a timed event. An all-day event covers one day.
- **Version:** Google's version string for the event, returned by `read` and `update`. Send it
  back unchanged, including when retrying a lost update.
- **Results** (HTTP 200):
  - create: `{ state: "succeeded", eventUrl }`.
  - read: `{ state: "succeeded", eventUrl, draft, version }` with the event as Google has it now,
    or `{ state: "removed", reason: "deleted_in_google" }`. While a create, update or removal has
    not settled, read answers with the stored `{ state, draft, eventUrl? }` and no `version`,
    without asking Google.
  - update: `{ state: "succeeded", eventUrl, draft, version }`, or
    `{ state: "removed", reason: "deleted_in_google" }` when the event was deleted in Google.
  - remove: `{ state: "removed" }`, also when the event was already gone.
  - An event with no title reads back as "(No title)". An all-day event that spans several days
    in Google reads back as its first day.
- **Event states** the screens can see: none (no event, also after removal), `executing`,
  `unknown` (a create whose result was lost), `failed`, `succeeded`, `updating` (an update in
  progress or lost) and `removing` (a removal in progress or lost).
  - While an event is `executing`, `unknown`, `updating` or `removing`, create and update are
    refused as busy, apart from the retry that settles it: the same create for `unknown`, the
    same update for `updating`.
  - Remove is accepted from any state once no request is in progress.
- **Status reads:** database functions called with the user's session, reading stored records
  only. `calendar_event_status(p_task)` returns `{ state, eventUrl, draft }` for one task, or
  `{}`. `calendar_event_statuses()` returns a list of `{ taskId, state, eventUrl, draft }` for
  every task of the signed-in user that has an event. Events stay listed after Google is
  disconnected. While a Google account is connected, only that account's events are listed.
- **Error codes.** Errors answer `{ error: "<code>" }` with the HTTP status shown.

  | Code | Status | Meaning for the screen |
  | --- | --- | --- |
  | `INVALID_REQUEST` | 400 | The request is malformed or has fields the action does not take |
  | `INVALID_CALENDAR_DRAFT` | 400 | The event details are not valid; correct the form |
  | `TASK_NOT_FOUND` | 403 | The task is not the signed-in user's |
  | `CALENDAR_BUSY` | 409 | Another request for this task is in progress, or an earlier one has not settled; check status |
  | `STALE_CALENDAR_TASK` | 409 | The task changed or is no longer open; reopen on the current task |
  | `CALENDAR_RETRY_ORIGINAL` | 409 | An earlier attempt is unresolved; retry it with the same values |
  | `CALENDAR_NOT_ADDED` | 409 | The task has no event to read, update or remove; refresh status |
  | `CALENDAR_EVENT_CHANGED` | 409 | The event changed in Google since it was read; load the latest |
  | `GOOGLE_CALENDAR_SCOPE_REQUIRED` | 503 | Calendar is not authorized; offer to authorize, then return |
  | `GOOGLE_RECONNECT_REQUIRED` | 503 | The Google connection expired or was revoked; reconnect |
  | `GOOGLE_CONNECTION_BUSY` | 503 | The Google connection is being refreshed or changed; try again shortly |
  | `CALENDAR_AUTH_OR_PERMISSION` | 503 | Google refused access; reauthorize |
  | `CALENDAR_RATE_LIMITED` | 503 | Google is limiting requests; try again shortly |
  | `CALENDAR_UNRESOLVED` | 503 | The event found is not the app's or is unusable; nothing was changed |
  | `CALENDAR_PROVIDER_UNAVAILABLE` | 503 | Google could not be reached; the result may be unknown |
  | `STALE_CALENDAR_OPERATION` | 503 | The request took too long and lost its place; check status |
  | `CALENDAR_UNAVAILABLE` | 503 | Any other failure; check status before retrying |
  | `CALENDAR_DISABLED` | 503 | Calendar is switched off in the backend |

  Requests without a valid session answer 401 `AUTH_REQUIRED`.

- **Who may do what:** create and update need an open, approved task. Read and remove also work
  on completed, cancelled and deleted tasks. Every action needs Calendar permission; the status
  reads do not.
- **Task deadline:** `{ date, time, endTime, timeZone, wording, boundary }`. `endTime` is `HH:mm`
  or null and is present only with a `time`. Extraction fills it only when the email states a
  range; it never invents a duration. The 30-minute default is applied by the form.

## Study reset

Between study sessions, a backend script resets the study accounts. It refuses any account that
is not a study account; deletes in Google every event the app has a record of, including
uncertain ones; searches the primary calendar for any remaining event carrying the app's marker
and deletes it; performs the rest of the reset, which clears the event records; and prints how
many events were removed and how many remain. Running it against the hosted project is a hosted
change and is approved and recorded like any other (#101).

## Limitations for CP4

- **One calendar:** events go to the primary calendar of one connected Google account. There is
  no calendar picker and no second account.
- **One time zone:** the app assumes Central Time (`America/Chicago`). An email that names another
  zone is read in that zone, but there is no per-user time zone, no picker and no conversion.
- **No syncing:** the app does not watch Google Calendar. It learns of changes made there only
  when Manage event is opened, when the event's link is clicked, and when the user returns from
  an event opened that way. Task edits never change an event without the user confirming.
- **No recurring events:** the app creates one-time events. If the user makes one repeat in
  Google, Save changes, the one-click move and Remove act on the whole series.
- **No Google Tasks.**
- **No emails that move a meeting as a separate suggestion:** a reschedule arrives as a task
  change, followed by the offer to move the event.
- **Purged tasks:** completed tasks are removed 30 days after completion along with their event
  record. After that the event stays in Google and the app no longer manages it. Cancelled tasks
  are not purged.
- **After an encryption key change,** disconnecting cannot tell Google; the user is told to remove
  the app's access in their Google Account.

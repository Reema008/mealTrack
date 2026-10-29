# MealTrack

A mobile-first PWA that tracks a family's lunch and dinner deliveries from a recurring food subscription. There are no emails or passwords: people **sign in with their name and a shared PIN**, an **admin approves** them, and phones can be locked with **fingerprint / Face ID**. Everyone sees the same records, which update live.

**Nobody has to log meals every day.** Each scheduled meal is assumed delivered by default. You only record an exception, for example a meal that didn't arrive, an egg dish instead of chicken, or missing extra curries.

| Day | Menu | Default when nothing is saved |
|---|---|---|
| Mon, Thu, Sat | Veg | Lunch and dinner delivered |
| Tue, Wed, Fri | Non-Veg | Lunch and dinner delivered, chicken, extra curries received |
| Sun | No delivery | Nothing scheduled or counted |

**Stack:** React 18, TypeScript, Vite, Tailwind CSS, Supabase (Postgres, Auth, Realtime, Edge Functions, Cron), vite-plugin-pwa with Web Push, and Vitest with PGlite.

---

## Contents
1. [How it works](#how-it-works)
2. [Project layout](#project-layout)
3. [Local development and tests](#local-development-and-tests)
4. [Supabase setup (one time)](#supabase-setup-one-time)
5. [Deploy to GitHub Pages](#deploy-to-github-pages)
6. [Daily 10 PM reminders (Web Push)](#daily-10-pm-reminders-web-push)
7. [First-time setup, sign-in and approval](#first-time-setup-sign-in-and-approval)
8. [Install on Android and iPhone](#install-on-android-and-iphone)
9. [End-to-end verification checklist](#end-to-end-verification-checklist)
10. [Manual steps that can't be automated](#manual-steps-that-cant-be-automated)

---

## How it works

### Sparse overrides
- Only explicit changes are stored, in `public.meal_overrides`, with one row per changed meal.
- Each row is unique on `(household_id, meal_date, meal_period)`.
- Defaults are calculated on the fly in [src/domain/meals.ts](src/domain/meals.ts) for any date: past, today or future.
- Each meal has one of three states:
  - **Assumed**: no row exists, so the schedule default applies.
  - **Saved** (explicit): a family member changed the meal, so a row exists.
  - **Planned**: a date after today in the household's timezone. It's shown as scheduled, not as a confirmed delivery.
- Each meal is independent. Changing lunch to egg leaves dinner alone. Extra curries can be marked missing while the meal stays delivered.
- A meal marked **not delivered** has no main dish and no extra curries (both stored as NULL and hidden in the app). Switching it back to delivered restores the defaults.
- **No delivery this whole day** marks both lunch and dinner not delivered in one tap; **Mark whole day as delivered** restores both.
- Saving values equal to the default **deletes** the row, so the default applies again. The "Restore standard defaults" button does the same.

### Saving and conflicts
The only write path is the `save_meal_override` RPC.
- The client sends the `version` it was editing. `null` means it saw the default.
- If someone else saved in the meantime, the RPC writes nothing and returns `conflict` with the current row. The edit sheet then asks: **Keep theirs** or **Use mine**.
- Replaying an identical change returns `unchanged`, so retries and offline replays can't create duplicates or bump versions.
- Authorship (`created_by`, `updated_by`), `updated_at` and `version` are set by a trigger, so clients can't forge them.

### Statistics
Everything comes from `computeStats` in [src/domain/stats.ts](src/domain/stats.ts):

- **Scheduled**: Mon–Sat lunch and dinner. Sundays are never counted.
- **Actual**: meals dated today or earlier. Assumed meals count as delivered and are labelled "assumed".
- **Planned**: future meals. They never count as delivered and are left out of the success rate.
- **Egg / chicken**: delivered main dishes only.
- **Extra curries**: counted per non-veg meal. A meal that wasn't delivered had no curries, so they count as missing.
- **Success %**: delivered ÷ actual scheduled meals × 100.

### Sync
- The cloud database is the source of truth.
- The app fetches on startup and on login, and refetches on focus and reconnect.
- It subscribes to Supabase Realtime for its household and refetches on every change.
- Offline edits go into a local outbox (one entry per meal) and show a **Pending sync** badge. They replay automatically when the device is back online. The header shows Live, Syncing, Offline or "N not synced".
- A meal is reported as saved only after the server confirms it.

### Security
- RLS is enabled on every table.
- A household ID sent by the client is never trusted. Writes resolve the household from `auth.uid()`'s membership, and RLS rechecks it.
- Each phone gets its own **anonymous Supabase session** automatically. A session on its own gives access to nothing: the phone only sees data after joining the family with the **family PIN** (`join_with_pin`).
- The PIN is 6–10 digits and stored only as a bcrypt hash that clients can't read. All PIN checks share a limit of **10 wrong attempts per 15 minutes**, so guessing a 6-digit PIN would take years.
- The family can be set up only once (`setup_household`). After that, strangers who open the link only see "Enter family PIN".
- **Fingerprint / Face ID** (WebAuthn, platform authenticator with user verification) is a lock on that phone only. It stops someone holding an unlocked phone from opening the app. The family PIN is the fallback, checked by the server with the same limit.
- Any family phone can remove another phone or change the PIN (the current PIN is required). Phones that have already joined stay joined after a PIN change.
- Signed-out (`anon`) requests have no table access.
- Only the public anon key and the public VAPID key are shipped to the browser. The service-role key and the VAPID private key live only in Edge Function secrets.

---

## Project layout

```
src/domain/          pure, tested business logic (schedule, defaults, stats, dates)
src/data/            Supabase API calls, React Query hooks, realtime, session/household context
src/lib/             supabase client, offline outbox, push helpers, error mapping
src/components/      UI (meal cards, edit sheet, calendar, charts, app shell)
src/pages/           Home, Day, Calendar, Reports, Settings, Auth/Onboarding
src/sw.ts            service worker: app-shell precache, push display, notification click deep-link
supabase/migrations/ schema, RLS, RPCs, notifications, cron
supabase/functions/  send-daily-reminders Edge Function (+ _shared/reminder.ts timing logic)
supabase/setup-all.sql  all migrations except cron, for pasting into the SQL Editor (new project)
supabase/upgrade-family-pin.sql  only the PIN + not-delivered changes (if you ran an older setup-all.sql)
tests/unit/          schedule/defaults, stats, reminder timing, outbox, realtime
tests/db/            real migrations on PGlite (in-process Postgres): RLS, RPCs, constraints, concurrency
```

---

## Local development and tests

Requires Node 20 or later.

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL + anon key (+ VAPID public key)
npm run dev                     # http://localhost:5173
npm test                        # 87 unit + database tests, no Docker needed
npm run build                   # type-check + production build into dist/
npm run preview                 # serve the build at http://localhost:4173
```

The database tests in `tests/db` load the real migration files into **PGlite**, an in-process Postgres, using a small Supabase shim. The shim provides the `auth` schema, `auth.uid()` from JWT claims, and the `anon`, `authenticated` and `service_role` roles. Each query runs as a specific user, just as PostgREST does, so RLS is genuinely enforced. The cron migration needs hosted-only extensions, so these tests skip it.

---

## Supabase setup (one time)

You need a Supabase project. Its URL and anon key go in `.env.local`, which git ignores.

### 1. Apply the database schema

Pick **one** of the two options.

**Option A: SQL Editor (no CLI).**
1. In the Supabase dashboard, open **SQL Editor** and start a new query.
2. Paste the whole of [supabase/setup-all.sql](supabase/setup-all.sql) and click **Run**.
   - Already ran an **older** `setup-all.sql`? Run [supabase/upgrade-family-pin.sql](supabase/upgrade-family-pin.sql) instead. Running the full file twice fails because the tables already exist.
   - After editing migrations, regenerate the file with `node scripts/build-setup-sql.mjs`.

**Option B: Supabase CLI.**
```bash
npx supabase login                                  # opens the browser for an access token
npx supabase link --project-ref <your-project-ref>  # asks for the database password
npx supabase db push                                # applies supabase/migrations/*
```
Option B also applies the cron migration (`…_cron.sql`). That's fine: the job can't do anything until you've set up reminders (section 6).

To check it worked: in **Table Editor** you should see `households`, `household_members`, `household_invites`, `meal_overrides`, `notification_preferences`, `push_subscriptions`, `notification_log` and `family_pin_attempts`, each with RLS **enabled**.

### 2. Turn on anonymous sign-ins (required)
Go to **Authentication → Sign In / Providers** (called **Providers** in some dashboard versions), turn on **Allow anonymous sign-ins**, and click **Save**.

If this is off, the app shows a screen explaining how to turn it on.

> Optional: Supabase limits anonymous sign-ins to 30 per hour per IP address by default. You can also turn on CAPTCHA under **Authentication → Attack Protection** to stop bots from creating empty sessions. Those sessions can't see any data without the PIN.

### 3. Realtime
The migrations add `meal_overrides` to the `supabase_realtime` publication. Under **Database → Publications → supabase_realtime**, `meal_overrides` should appear as enabled.

---

## Deploy to GitHub Pages

1. Create a GitHub repository, for example `mealtrack`, and push this folder to its `main` branch:
   ```bash
   git init && git add . && git commit -m "MealTrack"
   git branch -M main
   git remote add origin https://github.com/<github-user>/mealtrack.git
   git push -u origin main
   ```
   `.env.local` and `supabase/functions/.env` are gitignored and are never pushed.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. In the repo, go to **Settings → Secrets and variables → Actions → Variables** and add three **repository variables**. These values are public, so variables (not secrets) are fine:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
4. Push to `main`, or run the workflow by hand. [.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs the tests, builds with base path `/<repo>/`, and deploys.
5. The app is live at `https://<github-user>.github.io/<repo>/`. Routing uses `#/…` (HashRouter), so deep links work on GitHub Pages without any 404 workarounds.

---

## Daily 10 PM reminders (Web Push)

Every 15 minutes, `pg_cron` calls the `send-daily-reminders` Edge Function. For each household, the function works out the **local** date and time in that household's timezone (default `Asia/Kolkata`). From **22:00 to 23:59, Monday to Saturday**, it sends:

> **MealTrack — Daily Food Check**
> It's 10 PM! Did you receive today's lunch and dinner? Please check your MealTrack entries and update any meals that were not delivered, any egg meals, or any missing extra curries.

Tapping the notification opens `…/#/day/<that local date>`.

- Every attempt is written to `notification_log`. `claim_daily_reminder` guarantees **one reminder per device per local date**.
- A failed send is retried on later ticks, up to 3 attempts.
- Subscriptions the browser has revoked (HTTP 404 or 410) are disabled.
- Sundays never send.
- Daylight-saving time and half-hour offsets are handled, because the check uses each household's IANA timezone.
- Reminders never write to `meal_overrides`.

### Keys (already generated for you)
- A VAPID key pair and a `CRON_SECRET` were generated locally into `supabase/functions/.env`, which git ignores.
- The **public** VAPID key was also copied into `.env.local` as `VITE_VAPID_PUBLIC_KEY`.
- To make a new pair instead, run `npx web-push generate-vapid-keys`. Put the public key in both files and the private key in `supabase/functions/.env` only.

Before uploading, edit `supabase/functions/.env`:
- `APP_URL`: your GitHub Pages URL, for example `https://<github-user>.github.io/mealtrack/`
- `VAPID_SUBJECT`: `mailto:` followed by a contact email that push services can reach you at

### Deploy the function and schedule
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-daily-reminders --no-verify-jwt
```
The function checks its own callers, so `--no-verify-jwt` is intentional:
- Cron calls must send the correct `x-cron-secret` header.
- Test calls must carry a valid user JWT, which the function verifies itself.

Next, run this in the **SQL Editor**, using your project ref and the `CRON_SECRET` value from `supabase/functions/.env`:
```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-daily-reminders', 'mealtrack_reminder_url');
select vault.create_secret('<CRON_SECRET value>', 'mealtrack_cron_secret');
```
If you used the SQL Editor (Option A) for the schema, also run [supabase/migrations/20261029000005_cron.sql](supabase/migrations/20261029000005_cron.sql) there. That enables `pg_cron` and `pg_net` and creates the job. To check the job exists, run `select jobname, schedule from cron.job;`. It should show `mealtrack-daily-reminders` with `*/15 * * * *`.

### Test before relying on it
1. Open the installed app, go to **Household → Daily 10 PM reminder → Turn on**, and allow notifications.
2. Tap **Send test notification**. A notification should appear within seconds. Tapping it should open today's meals.
3. Dry-run the scheduler for a specific moment. 16:30 UTC is 22:00 IST, and the cron secret is required:
   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/send-daily-reminders" \
     -H "Content-Type: application/json" -H "x-cron-secret: <CRON_SECRET>" \
     -d '{"now":"2026-11-02T16:30:00Z"}'
   ```
   The response looks like `{"households":1,"due":1,"sent":N,"failed":0,"skipped":0}`. Send it again and it returns `skipped`, because each device gets one reminder per day.
4. After the next 10 PM, check `select * from notification_log order by created_at desc;` and the function logs in the dashboard.

**Until step 2 has worked on a real phone, treat reminders as not yet working.**

---

## First-time setup, sign-in and approval

1. **The first person is the admin.** Open the app. Because nothing is set up yet, it shows the setup screen. Enter **your name** and create a **PIN** of 6–10 digits. The timezone defaults to Asia/Kolkata; the admin can change it under **Settings**.
2. The app then offers **Lock MealTrack with fingerprint / Face ID**. Tap **Turn on** and confirm with your fingerprint or face. You can change this later under **Settings → App lock on this phone**: Fingerprint / Face ID, PIN, or Off.
3. **Everyone else signs in.** They open the same link, install the app, tap **Sign in**, and enter **their name and the PIN**. They then see **Waiting for approval** and can't view or edit anything yet.
4. **The admin approves.** A banner appears for the admin: "1 person is waiting for your approval". Go to **Settings → People** and tap **Approve** (or **Decline**). The other phone opens MealTrack within a few seconds.
5. Under **Settings → People** the admin can also **Make admin**, **Remove admin**, or **Remove** someone. Removing someone stops their access and their reminders. There must always be at least one admin.
6. **Changing the PIN** is admin-only: **Settings → PIN** (the current PIN is required). People already approved stay signed in.
7. **Forgot the PIN?** In the Supabase SQL Editor run `select public.admin_set_family_pin('NEW-PIN');`. This also clears any 15-minute lockout.
8. **Sign out** (bottom of Settings) removes you from MealTrack on that phone. To come back you sign in again with your name and the PIN, and an admin approves you again. The only admin can't sign out while others still use the app; make someone else an admin first.

---

## Install on Android and iPhone

**Android (Chrome):**
1. Open the app URL.
2. Use **⋮ → Install app** (or **Add to Home screen**).
3. Open MealTrack from the home screen, then turn on reminders under Household.

**iPhone (Safari, iOS 16.4 or later is needed for notifications):**
1. Open the app URL in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open MealTrack **from the Home Screen icon**. Push only works in the installed app, not in a Safari tab.
4. Go to Household → **Turn on** reminders and allow notifications.

Desktop Chrome and Edge can install the app too (install icon in the address bar).

---

## End-to-end verification checklist

1. **Defaults.**
   - On a Tuesday, both meals show *Delivered · Chicken · Extra curries Received* with an **Assumed** badge.
   - A Thursday shows two delivered veg meals.
   - A Sunday shows *No Delivery Scheduled*.
2. **Independent edits.** Edit Tuesday lunch to **Egg** and save. Lunch changes to Egg with a **Saved** badge, and dinner stays Chicken and **Assumed**.
3. **Live sync.** Join the family on two phones. Make an edit on one, and the other updates within a few seconds without a refresh.
4. **Conflict.** Open the same meal's edit sheet on both devices. Save on device A, then save something different on device B. B is asked to *Keep theirs* or *Use mine*.
5. **Restore defaults.** Use **Restore standard defaults**. The badge returns to **Assumed**, and in Supabase the `meal_overrides` row is gone.
6. **Offline.**
   - Turn on airplane mode and edit a meal. It shows **Pending sync**, and the header says "Offline · 1 not synced".
   - Reconnect. A toast says "1 offline change synced" and the other device updates.
7. **Reports.** For a past week with one "not received" meal, the counts are 12 scheduled, 11 delivered, 1 not received and 91.7%. Future days appear as *Planned*.
8. **Not delivered.**
   - Mark Tuesday lunch **Not received**. The card hides Main dish and Extra curries.
   - Tap **No delivery this whole day**. Both meals turn Not Received.
   - Tap **Mark whole day as delivered**. Both return to Assumed.
9. **Access.**
   - On a new phone (or a private browser window), a wrong PIN shows the attempts left and no data.
   - After 10 wrong PINs, PIN entry pauses for 15 minutes.
   - `npm test` covers this automatically (`tests/db/pin.test.ts`, `tests/db/rls.test.ts`).
10. **App lock.** With Fingerprint / Face ID on, close the app and reopen it. It asks for your fingerprint or face, and **Use family PIN instead** also works.
11. **Reminders.** Follow "Test before relying on it" above.

---

## Manual steps that can't be automated

These need your Supabase, GitHub or phone accounts:

| Step | Where |
|---|---|
| Apply the schema (SQL Editor paste, or `npx supabase login` + `link` + `db push`) | Supabase |
| Turn on **Allow anonymous sign-ins** | Supabase → Authentication → Sign In / Providers |
| Set `APP_URL` and `VAPID_SUBJECT` in `supabase/functions/.env` | local file |
| `npx supabase secrets set …` and `npx supabase functions deploy …` | terminal (needs `supabase login`) |
| Create the two Vault secrets (and run the cron migration if you used the SQL Editor) | Supabase SQL Editor |
| Create the GitHub repo, push, set Pages source to GitHub Actions, add the 3 variables | GitHub |
| Set up the family and PIN on the first phone, then join other phones with the PIN | the app |
| Install the PWA, turn on fingerprint / Face ID, and allow notifications on each phone | each phone |
| Send a test notification and confirm it arrives | each phone |
| Optional: CAPTCHA for anonymous sign-ins | Supabase → Authentication → Attack Protection |

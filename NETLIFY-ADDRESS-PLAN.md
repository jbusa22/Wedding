# Save-the-date address collection: Netlify launch plan

Status: plan only; nothing deployed or connected in this task.

## Approach

Use the existing static page and Netlify Functions, with Airtable’s Invites table as the address book. The browser already searches `GET /.netlify/functions/invite?q=…`, opens a household through `GET /.netlify/functions/address`, and saves through `POST /.netlify/functions/address`. There is no need to add Netlify Forms alongside this flow.

This document is stored in the repo. Guest addresses should live in the private address book, not the published site or Git history. The current Netlify publish directory is the repository root, so a CSV or JSON address export committed here could become publicly downloadable. If “store in the repo” means actual guest records, use a separate private, non-deployed data repository after explicitly deciding its access and retention rules. Prefer Airtable exports held privately for invitation printing.

## 1. Prepare the address book

Create an `Invites` table with one row per household. Use single-line text for `Invite Code`, `Household Name`, `Street Address`, `City`, `State`, and `Zip`; use a date field including time for `Address Updated At`. ZIP codes must be text to preserve leading zeros. Populate household names with searchable guest names. Use unpredictable, unique invitation codes instead of sequential examples such as INV001.

Create an Airtable personal access token scoped to the Invites base, with record read/write access. Set `AIRTABLE_TOKEN`, `AIRTABLE_INVITES_BASE_ID`, and `AIRTABLE_INVITES_TABLE=Invites` in Netlify’s server-side function environment. Do not commit credentials. RSVP and registry configuration can be completed separately.

## 2. Resolve launch blockers in the existing functions

- Protect existing addresses: name search currently returns the same invite token that grants access to read and overwrite a household address. Anyone who guesses a guest’s name could access it. Keep name search for convenience, but require a private code/link before loading or updating existing addresses; do not expose the authorization secret in search results. An alternative is a write-only intake reviewed by the couple before it updates the address book.
- Fail closed in production when the Invites table is missing. The shared helper currently accepts arbitrary names/codes in development fallback mode.
- In `address.js`, preserve ZIP as a string rather than calling the current numeric `normalizeZip` helper. Verify a ZIP such as 02108 round-trips unchanged.
- Validate malformed JSON, field length limits, ZIP/state formatting, and a finite, plausible `loadedAt` timestamp; return useful 400 responses rather than raw provider errors. Decide whether international addresses are needed before launch (the current form assumes US addresses).
- Add request throttling and retain the honeypot. A minimum fill time alone is insufficient protection. Return `Cache-Control: no-store` for private address responses.
- Keep secrets and private exports out of the publish directory. Add `.env` and private export paths to `.gitignore`; publish only public site assets through a dedicated output directory when adding private tooling/data to this project.

## 3. Connect and preview on Netlify

Connect this repository to a Netlify project and select the intended production branch. Existing `netlify.toml` sets publish directory `.` and functions directory `netlify/functions`; no frontend build command is needed for the current static site. Configure the address-book environment variables before deploying. Use a separate test base for preview deployments so tests do not alter guest records.

Run `netlify dev` locally to exercise both the static page and functions. Opening `index.html` directly only previews the layout; household lookup and saving require the function runtime. Deploy a preview and check the date/hero and every intake state on phone and desktop.

## 4. Acceptance checks

1. Find a seeded household; exercise no-match, wrong-code, and unavailable-service cases.
2. Save a complete address; verify the correct Airtable row and timestamp.
3. Reload with authorized access and confirm the address is preserved, including a leading-zero ZIP and apartment/suite.
4. Edit the address; verify one household row is updated without duplication.
5. Confirm changing households clears the previous household’s entered data.
6. Verify empty/invalid submissions, honeypot submissions, unauthorized reads/writes, and rapid repeated requests are rejected appropriately.
7. Confirm loading/error/success messages are accessible and failed submissions preserve entered values.
8. Inspect deployment output and browser requests for leaked tokens or address exports.

## 5. Launch and operate

After the checks pass, deploy production and submit one controlled end-to-end address before sharing the save-the-date URL. Monitor function errors and address updates. Export mailing labels privately from Airtable when invitations are ready. Decide who has access and when to remove addresses after wedding mailings are complete.

## References

- [Netlify Functions overview](https://docs.netlify.com/build/functions/overview/) — runtime and deployment model.
- [Netlify Forms setup](https://docs.netlify.com/manage/forms/setup/) — an alternative for simple, write-only submissions if household lookup is removed.
- [Momental redwood forest stationery](https://momentaldesigns.com/momental-projects/redwood-forest-wedding-stationery/) — woodland illustration and warm paper inspiration.
- [Bella Figura redwood letterpress stationery](https://www.bellafigura.com/pressd/ombre-letterpress-wedding-invitations/) — fine tree silhouettes and restrained print-inspired styling.

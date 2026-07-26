# Wedding

Static wedding site for Netlify with RSVP and registry data stored in Airtable.

The public wedding details live on `index.html`. RSVP and registry are separate guest-only pages at `rsvp.html` and `registry.html`. Both validate the invitation code before revealing private content, and the registry endpoint is not called until that validation succeeds.

## What still needs to be done

1. Create three Airtable bases:
   - RSVP base
   - Registry base
   - Invites base
2. Create the tables listed below, one table per base.
3. Create an Airtable personal access token with access to all three bases.
4. Create or connect a Netlify site to this repository.
5. Set the Netlify build settings:
   - Build command: leave blank
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
6. Add the Netlify environment variables listed below.
7. Deploy the site.
8. Test the three Netlify Function endpoints after deploy.

## Netlify Functions

The frontend does not call Airtable directly. It calls these Netlify Functions, and the Functions call Airtable using server-side environment variables.

Expected deployed endpoints:

- `/.netlify/functions/invite`
  - Method: `GET`
  - Searches party names with `?q=Jack` and validates the selected party before unlocking RSVP or registry content.
- `/.netlify/functions/rsvp`
  - Methods: `GET`, `POST`
  - Loads the selected party's saved response and creates or updates its RSVP record.
- `/.netlify/functions/registry`
  - Method: `GET`
  - Used by the registry section.
  - Reads registry items from the Registry Airtable base.
- `/.netlify/functions/registry-claim`
  - Method: `POST`
  - Creates, changes, or removes the selected party's claim on a registry item.

These Functions already exist in this repo under `netlify/functions`. On Netlify, you do not manually create the Functions in the UI. You configure the site to use `netlify/functions`, then Netlify deploys them from the repo.

## Netlify environment variables

Add these in Netlify under Site configuration -> Environment variables:

- `AIRTABLE_TOKEN`
  - Airtable personal access token with access to all three bases.
- `AIRTABLE_RSVP_BASE_ID`
  - Base ID for the RSVP base. Starts with `app`.
- `AIRTABLE_REGISTRY_BASE_ID`
  - Base ID for the Registry base. Starts with `app`.
- `AIRTABLE_INVITES_BASE_ID`
  - Base ID for the Invites base. Starts with `app`.
- `AIRTABLE_RSVP_TABLE`
- `AIRTABLE_REGISTRY_TABLE`
- `AIRTABLE_INVITES_TABLE`
  - Optional for early testing. If omitted, any name search with at least 2 characters is accepted.

## How to find Airtable base IDs

Use this for each of the three bases:

1. Open Airtable and go to the base.
2. Click `Help` or the question-mark menu.
3. Open `API documentation` or go to `https://airtable.com/developers/web/api` while signed in.
4. Select the base.
5. Look for the base ID in the API docs or generated request URL. It starts with `app`, for example `appXXXXXXXXXXXXXX`.

The Airtable API URL shape is:

```text
https://api.airtable.com/v0/{baseId}/{tableName}
```

So if the API docs show a URL like this:

```text
https://api.airtable.com/v0/appAbc123Example/RSVPs
```

Then the base ID is:

```text
appAbc123Example
```

## Airtable bases and tables

### RSVP base

Create one table named `RSVPs` with these fields:

- `Invite Code`
- `Primary Name`
- `Email`
- `Phone`
- `Street Address`
- `City`
- `State`
- `Zip`
- `Attending`
- `Guest Names`
- `Meal Choices`
- `Dietary Restrictions`
- `Song Request`
- `Notes`
- `Submitted At`

The site keeps one RSVP row per selected party by matching its stable `Invite Code` value.

### Registry base

Create one table named `Registry` with these fields:

- `Name`
- `Image`
- `Price`
- `Quantity`
- `Claimed`
- `Last Claimed By Code`
- `Last Claimed At`
- `Claims By Party`

`Image` can be either an Airtable attachment field or a URL text field. The site supports both.
`Claims By Party` must be a long-text field. The site stores a small JSON object there so each party can edit or remove its own claimed quantity while `Claimed` remains the overall total.

### Invites base

Create one table named `Invites` with these fields:

- `Invite Code`
- `Household Name`

Each invitation should get one row. `Invite Code` is the stable unique key (for example `INV001`). Put the searchable party label in `Household Name`, such as `Jack Smith & Liza Ibiz`. A guest can search any part of the household name (such as `Jack` or `Liza`), while the site privately uses `Invite Code` to load and update that party's data.

## Local setup

Open `index.html` directly to preview the static layout. The RSVP and registry API calls require Netlify Functions, so they need either Netlify CLI locally or a deployed Netlify site.

For local Function testing, install and run the Netlify CLI from the repo root:

```bash
netlify dev
```

Then open the local URL Netlify prints and test:

- RSVP submission
- Registry loading
- Registry claiming
- Party-name search and invalid-party rejection

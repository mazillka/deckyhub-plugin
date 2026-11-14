# DeckyHub ratings

A small Cloudflare Worker with a D1 database: users give a plugin **1 to 5 stars**, say whether it **works on their device** and whether its **interface is convenient**. Nothing else is asked or kept. Nothing runs from here until you deploy it, and DeckyHub does not talk to it yet.

## What it stores

| What | Why |
|---|---|
| plugin (`owner/name`), a random device id, stars, works / doesn't work, a convenient interface or not, the plugin's version, when | the rating itself. One per device and plugin; rating again replaces it, and a device can take it back (`DELETE`). |
| a count of requests per hashed address and per device, per hour | the rate limit. The address is hashed with a secret and the day, so it can't be turned back into an address, and the rows are deleted after two days. |

The device id is made up by the device and linked to nothing: no account, name, IP address or Steam id. No free text is accepted, so there is nothing to moderate.

## API

- `POST /v1/rate` with `{"plugin": "owner/name", "device": "<43-character random id>", "stars": 1-5, "works": true|false, "ui": true|false, "version": "1.2.3"}`; `stars`, `works` and `ui` are each optional, but one is needed.
- `DELETE /v1/rate` with `{"plugin", "device"}` takes it back.
- `GET /v1/aggregate` returns `{ "generatedAt", "plugins": { "owner/name": { "rated", "average", "works", "broken", "easy", "hard" } } }` (cached for five minutes). The registry can publish this next to `stats.json`.

Limits: 60 requests an hour from one address and 20 from one device, bodies up to 2 KB.

## Deploy (you need a Cloudflare account; I can't do this for you)

```sh
cd ratings
npx wrangler login
npx wrangler d1 create deckyhub-ratings           # prints a database_id: put it in wrangler.toml
npx wrangler d1 execute deckyhub-ratings --remote --file=schema.sql
npx wrangler secret put ADDRESS_SALT              # any long random string; never commit it
npx wrangler deploy
```

To use a name on your own domain (`api.deckyhub.com`), uncomment `routes` in `wrangler.toml` and deploy again.

## Not done here

- A Turnstile check for the website (the plugin is the only client planned).
- Anything that shows ratings: the registry's export, the plugin's "Rate" button and the site's stars come in later changes.
- Cloudflare's free-plan limits were not checked: look at the current ones before relying on it.

## Tests

`node --test tests/ratings.test.js` runs the Worker's logic and its SQL on SQLite (Node's `node:sqlite`), with no Cloudflare account.

# 厨房手记 (kitchen-notes)

A personal notebook for recipes, coffee dial-in and cocktail specs.

Live: https://kitchen-notes-c3i.pages.dev

## What it does

- **Recipes and cocktails** – write or paste free text, AI turns it into ingredients and steps, you confirm and save. Photos are optional.
- **Coffee** – log espresso and pour-over shots with +/- steppers pre-filled from the previous cup, see them on three charts (grind vs time, ratio vs time, score trend), get a next-cup suggestion, export CSV.
- **Users** – a username separates each person's records. There is no password: anyone who knows a username can read and change its records.

## Stack

- Vite, React, TypeScript, Tailwind CSS, Motion
- Cloudflare Pages + Pages Functions (`functions/api/[[path]].ts`)
- D1 (records), R2 (photos), Workers AI (text extraction)

Photos are compressed in the browser before upload (`src/lib/image.ts`): about 300 KB for the full image plus a small thumbnail. The original never leaves the device.

## Develop

```sh
pnpm install
pnpm build
pnpm preview        # wrangler pages dev, serves dist + functions on :8788
pnpm dev            # vite on :5173, proxies /api to :8788
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds, applies D1 migrations and deploys to Cloudflare Pages. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (permissions: Cloudflare Pages Edit, D1 Edit) and `CLOUDFLARE_ACCOUNT_ID`.

To deploy by hand instead:

```sh
pnpm db:migrate     # apply migrations/ to the remote D1 database
pnpm deploy         # build and upload to Cloudflare Pages
```

Bindings are declared in `wrangler.toml`: `DB` (D1), `PHOTOS` (R2), `AI` (Workers AI).

## Limits

- AI extraction is capped at 40 calls per user per day (`AI_DAILY_LIMIT`) to stay inside the Workers AI free allowance. When AI is unavailable, every form can still be filled in by hand.

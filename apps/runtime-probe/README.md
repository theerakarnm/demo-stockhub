# @stockhub/runtime-probe

A tiny Cloudflare Worker whose only job is to prove, on the real workerd
runtime, that the libraries the demo depends on work there before they become
load bearing near demo day.

The Node runtime is not the Workers runtime. A library that works in `bun test`
can still fail on workerd because of missing `node:` APIs. This worker burns
that risk down on day 1 instead of demo week.

## Probes

| Endpoint | Library | What it proves |
| --- | --- | --- |
| `GET /probe/xlsx` | `xlsx` (SheetJS) + `@stockhub/adapters` | write then read an .xlsx through the real import decode path, Thai cell included |
| `GET /probe/pdf` | `pdf-lib` | generate a valid PDF document |
| `GET /probe/pg` | `postgres` (postgres.js) | connect to Postgres via `nodejs_compat` using the same worker options as the API |
| `GET /probe/all` | all three | one call, used by the deploy checklist |

`/probe/pg` reads `DATABASE_URL` from `.dev.vars` (local) or a Worker secret
(staging). Without it the endpoint reports `configured: false` instead of
failing, so the staging deploy stays green.

## Run locally

```bash
bun run docker:up && bun run db:migrate && bun run db:seed   # the pg probe reads real rows
bun run --filter @stockhub/runtime-probe dev                 # http://localhost:8799
curl http://localhost:8799/probe/all
```

## Deploy to staging

```bash
bun run --filter @stockhub/runtime-probe deploy:staging
curl https://stockhub-runtime-probe-staging.theerakarnm.workers.dev/probe/all
```

Set the secret once, if you want the staging pg probe to reach a database:

```bash
cd apps/runtime-probe
bunx wrangler secret put DATABASE_URL --env staging
```

## Known limitation recorded by the probe

`pdf-lib` standard fonts are WinAnsi only, so Thai text in PDFs needs an
embedded TTF font. The probe proves the library runs; Thai font embedding is a
demo-week task.

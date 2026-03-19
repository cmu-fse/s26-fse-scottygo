# ScottyGo Memory Monitoring Runbook

## Purpose

Use this checklist to validate memory-monitoring features locally and diagnose memory pressure before pushing changes.

## Preconditions

- Server-side changes are committed or at least saved.
- `.env` is configured as needed for your test database.
- No stale server process is occupying port `8080`.

## Codespaces URL Guidance

- If commands are run inside the Codespaces terminal, prefer `http://localhost:8080`.
- If requests are run from your local machine/browser, use the forwarded HTTPS URL (for example `https://<codespace-name>-8080.app.github.dev`).
- Dashboard checks can be done from either URL, as long as they point to the same running server process.

## 1. Stop Old Server Process

```bash
lsof -i :8080
# then:
kill <PID>
```

## 2. Build Strategy

Use one of the following:

- Fast incremental build:

```bash
npm run build
```

- Clean rebuild (recommended for runtime/config/middleware issues):

```bash
npm run clean:build
```

When to prefer `clean:build`:

- Dashboard/UI still appears old after changes
- Server middleware behavior does not match source
- Branch switches with large file moves/refactors
- Suspected stale Parcel cache

## 3. Start Server

```bash
npm start
```

## 4. Verify Memory API Endpoints

Run in a second terminal:

```bash
curl -i http://localhost:8080/transit/memory/samples?limit=5
curl -i http://localhost:8080/transit/memory/summary?limit=50
curl -i http://localhost:8080/transit/health
```

If you are running `curl` outside Codespaces, use the forwarded URL instead:

```bash
curl -i https://<codespace-name>-8080.app.github.dev/transit/memory/samples?limit=5
curl -i https://<codespace-name>-8080.app.github.dev/transit/memory/summary?limit=50
curl -i https://<codespace-name>-8080.app.github.dev/transit/health
```

Expected:

- `HTTP/1.1 200 OK` for each
- `memory` object present in `/transit/health`

## 5. Open Dashboard

Open in browser:

```text
http://localhost:8080/transit/memory/dashboard
```

Forwarded URL equivalent:

```text
https://<codespace-name>-8080.app.github.dev/transit/memory/dashboard
```

Verify UI elements:

- Controls row with `Reload now` and `Download CSV`
- Metrics cards visible
- Graph visible
- `Render Free Limit (512MB)` legend item visible

## 6. Validate Live Data Freshness

From `/transit/health`, inspect:

- `vehiclePositions.lastFetched`
- `tripUpdates.lastFetched`
- `consecutiveFailures`

Target behavior:

- Timestamps should advance near the polling cadence
- `consecutiveFailures` should remain low/zero in stable conditions

## 7. Validate Dashboard Interactions

On dashboard:

- Hover graph points to view point-level sample details
- Click `RSS max` card to drill into peak context
- Click `Criticals` card to inspect critical samples
- Click `Download CSV` and confirm file contains sample rows

## 8. If Dashboard Appears Empty

1. Hard refresh browser (`Ctrl+Shift+R`)
2. Re-run `npm run clean:build`
3. Restart with `npm start`
4. Re-check `/transit/memory/samples` returns `200`

## 9. If You See HTTPS 403 Locally

- Ensure you rebuilt after middleware changes (`npm run clean:build`)
- Ensure current running process is the rebuilt one
- Ensure you are calling `localhost` on the expected port

## 10. Pre-Push Validation

```bash
npx jest tests/server.tests/rest.tests/memory-monitoring.test.ts --runInBand
npm run lint
npx tsc --noEmit
npm run build
```

If all pass and dashboard endpoints return `200`, local validation is complete.

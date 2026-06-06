# 🎓 Student Portal (Minimal, Zero-Dependency)

A deliberately small **Node.js + SQLite** student portal — **login, profile, and search** over personal student data. It is intentionally minimal so it can serve as the *application under test* for illustrating a **DevSecOps pipeline** (SAST, dependency/secret scanning, DAST, etc.).

> **Zero npm dependencies.** It runs on Node's built-ins only — `node:sqlite`, `node:http`, `node:crypto`. There is **nothing to `npm install`**, so it starts instantly and has no third-party supply chain. (You can still *add* tools for the pipeline demo — see below.)

> ⚠️ This is a teaching/demo app. It is secure-by-default in the obvious places (salted password hashing, parameterized queries, signed HTTP-only cookies, output escaping) but is **not** production-hardened. That gap is on purpose — it gives your pipeline real things to find and fix.

---

## Features

| Feature | Notes |
|---|---|
| 🔐 **Login** | Username + password; passwords stored as **scrypt** salted hashes |
| 👤 **Profile** | Logged-in student sees their own personal data |
| 🔎 **Search** | Search students by name / roll no / department / email (parameterized SQL) |
| 🩺 **Health check** | `GET /healthz` → `{status, backend, time}` — handy for CI/CD smoke tests |
| 🗄️ **Local DB** | **SQLite** via the built-in `node:sqlite`, auto-created and seeded on first run |

### Demo accounts
All seeded accounts share the password **`Password123!`**:

| Username | Name | Department |
|---|---|---|
| `alice` | Alice Johnson | Computer Science |
| `bob`   | Bob Smith     | Computer Science |
| `carol` | Carol Davis   | Electrical |
| `dan`   | Dan Williams  | Mechanical |
| `eve`   | Eve Martinez  | Computer Science |

---

## Run locally

Requirements: **Node.js 22+** (Node **24+ recommended**, where `node:sqlite` is stable and needs no flag).

```bash
npm start
# or simply:
node server.js
```

Then open **http://localhost:3000** and log in with `alice` / `Password123!`.

- No `npm install` is required — there are no dependencies.
- The SQLite file is created automatically at `./data/portal.db` and seeded on first run.
- To reset the data, delete the `data/` folder.
- On Node 22 you may need to run with `node --experimental-sqlite server.js` (on Node 24 it just works; you'll see a harmless `ExperimentalWarning` either way).

---

## Project structure

```
student_portal/
├── app.js            # Request handler (routes, auth, sessions) on node:http — exported, not started here
├── server.js         # Local entry point (node server.js)
├── api/index.js      # Vercel serverless entry point (imports app.js)
├── db.js             # SQLite data layer (node:sqlite) + scrypt hashing + in-memory fallback
├── views.js          # Tiny HTML renderer (escapes all output → XSS-safe)
├── public/style.css  # Styling
├── vercel.json       # Vercel build/route config
├── .env.example      # Environment variables template
└── package.json
```

The key design point: **`app.js` only exports a `handler(req, res)`; it never calls `listen()`.**
That lets the *same code* run locally (`server.js` wraps it in `http.createServer`) and as a Vercel serverless function (`api/index.js`).

---

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Vercel: **Add New… → Project → Import** the repo. No build command or framework preset is needed — `vercel.json` routes everything to `api/index.js`.
3. In **Project Settings → General → Node.js Version**, choose the newest available (**22.x or higher**) so `node:sqlite` is present.
4. (Recommended) Set env var **`SESSION_SECRET`** to a long random value:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. Deploy.

CLI alternative:

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

### ⚠️ About SQLite on Vercel (important)
Vercel serverless functions have a **read-only filesystem** except for `/tmp`, which is **ephemeral** (wiped between cold starts, not shared across instances). This app writes the DB to `/tmp/portal.db` and re-seeds on a cold start, so **the live demo works, but data you add will not persist** and is per-instance.

It also **degrades gracefully**: if the runtime's `node:sqlite` isn't usable (e.g. an older Node without the flag), `db.js` automatically falls back to an in-memory seeded store with the same interface — so the demo always boots. The `GET /healthz` response shows which backend is active (`"backend":"sqlite"` vs `"memory"`).

For *real* persistence on Vercel, swap the backend in `db.js` for a hosted DB:
- **Vercel Postgres** / **Neon** / **Supabase** (Postgres)
- **Turso** (libSQL — SQLite-compatible, network-backed)

Only the query functions in `db.js` would need to change.

---

## DevSecOps: how to use this project

This app is the "thing being secured." Below is a ready-made map of where each pipeline stage applies and what it should realistically find here.

### Pipeline stages → tools → what to look at

| Stage | Example tools | What it inspects here |
|---|---|---|
| **Secret scanning** | `gitleaks`, `trufflehog`, `detect-secrets` | The **hard-coded fallback `SESSION_SECRET`** in `app.js` is a perfect "secret should be an env var" finding. |
| **SCA (dependencies)** | `npm audit`, Dependabot, Snyk | There are **zero deps**, so this stage is *clean by design* — a great way to show "minimal supply chain." Add a dep and watch it light up. |
| **SAST (static analysis)** | **CodeQL**, Semgrep, ESLint security plugins | Auth flow, cookie signing, input handling, the SQL in `db.js`. |
| **Linting / quality gate** | ESLint, Prettier | Style + basic correctness gate before merge. |
| **Build / containerize** | Docker, Trivy/Grype image scan | Add a `Dockerfile` (`FROM node:24-alpine`), then scan the image for CVEs. |
| **IaC scanning** | Checkov, tfsec, KICS | Scan `vercel.json` / any Terraform you add for misconfig. |
| **DAST (running app)** | **OWASP ZAP**, Nikto | Point at the deployed URL; checks headers, cookies, auth flow. |
| **Smoke / health test** | `curl`, Playwright | Hit `GET /healthz` and the login flow after deploy. |

### Intentional teaching points (detect → then remediate)
1. **Hard-coded session secret fallback** (`app.js`) → require `SESSION_SECRET`, fail closed if missing.
2. **No security headers** → add CSP / HSTS / `X-Content-Type-Options` (a few lines in `app.js`, or [`helmet`](https://www.npmjs.com/package/helmet) if you switch to Express).
3. **No rate limiting on `/login`** → add a simple in-memory/Redis limiter to slow brute force.
4. **No CSRF tokens on POST forms** → add a double-submit token.
5. **Default seed credentials in repo** → fine for a demo, but policy/secret scanners may flag default creds.

### Things already done "right" (so you can contrast)
- Passwords hashed with **scrypt + per-user salt** (never plaintext), verified with **`timingSafeEqual`**.
- **Parameterized SQL** everywhere in `db.js` (no string-concatenated queries → no SQLi).
- **Signed, HTTP-only, SameSite, Secure-in-prod** session cookies; tampered cookies are rejected via HMAC verification.
- **All HTML output is escaped** in `views.js` → mitigates reflected/stored XSS.
- Handler/listener separation keeps the attack surface small and testable.

### Starter GitHub Actions workflow
Create `.github/workflows/devsecops.yml`:

```yaml
name: DevSecOps
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      # --- Secret scanning ---
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
      # --- SAST ---
      - name: Semgrep
        uses: semgrep/semgrep-action@v1
        with: { config: p/javascript }
      # --- Smoke test ---
      - name: Smoke test
        run: |
          node server.js & sleep 2
          curl -fsS http://localhost:3000/healthz
```

> Add **CodeQL** via GitHub's *Security → Code scanning → Set up CodeQL* for deeper SAST, and wire **OWASP ZAP** against your Vercel preview URL for DAST.

---

## Tech stack
- **Node.js** built-ins only:
  - `node:http` — web server / request handling
  - `node:sqlite` — embedded SQLite (no external DB server, no native build)
  - `node:crypto` — scrypt password hashing + HMAC-signed session cookies
- No frameworks, no `node_modules`.

## License
MIT — use freely for teaching and demos.

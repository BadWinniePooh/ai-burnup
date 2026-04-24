# Burnup

A lightweight project management tool built around burnup charts. Track cards through a backlog → active → done workflow and watch scope and effort accumulate over time on two real-time charts.

---

## What you get

### Dashboard
Two burnup charts update automatically as cards move through the workflow:

- **Cards burnup** — scope count vs. completed count over time, with a linear trendline
- **Effort burnup** — estimated days vs. completed days over time (uses actual working-day lead time for finished cards, estimation for in-progress ones)

Four headline stats sit above the charts: total cards, completed count and percentage, total scope in days and the share done, and velocity (cards/day over the last 14 days). Below the charts, breakdowns by card type and scope give a quick composition view, and a projection section tells you the estimated completion date based on current velocity — it flags when scope is growing faster than the done rate.

### Cards
A two-panel list-and-editor view. Cards carry:

| Field | Options |
|---|---|
| Type | Feature · Bug · No-code · Tiny |
| Scope | MVP · MLP · Other |
| Estimation | Any number, in days or points (1 point = 0.67 days) |
| Dates | Created · Started · Ended |

Cards are identified by a short code derived from the project (e.g. `PRJ-042`). Filter by status (Backlog / Active / Done), type, and scope; sort by ID, created, started, ended, or estimation; and search by ID or title. Changes save automatically with a short debounce — no save button needed.

### Lead time
Working-day lead time (Monday–Friday, excluding German public holidays) is calculated from the day work starts to the day it finishes, inclusive. A card started and finished on the same day counts as one day.

### Historical snapshots
A background worker freezes a snapshot of every project at midnight UTC each day. This means the burnup chart always has an accurate history even if no one opens the app that day. You can also import historical snapshots via the API for projects migrating from another tool.

### Authentication
- Users register with email and password (or via invite link when registration is closed)
- Forgotten passwords trigger a reset link by email — if SMTP is not configured the link appears in the API response for local development
- Each user sees only their own projects; unassigned projects are visible to admins only

### Admin panel
Accessible from the shield icon in the header (admin accounts only):

- **Unassigned** — projects not yet linked to a user; assign them to any registered account
- **Users** — full user list with delete (cascades to all their projects, cards, and history)
- **Invites** — generate invite links (optionally restricted to a specific email address, valid for 7 days)
- **Settings** — toggle between open registration and invite-only mode

### Appearance
Light and dark mode, configurable accent colour, area or line chart style, and per-type / per-scope colour hues — all persisted to `localStorage`.

---

## Requirements

| Dependency | Version |
|---|---|
| .NET SDK | 8.0 or later |
| PostgreSQL | 14 or later |

The frontend has no build step — it runs in the browser via Babel Standalone.

---

## Deployment

### 1. Set environment variables

Copy `.env.example` and fill in the required values:

```
ConnectionStrings__DefaultConnection=Host=...;Port=5432;Database=burnup;Username=...;Password=...
Jwt__Secret=<random string, at least 32 characters>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<secure password>
AppUrl=https://your-domain.com
```

See `.env.example` for the full list including optional SMTP settings.

> **Generate a JWT secret:**
> ```bash
> openssl rand -base64 48
> ```

### 2. Start the API

```bash
cd BurnupApi
dotnet run
```

The API listens on port **5000** by default. On first startup it:

1. Creates the database schema (tables, indices)
2. Retries the database connection up to six times with exponential backoff — useful when the database container is still starting
3. Creates the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if it does not already exist
4. Seeds `registration_enabled = true` into app config

A `/health` endpoint returns `200 OK` and can be used as a readiness probe.

### 3. Serve the frontend

The `project/` folder is plain HTML + JavaScript. Serve it from any static file host (nginx, Caddy, S3 + CloudFront, GitHub Pages, etc.).

If the API is on a different origin from the frontend, set the base URL before the other scripts load by uncommenting and editing this line in `project/Burnup PM Tool.html`:

```html
<script>window.__BURNUP_API__ = 'https://api.your-domain.com';</script>
```

For local development you can use any simple HTTP server:

```bash
cd project
python3 -m http.server 5500
# then open http://localhost:5500/Burnup%20PM%20Tool.html
```

---

## Docker (example compose)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: burnup
      POSTGRES_USER: burnup
      POSTGRES_PASSWORD: changeme
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./BurnupApi
    depends_on:
      - db
    environment:
      ConnectionStrings__DefaultConnection: Host=db;Port=5432;Database=burnup;Username=burnup;Password=changeme
      Jwt__Secret: replace-with-a-long-random-secret
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: changeme
      AppUrl: http://localhost:5500
    ports:
      - "5000:5000"

  web:
    image: nginx:alpine
    volumes:
      - ./project:/usr/share/nginx/html:ro
    ports:
      - "5500:80"

volumes:
  pgdata:
```

---

## Email (optional)

When `Smtp__Host` is not set the app runs in **dev mode**: the password-reset link is returned directly in the API response body instead of being emailed. Set the SMTP variables in `.env.example` to enable real email delivery.

---

## First login

1. Open the frontend URL in a browser
2. Click **Create account** and register with the `ADMIN_EMAIL` address — the account will automatically have the admin role
3. Click the shield icon (top-right) to open the Admin panel

---

## API overview

All endpoints except the auth routes below require a `Bearer` token in the `Authorization` header.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (invite token required when registration is closed) |
| POST | `/api/auth/login` | Obtain JWT |
| POST | `/api/auth/forgot-password` | Request a password reset link |
| POST | `/api/auth/reset-password` | Set a new password using a reset token |
| GET | `/api/auth/me` | Current user info |
| GET/POST | `/api/projects` | List / create projects |
| GET/PUT/DELETE | `/api/projects/{id}` | Read / update / delete a project |
| GET | `/api/projects/{id}/burnup` | Burnup series for a project |
| POST | `/api/projects/{id}/snapshots` | Bulk-import historical snapshots |
| GET/POST | `/api/cards` | List / create cards |
| GET/PUT/DELETE | `/api/cards/{uid}` | Read / update / delete a card |
| GET | `/api/admin/users` | List all users *(admin)* |
| DELETE | `/api/admin/users/{id}` | Delete user and all their data *(admin)* |
| GET/PUT | `/api/admin/settings` | Read / update app settings *(admin)* |
| GET/POST | `/api/admin/invites` | List / create invite links *(admin)* |
| GET | `/api/admin/projects/unassigned` | Projects without an owner *(admin)* |
| PUT | `/api/admin/projects/{id}/assign` | Assign a project to a user *(admin)* |
| GET | `/health` | Readiness probe |

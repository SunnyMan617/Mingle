# Mingle people directory

A responsive Next.js dashboard for browsing and discovering people across a team. The interface is inspired by the people-search shape in the supplied Slack request, but it intentionally uses safe local sample data and does not include or call Slack with browser session credentials.

## Features

- Search by name, role, skill, department, or location
- Department quick filters
- Detailed department, location, status, and work-style filters
- Name, department, and recently-added sorting
- Responsive profile-card grid with pagination
- Detailed profile modal with contact information, skills, projects, and local time
- Keyboard-friendly modal closing and reduced-motion support
- Useful empty states and mobile layouts

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run with Docker and hot reload

Build and start the development container once:

```bash
docker compose up --build
```

The project is bind-mounted into the container and filesystem polling is enabled, so changes under `src/`, `public/`, and other source files appear automatically through Next.js Fast Refresh. You do not need to restart Docker or rerun Compose for normal code and CSS edits.

Later starts only need:

```bash
docker compose up
```

Changes to `package.json`, `package-lock.json`, `Dockerfile.dev`, or `compose.yaml` still require rebuilding the container because they change dependencies or the runtime itself.

## Verify

```bash
npm run lint
npm run build
```

The Windows scripts use Next.js with Webpack because this machine's native SWC/Turbopack binary is unavailable; Next's WASM compiler is used automatically.

## Data

The dashboard reads the git-ignored `.data/slack-users.json` cache through the server-side `/api/people` route. The browser receives only the requested page, not the complete dataset.

To refresh the directory from a newly copied Slack curl request:

```bash
npm run sync:slack -- "C:\path\to\pasted-text.txt"
```

The importer extracts the supplied session in memory, traverses Slack's cursor-based `users.list` endpoint, removes deleted accounts and bots, and writes sanitized dashboard fields to the local cache. The Slack token and cookie are never written to the cache or client bundle. Because `.data` is bind-mounted in the development Compose setup, a completed sync is picked up without rebuilding the image.

The curl payload still contains reusable Slack session credentials. Keep it outside the repository and revoke/rotate those credentials if the file has been shared.

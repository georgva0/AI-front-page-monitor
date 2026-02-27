# AI Front Page Tracker

AI Front Page Tracker captures BBC World Service front pages and runs AI-powered analysis on the captured screenshot.

## What it does

- Capture a selected language-service front page
- Show screenshot preview in the UI
- Run AI analysis types (summary, sentiment, coverage, audience fit, etc.)
- Support follow-up Q&A with streamed responses
- Keep screenshot storage small by deleting older captures

## Project structure

- `client/` — React frontend (UI, charts, analysis rendering)
- `server/` — Express backend (Playwright capture + Gemini analysis)
- `scripts/` — operational scripts (e.g., Render keep-alive)
- `HOW_IT_WORKS.md` — detailed functional walkthrough
- `DEPLOY_NETLIFY.md` — deployment guide for Netlify frontend
- `render.yaml` — Render service blueprint for backend
- `netlify.toml` — Netlify build settings for frontend

## Architecture

1. Frontend sends capture request (`/api/capture`) with selected service URL.
2. Backend opens page with Playwright, applies cleanup, captures screenshot, stores file.
3. Frontend requests analysis (`/api/analyze`) for selected analysis type.
4. Backend sends screenshot to Gemini and returns structured output.
5. Frontend can ask follow-up question (`/api/ask-frontpage`) and renders streamed answer.

## Local development

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- Gemini API key

### 1) Backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
GEMINI_API_KEY=your_key_here
```

Run backend:

```bash
npm start
```

Backend runs on `http://localhost:5000`.

### 2) Frontend

```bash
cd client
npm install
```

Create `client/.env`:

```env
REACT_APP_API_BASE_URL=http://localhost:5000
```

Run frontend:

```bash
npm start
```

Frontend runs on `http://localhost:3000`.

## Deployment

### Recommended split

- Frontend: Netlify
- Backend: Render

### Backend (Render)

- Uses `render.yaml`
- Health endpoint: `/health`
- Required env var: `GEMINI_API_KEY`

### Frontend (Netlify)

- Uses `netlify.toml`
- Required env var: `REACT_APP_API_BASE_URL=<render-backend-url>`

See full steps in:
- `DEPLOY_NETLIFY.md`

## Keep-alive (optional)

To reduce free-tier cold starts, use:
- `scripts/keep_render_alive.sh`

Schedule with cron (example every 14 minutes):

```cron
*/14 * * * * /home/ubuntu/Development/front_page_monitor/scripts/keep_render_alive.sh >> /home/ubuntu/Development/front_page_monitor/keepalive.log 2>&1
```

## Notes

- If capture fails, check backend logs first.
- If analysis fails, verify `GEMINI_API_KEY` on backend host.
- If frontend cannot reach backend, verify `REACT_APP_API_BASE_URL`.

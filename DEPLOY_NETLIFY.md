# Deploying `front_page_monitor` with Netlify + GitHub

This repo is split into:
- `client/` (React PWA) → deploy on Netlify
- `server/` (Express + Playwright + Gemini) → deploy on a Node host (Render/Railway/Fly/etc.)

Netlify will host only the frontend. The backend must be deployed separately.

## 1) Prerequisites

- GitHub repository connected to Netlify
- A deployed backend URL (HTTPS)
- A valid `GEMINI_API_KEY`

## 2) Backend deployment (do this first)

Deploy `server/` to a Node provider that supports Playwright/Chromium.

### Required environment variables on backend host

- `GEMINI_API_KEY` = your Gemini API key
- `PORT` = provided by host (usually auto-injected)
- `CHROMIUM_EXECUTABLE_PATH` = only if your host requires explicit Chromium path

### Backend start command

- `npm install`
- `npm start`

### Backend health check

After deploy, confirm your API URL responds and logs show server startup:
- `Server running on http://localhost:<PORT>` (or host equivalent)

## 3) Netlify setup (GitHub-connected)

In Netlify:
1. **Add new site** → **Import from Git** → select this repository.
2. Build settings are already provided by `netlify.toml`:
   - Base directory: `client`
   - Build command: `npm ci && npm run build`
   - Publish directory: `build`
3. In **Site configuration → Environment variables**, add:
   - `REACT_APP_API_BASE_URL` = your deployed backend URL (example: `https://api-yourapp.onrender.com`)
4. Trigger deploy.

## 4) What is already configured in this repo

- `netlify.toml` at repo root
  - Correct monorepo build settings
  - SPA redirect (`/* -> /index.html`)
- Frontend reads API from env var:
  - `client/src/App.js` uses `REACT_APP_API_BASE_URL`
- PWA support is enabled:
  - `client/public/manifest.json`
  - `client/public/sw.js`
  - `client/public/offline.html`

## 5) Post-deploy verification checklist

Open deployed Netlify URL and verify:

1. App loads with no console build errors.
2. Capture works (backend reachable from frontend).
3. Analysis endpoints work:
   - `/api/analyze`
   - `/api/ask-frontpage` streaming response works progressively.
4. PWA installability:
   - Manifest detected
   - Service worker registered (production only)
5. Offline fallback:
   - Load app once
   - Disable network
   - Refresh and verify offline page appears.

## 6) Common issues and fixes

### CORS errors
- Ensure backend allows your Netlify domain in CORS settings.
- Current backend uses permissive CORS, but production can be tightened if needed.

### Playwright launch fails in backend logs
- Set `CHROMIUM_EXECUTABLE_PATH` for your host, or install host-supported browser runtime.

### Frontend still points to localhost
- Verify `REACT_APP_API_BASE_URL` is set in Netlify env vars.
- Redeploy after changing env vars.

## 7) Recommended production hardening (optional)

- Restrict backend CORS to your Netlify domain.
- Add rate-limiting on backend API routes.
- Add backend health endpoint and uptime monitoring.

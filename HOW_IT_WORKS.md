# AI Front Page Tracker — How It Works

This document explains what the app does, how data flows through it, and how the main features work.

## 1) What this app is

AI Front Page Tracker captures a screenshot of a selected BBC language service front page, then runs AI-powered analyses on the captured image.

Main capabilities:

- Capture a live front page screenshot
- Run multiple analysis types (summary, sentiment, coverage, etc.)
- Ask follow-up questions about the captured front page
- Display analysis results in structured visual UI blocks

---

## 2) High-level architecture

The project has two parts:

- `client/` (React frontend)
  - Lets users select region/service
  - Sends capture + analysis requests
  - Renders image preview and analysis outputs

- `server/` (Node.js + Express backend)
  - Uses Playwright to open the page and take a screenshot
  - Uses Gemini API to perform analyses
  - Stores the most recent screenshot in `server/Screengrabs/`

### Main backend technologies

- Express (API server)
- Playwright (browser automation + screenshots)
- Sharp (image conversion to WebP)
- Gemini (`@google/generative-ai`) for AI analysis

---

## 3) End-to-end user flow

1. User selects a region and language service in the UI.
2. User clicks **Capture front page**.
3. Frontend calls `POST /api/capture`.
4. Backend:
   - launches Playwright
   - navigates to the target URL
   - attempts cookie-banner handling
   - applies ad/tracker filtering and ad-placeholder cleanup
   - captures screenshot and saves WebP file
   - deletes older screenshots (keeps only latest)
5. Frontend receives filename and displays screenshot preview.
6. User selects an analysis type.
7. Frontend calls `POST /api/analyze` with filename + analysis type.
8. Backend runs the selected Gemini analysis and returns structured results.
9. Frontend renders the result section (charts, lists, text blocks).
10. User can ask a follow-up question.
11. Frontend calls `POST /api/ask-frontpage` and streams response progressively.

---

## 4) API endpoints

### Health

- `GET /health`
- Returns: `{ "status": "ok" }`

### Capture

- `POST /api/capture`
- Body:
  - `url` (string)
  - `serviceName` (string)
- Returns:
  - success + `filename`

### Analyze

- `POST /api/analyze`
- Body:
  - `filename` (string)
  - `analysisType` (string)
  - `serviceName` (string)
- Returns:
  - success + `results` object for selected analysis type

### Follow-up Q&A (streaming)

- `POST /api/ask-frontpage`
- Body:
  - `filename` (string)
  - `question` (string)
  - `serviceName` (string)
- Returns:
  - streamed plain-text answer chunks

---

## 5) Supported analysis types

Current analysis options include:

- Top 5 summary
- Rewrite for social media
- Updates frequency
- Sentiment analysis
- Coverage quality
- Audience fit

The frontend maps each analysis type to an explainer text shown in the UI.

---

## 6) Frontend behavior details

- API base URL is configurable via `REACT_APP_API_BASE_URL`.
- During capture and analysis, controls are disabled to avoid conflicting actions.
- Loading states show status messages and animated loaders.
- Follow-up Q&A supports progressive output rendering as the model generates text.
- When a new capture succeeds, previous analysis state is reset.

---

## 7) Screenshot storage behavior

To keep server storage small:

- After each successful new capture, old screenshot files are deleted.
- Only the latest capture remains in `server/Screengrabs/`.

---

## 8) Deployment model

Typical production setup:

- Frontend (`client/`) on Netlify
- Backend (`server/`) on Render (or equivalent Node host)

Key environment variables:

### Frontend

- `REACT_APP_API_BASE_URL` = deployed backend base URL

### Backend

- `GEMINI_API_KEY` = Gemini API key
- `PORT` = provided by host
- `PLAYWRIGHT_BROWSERS_PATH=0` (for browser binary path consistency)
- `CHROMIUM_EXECUTABLE_PATH` (optional, host-specific fallback)

---

## 9) Keep-alive (optional)

A helper script exists:

- `scripts/keep_render_alive.sh`

It pings the Render `/health` endpoint and can be run via cron every 14 minutes to reduce cold starts on free-tier hosting.

---

## 10) Troubleshooting quick notes

- If capture fails: check backend logs first (`/api/capture` error details).
- If analysis fails: verify `GEMINI_API_KEY` on backend host.
- If frontend cannot reach backend: verify `REACT_APP_API_BASE_URL` and CORS behavior.
- If Playwright cannot launch browser: ensure browser install/build steps and env vars are correctly configured on host.

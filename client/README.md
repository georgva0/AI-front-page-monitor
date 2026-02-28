# AI Front Page Tracker (Frontend)

This frontend powers the **AI Front Page Tracker** user interface.

It lets users:

- choose a BBC language service by region,
- capture the latest front page screenshot via backend automation,
- run multiple AI analyses on the captured image,
- ask follow-up questions and receive streamed responses.

## What the app does

The UI communicates with a backend API to:

1. Capture a fresh screenshot of a selected front page.
2. Display that screenshot preview.
3. Run one selected analysis type (summary, sentiment, coverage, audience fit, etc.).
4. Show structured analysis output and charts.
5. Allow follow-up Q&A about the same front page.

## Tech stack

- React (Create React App)
- Chart.js + react-chartjs-2
- Treemap chart plugin (`chartjs-chart-treemap`)

## Environment variables

Create a `.env` file in `client/` (or configure in Netlify):

```env
REACT_APP_API_BASE_URL=http://localhost:5000
```

For production, set this to your deployed backend URL.

## Scripts

From `client/`:

- `npm start` — run local development server
- `npm run build` — create production build
- `npm test` — run tests

## Local development

1. Start backend in `server/`.
2. Set `REACT_APP_API_BASE_URL` to backend URL (default local: `http://localhost:5000`).
3. Start frontend:

```bash
cd client
npm install
npm start
```

## Deployment notes

This frontend is designed to be deployed on Netlify.

Expected setup:

- Base directory: `client`
- Build command: `npm ci && npm run build`
- Publish directory: `build`
- Environment variable: `REACT_APP_API_BASE_URL=<your-backend-url>`

For full deployment instructions, see:

- `../DEPLOY_NETLIFY.md`
- `../HOW_IT_WORKS.md`

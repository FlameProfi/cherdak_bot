# cherdak_bot

## Structure

- `apps/api` — Express API, Telegram bot, SQLite access, booking endpoints
- `apps/web` — React + Vite frontend for `/`, `/menu`, `/booking`
- `data` — local SQLite database

## Scripts

- `npm run dev:server` — start API and bot with auto-reload
- `npm run dev:web` — start Vite frontend with HMR
- `npm run build:web` — build frontend into `apps/web/dist`
- `npm test` — run backend logic tests

## Notes

- In production, the API serves the built frontend from `apps/web/dist`.
- During frontend development, Vite proxies `/api` requests to `http://localhost:3000`.

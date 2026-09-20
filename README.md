# Mapflowy

Astro + Lit implementation of a full-screen, keyboard-first hierarchical organizer.

## Development

```sh
npm install
npm run dev
```

Use `npm run check`, `npm test`, and `npm run build` before deploying. The organizer is local-first: workspace data is saved to browser `localStorage` and is not synchronized between devices.

## Deploying the static site

Connect the repository to Cloudflare Pages with these settings:

- Build command: `npm run build`
- Build output directory: `dist`

Choose the production hostname before inviting users. Browser storage is isolated by origin, so data saved on a preview URL or previous domain does not automatically appear on a new domain.

## Routes

- `/` anonymous-first organizer
- `/home` public product and OAuth homepage
- `/login`, `/signup`, `/forgot-password` dormant authentication shells that are not linked from the live UI
- `/privacy` local-first privacy notice and `/terms` draft terms

## Future backend

Keep the static frontend on Cloudflare Workers Static Assets or Pages and run the API/database on a VPS under a sibling subdomain such as `api.example.com`. The planned endpoints are `GET /v1/me`, `GET/PUT /v1/organizer`, email auth routes, and `/auth/google/start` plus `/auth/google/callback`. Use secure HTTP-only cookies, explicit credentialed CORS for the frontend origin, ownership checks, and revision/ETag conflict detection.

# Voronoi Organizer

Astro + Lit implementation of a full-screen, keyboard-first hierarchical organizer.

## Development

```sh
npm install
npm run dev
```

Use `npm run check`, `npm test`, and `npm run build` before deploying. Set `PUBLIC_API_BASE_URL` when the authentication backend exists; until then the auth routes remain safe, non-submitting UI shells.

## Routes

- `/` anonymous-first organizer
- `/home` public product and OAuth homepage
- `/login`, `/signup`, `/forgot-password` authentication shells
- `/privacy`, `/terms` draft legal pages

## Future backend

Keep the static frontend on Cloudflare Workers Static Assets or Pages and run the API/database on a VPS under a sibling subdomain such as `api.example.com`. The planned endpoints are `GET /v1/me`, `GET/PUT /v1/organizer`, email auth routes, and `/auth/google/start` plus `/auth/google/callback`. Use secure HTTP-only cookies, explicit credentialed CORS for the frontend origin, ownership checks, and revision/ETag conflict detection.

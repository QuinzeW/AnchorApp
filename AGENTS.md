# AnchorApp

Next.js App Router application with Payload CMS and an offline-first frontend.

## Project conventions

- Keep frontend routes and UI in `src/app/(frontend)/`.
- Preserve the existing screen design unless a change explicitly requests a redesign.
- Store offline user data through the existing local IndexedDB layer; do not add remote persistence unless requested.
- Keep Payload configuration and collection definitions under `src/`.
- Do not commit secrets or local database files.
- Validate changes with TypeScript and a production build when practical.

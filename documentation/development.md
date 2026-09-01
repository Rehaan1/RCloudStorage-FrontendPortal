# Development and Operations

## Prerequisites

- Node.js 20.9 or later
- A running RCloudStorage coordinator; its default local address is `http://localhost:9000`

## Local setup

From the portal directory:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. If the coordinator runs elsewhere, update `.env.local`:

```dotenv
RCLOUD_STORAGE_URL=http://your-coordinator-host:9000
```

`RCLOUD_STORAGE_URL` is intentionally not prefixed with `NEXT_PUBLIC_`, because it is read only by the server-side proxy.

## Validation commands

```powershell
npm run lint
npm run build
```

The production build checks TypeScript and validates the App Router route structure. Linting uses ESLint with Next.js Core Web Vitals rules.

## Deployment guidance

Deploy the Next.js portal where it can reach the coordinator over a trusted network. Configure `RCLOUD_STORAGE_URL` in the deployment environment and expose the portal HTTPS endpoint to the intended user.

Do not set the storage URL to an individual replica node. RCloudStorage documents the coordinator as the only normal public client entry point; a direct node write can bypass quorum replication.

## Current limitations and planned backend work

The portal reflects the backend as it exists today:

- No authentication or authorization: restrict network access until this exists.
- No share-link endpoint: the UI intentionally does not offer sharing.
- No object metadata in the list endpoint: file size, modification date, and previews cannot be shown reliably.
- Object upload keys are the active folder path plus the selected filename (or browser-provided relative path). Choosing the same full key replaces the existing logical object.
- Empty folders are represented by a `.rcloud-folder` zero-byte marker object; deleting a folder is intentionally not exposed because it would require a recursive delete confirmation and coordinator support for safe batch semantics.
- Search filters the loaded list only; it does not query the server by prefix.
- The coordinator's metadata durability is currently separate from replicated object bytes, as documented in the backend project.

Useful next backend additions are authentication, a structured object-list response with metadata, dedicated share-link routes, and CORS only if a direct-browser architecture is intentionally preferred over the portal proxy.

## Documentation asset

`public/assets/portal-dashboard-preview.png` is the README preview image. It was generated as a representative UI mockup for documentation; it is not a live capture and should be replaced with an automated screenshot once browser-based end-to-end tests are introduced.

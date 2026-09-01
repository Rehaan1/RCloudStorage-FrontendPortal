# Frontend Portal Documentation

This folder documents the current RCloudStorage frontend portal: its purpose, architecture, integration contract, and day-to-day development workflow.

| Document | Use it for |
| --- | --- |
| [Architecture](architecture.md) | How the browser, Next.js portal, and storage coordinator communicate |
| [Development and operations](development.md) | Local setup, validation, configuration, deployment, and limitations |

## Scope

The portal is a single-user, mobile-first web interface for the existing RCloudStorage coordinator. It intentionally implements only the coordinator's present public API:

- Browse object keys
- Search the loaded file list
- Browse paths and create folders
- Upload one or more files into the active folder, with per-file progress, cancellation, and retry
- Download a file
- Delete a file after confirmation

Authentication, user accounts, file metadata, previews, and public share links are not available in the current Go backend, so they are not simulated in the UI. Folders are implemented client-side on top of slash-delimited coordinator object keys and zero-byte folder markers.

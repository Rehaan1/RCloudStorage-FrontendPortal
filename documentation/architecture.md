# Portal Architecture

## Purpose

`RCloudStorage-FrontendPortal` is a Next.js 16 application that provides a responsive user interface for RCloudStorage. It is built mobile-first: small screens use a compact file list and a floating upload control; larger screens expose the same operations with a persistent toolbar and large drop zone.

## System boundary

```text
Browser
  |
  | GET/PUT/DELETE /api/storage/objects/...
  v
Next.js portal (:3000)
  |
  | server-side proxy
  | RCLOUD_STORAGE_URL/objects/...
  v
RCloudStorage coordinator (:9000 by default)
  |
  v
Replicated storage nodes
```

The browser never calls a storage node. It calls the portal's same-origin API route, which forwards requests only to the public coordinator.

## Why a proxy exists

The current Go coordinator does not set browser CORS headers. Calling it directly from a separately hosted frontend would therefore fail in the browser. The dynamic Next.js route at `src/app/api/storage/[...path]/route.ts` solves this by:

1. Receiving browser requests under `/api/storage/...`.
2. Reading the private server environment variable `RCLOUD_STORAGE_URL`.
3. Forwarding the method, request body, content type, and query string to the coordinator.
4. Returning the upstream response status, stream, and relevant download headers.

If the coordinator cannot be reached, it returns HTTP `502` and a useful JSON error.

## Key implementation files

| File | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Renders the portal homepage |
| `src/components/storage-portal.tsx` | Client-side file library, search, file chooser, drag/drop, progress feedback, download, and delete controls |
| `src/lib/storage.ts` | Browser API client and object-key encoding |
| `src/app/api/storage/[...path]/route.ts` | Same-origin server proxy to the coordinator |
| `src/app/globals.css` | Mobile-first design system and responsive layout |

## UI behaviour

### File list and search

On initial load, the portal calls `GET /api/storage/objects`, reads the newline-delimited keys, sorts them alphabetically, and renders them as files. Search is entirely client-side and filters the currently loaded keys; it does not issue a backend prefix query.

### Uploads and progress

The portal uploads each selected file to a key matching the file's basename. A browser `XMLHttpRequest` is used for uploads because standard `fetch` does not expose upload-progress events. For multiple files, uploads run sequentially and the displayed percentage is weighted by total bytes, rather than treating a large video and a small text file as equal work.

### Downloads and deletion

Download links use the same portal proxy route and therefore do not expose the coordinator URL to browser code. Deletion asks for a user confirmation, calls `DELETE`, and removes the row only after the request succeeds.

## Coordinator API contract

| Operation | Coordinator endpoint | Expected response |
| --- | --- | --- |
| List | `GET /objects` | Plain text, one object key per line |
| Upload | `PUT /objects/{key}` | `201 Created` |
| Download | `GET /objects/{key}` | File bytes and content headers |
| Delete | `DELETE /objects/{key}` | `204 No Content` |

Object-key path segments are URL encoded by the client and proxy. Use the coordinator—not a node URL—as `RCLOUD_STORAGE_URL`; direct node writes can bypass replication quorum.

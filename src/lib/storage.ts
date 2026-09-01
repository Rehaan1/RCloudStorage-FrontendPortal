export type StorageObject = { key: string };

export const FOLDER_MARKER = ".rcloud-folder";

// The coordinator's public route accepts a single `{key}` path segment. Encoding
// the complete logical key keeps slash-delimited paths intact for that route.
const endpoint = (key = "") => `/api/storage/objects${key ? `/${encodeURIComponent(key)}` : ""}`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response;
}

export class UploadError extends Error {
  constructor(message: string, readonly kind: "cancelled" | "network" | "server") {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadHandle = { promise: Promise<void>; cancel: () => void };

export async function listObjects(): Promise<StorageObject[]> {
  const response = await request(endpoint());
  return (await response.text()).split("\n").map((key) => key.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((key) => ({ key }));
}

/** Starts an upload immediately. Retain the returned handle to cancel it. */
export function uploadObject(key: string, file: Blob, onProgress?: (percentage: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", endpoint(key));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(); return; }
      reject(new UploadError(`The server could not store this file (HTTP ${xhr.status}).`, "server"));
    };
    xhr.onerror = () => reject(new UploadError("Network error. Check your connection and retry.", "network"));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", "cancelled"));
    xhr.send(file);
  });
  return { promise, cancel: () => xhr.abort() };
}

export function createFolder(path: string) {
  return uploadObject(`${path}/${FOLDER_MARKER}`, new Blob([], { type: "application/octet-stream" })).promise;
}

export async function deleteObject(key: string) {
  await request(endpoint(key), { method: "DELETE" });
}

export function downloadUrl(key: string) { return endpoint(key); }

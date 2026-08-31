export type StorageObject = { key: string };

const endpoint = (key = "") => `/api/storage/objects${key ? `/${key.split("/").map(encodeURIComponent).join("/")}` : ""}`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response;
}

export async function listObjects(): Promise<StorageObject[]> {
  const response = await request(endpoint());
  return (await response.text()).split("\n").map((key) => key.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((key) => ({ key }));
}

export async function uploadObject(key: string, file: File) {
  await request(endpoint(key), { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
}

export async function deleteObject(key: string) {
  await request(endpoint(key), { method: "DELETE" });
}

export function downloadUrl(key: string) { return endpoint(key); }

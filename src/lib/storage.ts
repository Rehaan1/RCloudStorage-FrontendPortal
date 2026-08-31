export type StorageObject = {
  key: string;
  size?: number;
  type?: string;
  createdAt?: string;
  modifiedAt?: string;
};

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
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  return (await response.text()).split("\n").map((key) => key.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((key) => ({ key }));
}

export function uploadObject(key: string, file: File | null, onProgress?: (percentage: number) => void): { abort: () => void; promise: Promise<void> } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", endpoint(key));
    if (file) {
      xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(); return; }
      reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading the file."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(file);
  });

  return { abort: () => xhr.abort(), promise };
}

export async function deleteObject(key: string) {
  await request(endpoint(key), { method: "DELETE" });
}

export function downloadUrl(key: string) { return endpoint(key); }

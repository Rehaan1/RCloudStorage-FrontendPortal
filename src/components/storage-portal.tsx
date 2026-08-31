"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteObject, downloadUrl, listObjects, StorageObject, uploadObject } from "@/lib/storage";

const fileLabel = (key: string) => key.split("/").filter(Boolean).pop() || key;
const fileKind = (key: string) => {
  const extension = key.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension ?? "")) return "image";
  if (["mp4", "mov", "mkv", "webm"].includes(extension ?? "")) return "video";
  if (["pdf", "doc", "docx", "txt", "md"].includes(extension ?? "")) return "document";
  return "file";
};

function formatSize(bytes?: number) {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString?: string) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString();
}

type UploadStatus = "pending" | "uploading" | "completed" | "error" | "cancelled";
type UploadTask = {
  id: string;
  file: File;
  key: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  abort?: () => void;
};

type DisplayItem =
  | { type: "folder"; name: string; key: string }
  | { type: "file"; name: string; key: string; object: StorageObject };

export function StoragePortal() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setObjects(await listObjects()); setNotice(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not load your files."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  const startUpload = (task: UploadTask) => {
    setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, status: "uploading", progress: 0, error: undefined } : t));
    const { abort, promise } = uploadObject(task.key, task.file, (progress) => {
      setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, progress } : t));
    });
    setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, abort } : t));

    promise.then(() => {
      setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, status: "completed", progress: 100 } : t));
      void refresh();
    }).catch((err) => {
      if (err.message === "Upload was cancelled.") {
        setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, status: "cancelled" } : t));
      } else {
        setUploads((prev) => prev.map(t => t.id === task.id ? { ...t, status: "error", error: err.message } : t));
      }
    });
  };

  const upload = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const newTasks: UploadTask[] = list.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      key: currentPath + file.name,
      status: "pending",
      progress: 0,
    }));
    setUploads((prev) => [...prev, ...newTasks]);
    newTasks.forEach(startUpload);
  };

  const cancelUpload = (id: string) => {
    const task = uploads.find(t => t.id === id);
    if (task?.abort) task.abort();
  };

  const retryUpload = (id: string) => {
    const task = uploads.find(t => t.id === id);
    if (task) startUpload(task);
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter(t => t.id !== id));
  };

  const clearCompletedUploads = () => {
    setUploads((prev) => prev.filter(t => t.status !== "completed"));
  };

  const createFolder = async () => {
    const folderName = window.prompt("Enter folder name:");
    if (!folderName) return;
    const sanitized = folderName.trim().replace(/\//g, "");
    if (!sanitized) return;
    const newKey = currentPath + sanitized + "/";
    try {
      const { promise } = uploadObject(newKey, null);
      await promise;
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to create folder.");
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void upload(event.target.files); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); };

  const remove = async (key: string) => {
    const isFolder = key.endsWith("/");
    if (!window.confirm(`Delete “${fileLabel(key)}”? This cannot be undone.`)) return;
    try {
      if (isFolder) {
        const toDelete = objects.filter(o => o.key.startsWith(key));
        for (const obj of toDelete) {
          await deleteObject(obj.key);
        }
        setObjects((current) => current.filter((object) => !object.key.startsWith(key)));
      } else {
        await deleteObject(key);
        setObjects((current) => current.filter((object) => object.key !== key));
      }
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed."); }
  };

  const visible = useMemo(() => {
    if (query) {
      return objects
        .filter(obj => obj.key.toLowerCase().includes(query.toLowerCase()) && !obj.key.endsWith("/"))
        .map(obj => ({ type: "file" as const, name: fileLabel(obj.key), key: obj.key, object: obj }));
    }

    const items: Record<string, DisplayItem> = {};
    for (const obj of objects) {
      if (!obj.key.startsWith(currentPath)) continue;
      if (obj.key === currentPath) continue;

      const relativePath = obj.key.substring(currentPath.length);
      const slashIndex = relativePath.indexOf("/");

      if (slashIndex === -1) {
        items[relativePath] = { type: "file", name: relativePath, key: obj.key, object: obj };
      } else if (slashIndex === relativePath.length - 1) {
        const folderName = relativePath.slice(0, -1);
        if (!items[folderName]) {
          items[folderName] = { type: "folder", name: folderName, key: obj.key };
        }
      } else {
        const folderName = relativePath.substring(0, slashIndex);
        if (!items[folderName]) {
          items[folderName] = { type: "folder", name: folderName, key: currentPath + folderName + "/" };
        }
      }
    }
    return Object.values(items).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });
  }, [objects, currentPath, query]);

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>RCloud<span>Storage</span></span></div><span className="status"><i /> Coordinator</span></header>
    <section className="hero"><p className="eyebrow">PERSONAL CLOUD</p><h1>Your files, within reach.</h1><p>Upload, find, and download files stored safely through your RCloudStorage coordinator.</p></section>

    <section className="controls">
      <label className="search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files" />
      </label>
      <button className="upload-button" onClick={createFolder}>+ Folder</button>
      <button className="upload-button" onClick={() => inputRef.current?.click()}>+ Upload</button>
    </section>

    <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInput} />

    <div className={`drop-zone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}>
      <strong>Drop files here</strong><span>or tap to choose from your device</span>
    </div>

    {uploads.length > 0 && (
      <div className="uploads-container" role="status" aria-live="polite">
        <div className="uploads-header">
          <span>Uploads</span>
          {uploads.some(u => u.status === "completed") && (
            <button onClick={clearCompletedUploads} className="clear-uploads">Clear completed</button>
          )}
        </div>
        {uploads.map((upload) => (
          <div key={upload.id} className={`upload-item ${upload.status}`}>
            <div className="upload-info">
              <span className="upload-name">{upload.file.name}</span>
              <span className="upload-status-text">
                {upload.status === "uploading" ? `${upload.progress}%` :
                 upload.status === "error" ? "Failed" :
                 upload.status === "cancelled" ? "Cancelled" :
                 upload.status === "completed" ? "Done" : "Pending"}
              </span>
            </div>
            {upload.status === "uploading" && (
              <div className="progress-track" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.progress}>
                <i style={{ width: `${upload.progress}%` }} />
              </div>
            )}
            {upload.error && <div className="upload-error">{upload.error}</div>}
            <div className="upload-actions">
              {upload.status === "uploading" && <button onClick={() => cancelUpload(upload.id)}>Cancel</button>}
              {(upload.status === "error" || upload.status === "cancelled") && <button onClick={() => retryUpload(upload.id)}>Retry</button>}
              {(upload.status === "error" || upload.status === "cancelled" || upload.status === "completed") && <button onClick={() => removeUpload(upload.id)}>Dismiss</button>}
            </div>
          </div>
        ))}
      </div>
    )}

    {notice && <p className="notice" role="status">{notice}</p>}

    <section className="files">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h2>My files</h2>
        </div>
        <button className="refresh" onClick={() => void refresh()} disabled={loading}>↻ Refresh</button>
      </div>

      {!query && (
        <nav className="breadcrumb">
          <button onClick={() => setCurrentPath("")} className={!currentPath ? "active" : ""}>Home</button>
          {currentPath.split("/").filter(Boolean).map((part, index, arr) => {
            const path = arr.slice(0, index + 1).join("/") + "/";
            return (
              <span key={path}>
                <span className="separator">/</span>
                <button onClick={() => setCurrentPath(path)} className={currentPath === path ? "active" : ""}>{part}</button>
              </span>
            );
          })}
        </nav>
      )}

      {loading ? (
        <div className="empty">Loading files…</div>
      ) : visible.length ? (
        <ul className="file-list">
          {visible.map((item) => (
            <li key={item.key} className="file-row">
              <span className={`file-icon ${item.type === "folder" ? "folder" : fileKind(item.key)}`}>
                {item.type === "folder" ? "📁" : fileKind(item.key) === "image" ? "◈" : fileKind(item.key) === "video" ? "▶" : "▤"}
              </span>
              <div className="file-name" onClick={() => item.type === "folder" && setCurrentPath(item.key)} style={{ cursor: item.type === "folder" ? "pointer" : "default" }}>
                <strong title={item.key}>{item.name}</strong>
                <span title={item.key}>
                  {item.type === "file" && item.object.size !== undefined ? formatSize(item.object.size) : ""}
                  {item.type === "file" && item.object.size !== undefined && item.object.modifiedAt ? " • " : ""}
                  {item.type === "file" && item.object.modifiedAt ? formatDate(item.object.modifiedAt) : ""}
                  {item.type === "folder" ? "Folder" : ""}
                </span>
              </div>
              <div className="file-actions">
                {item.type === "file" && <a href={downloadUrl(item.key)} download={item.name}>Download</a>}
                <button onClick={() => void remove(item.key)} aria-label={`Delete ${item.name}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <strong>{query ? "No matching files" : currentPath ? "This folder is empty" : "Your library is empty"}</strong>
          <span>{query ? "Try another search." : currentPath ? "Add files to this folder." : "Add your first file to get started."}</span>
        </div>
      )}
    </section>

    <button className="mobile-upload" onClick={() => inputRef.current?.click()} aria-label="Upload files">+</button>
  </main>;
}

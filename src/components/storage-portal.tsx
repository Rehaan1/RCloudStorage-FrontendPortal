"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFolder, deleteObject, downloadUrl, FOLDER_MARKER, listObjects, StorageObject, UploadError, uploadObject } from "@/lib/storage";

type UploadStatus = "uploading" | "complete" | "failed" | "cancelled";
type UploadItem = { id: string; file: File; key: string; progress: number; status: UploadStatus; error?: string };

const fileLabel = (key: string) => key.split("/").filter(Boolean).pop() || key;
const joinPath = (path: string, name: string) => [path, name].filter(Boolean).join("/");
const fileKind = (key: string) => {
  const extension = key.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension ?? "")) return "image";
  if (["mp4", "mov", "mkv", "webm"].includes(extension ?? "")) return "video";
  if (["pdf", "doc", "docx", "txt", "md"].includes(extension ?? "")) return "document";
  return "file";
};

export function StoragePortal() {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, ReturnType<typeof uploadObject>>());
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [query, setQuery] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setObjects(await listObjects()); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not load your files."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);
  useEffect(() => () => { controllers.current.forEach(({ cancel }) => cancel()); }, []);

  const startUpload = useCallback((item: UploadItem) => {
    setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: "uploading", progress: 0, error: undefined } : upload));
    const handle = uploadObject(item.key, item.file, (progress) => {
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, progress } : upload));
    });
    controllers.current.set(item.id, handle);
    void handle.promise.then(() => {
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, progress: 100, status: "complete" } : upload));
      void refresh();
    }).catch((error: unknown) => {
      const cancelled = error instanceof UploadError && error.kind === "cancelled";
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: cancelled ? "cancelled" : "failed", error: error instanceof Error ? error.message : "Upload failed." } : upload));
    }).finally(() => controllers.current.delete(item.id));
  }, [refresh]);

  const addUploads = (files: FileList | File[]) => {
    const additions = Array.from(files).map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return { id: crypto.randomUUID(), file, key: joinPath(currentPath, relativePath.replaceAll("\\", "/").replace(/^\/+/, "")), progress: 0, status: "uploading" as const };
    });
    if (!additions.length) return;
    setUploads((current) => [...additions, ...current]);
    additions.forEach(startUpload);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addUploads(event.target.files); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); addUploads(event.dataTransfer.files); };
  const cancelUpload = (id: string) => controllers.current.get(id)?.cancel();
  const retryUpload = (item: UploadItem) => startUpload(item);

  const submitFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) { setNotice("Use a folder name without slashes."); return; }
    setCreatingFolder(true);
    try {
      await createFolder(joinPath(currentPath, name));
      setFolderName(""); setFolderOpen(false); setNotice(`Folder “${name}” created.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? `Could not create folder: ${error.message}` : "Could not create folder."); }
    finally { setCreatingFolder(false); }
  };

  const remove = async (key: string) => {
    if (!window.confirm(`Delete “${fileLabel(key)}”? This cannot be undone.`)) return;
    try { await deleteObject(key); setObjects((current) => current.filter((object) => object.key !== key)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed."); }
  };

  const { folders, files } = useMemo(() => {
    const prefix = currentPath ? `${currentPath}/` : "";
    const folderNames = new Set<string>();
    const directFiles: StorageObject[] = [];
    for (const object of objects) {
      if (!object.key.startsWith(prefix)) continue;
      const remainder = object.key.slice(prefix.length);
      if (!remainder || remainder === FOLDER_MARKER) continue;
      const slash = remainder.indexOf("/");
      if (slash >= 0) folderNames.add(remainder.slice(0, slash));
      else directFiles.push(object);
    }
    return { folders: [...folderNames].sort((a, b) => a.localeCompare(b)), files: directFiles.sort((a, b) => a.key.localeCompare(b.key)) };
  }, [currentPath, objects]);
  const visibleFolders = folders.filter((name) => name.toLowerCase().includes(query.toLowerCase()));
  const visibleFiles = files.filter(({ key }) => key.toLowerCase().includes(query.toLowerCase()));
  const breadcrumbs = currentPath ? currentPath.split("/") : [];
  const activeUploads = uploads.filter(({ status }) => status === "uploading");

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>RCloud<span>Storage</span></span></div><span className="status"><i /> Coordinator</span></header>
    <section className="hero"><p className="eyebrow">PERSONAL CLOUD</p><h1>Your files, within reach.</h1><p>Organize folders, upload, find, and download files stored through your RCloudStorage coordinator.</p></section>
    <section className="controls"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" aria-label="Search this folder" /></label><button className="secondary-button" onClick={() => setFolderOpen((open) => !open)}>+ Folder</button><button className="upload-button" onClick={() => inputRef.current?.click()}>+ Upload</button></section>
    {folderOpen && <form className="folder-form" onSubmit={(event) => void submitFolder(event)}><label>Folder name<input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="e.g. Project files" /></label><button className="upload-button" disabled={creatingFolder}>{creatingFolder ? "Creating…" : "Create folder"}</button><button type="button" className="text-button" onClick={() => setFolderOpen(false)}>Cancel</button></form>}
    <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInput} />
    <div className={`drop-zone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}><strong>Drop files into {currentPath || "your library"}</strong><span>or tap to choose from your device</span></div>
    {uploads.length > 0 && <section className="upload-queue" aria-label="Uploads" aria-live="polite"><div className="upload-queue-heading"><strong>Uploads {activeUploads.length ? `(${activeUploads.length} active)` : ""}</strong><button className="text-button" onClick={() => setUploads((current) => current.filter(({ status }) => status === "uploading"))}>Clear finished</button></div>{uploads.map((upload) => <div className={`upload-item ${upload.status}`} key={upload.id}><div><strong>{fileLabel(upload.key)}</strong><span>{upload.status === "uploading" ? `${upload.progress}% · Uploading to ${upload.key}` : upload.status === "complete" ? "Uploaded" : upload.error}</span></div>{upload.status === "uploading" && <><div className="mini-progress"><i style={{ width: `${upload.progress}%` }} /></div><button className="text-button danger" onClick={() => cancelUpload(upload.id)}>Cancel</button></>}{(upload.status === "failed" || upload.status === "cancelled") && <button className="text-button" onClick={() => retryUpload(upload)}>Retry</button>}<span className="upload-state">{upload.status}</span></div>)}</section>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="files"><div className="section-heading"><div><p className="eyebrow">LIBRARY</p><h2>{currentPath || "My files"}</h2></div><button className="refresh" onClick={() => void refresh()} disabled={loading}>↻ Refresh</button></div>
      <nav className="breadcrumbs" aria-label="Folder path"><button onClick={() => setCurrentPath("")}>My files</button>{breadcrumbs.map((segment, index) => <span key={`${segment}-${index}`}><b>/</b><button onClick={() => setCurrentPath(breadcrumbs.slice(0, index + 1).join("/"))}>{segment}</button></span>)}</nav>
      {loading ? <div className="empty">Loading files…</div> : visibleFolders.length || visibleFiles.length ? <ul className="file-list">{visibleFolders.map((name) => <li key={`folder-${name}`} className="file-row folder-row"><span className="file-icon folder">▰</span><button className="folder-link" onClick={() => { setCurrentPath(joinPath(currentPath, name)); setQuery(""); }}><strong>{name}</strong><span>Folder</span></button><button className="text-button" onClick={() => { setCurrentPath(joinPath(currentPath, name)); setQuery(""); }}>Open</button></li>)}{visibleFiles.map(({ key }) => <li key={key} className="file-row"><span className={`file-icon ${fileKind(key)}`}>{fileKind(key) === "image" ? "◈" : fileKind(key) === "video" ? "▶" : "▤"}</span><div className="file-name"><strong title={key}>{fileLabel(key)}</strong><span title={key}>{key}</span></div><div className="file-actions"><a href={downloadUrl(key)} download={fileLabel(key)}>Download</a><button onClick={() => void remove(key)} aria-label={`Delete ${key}`}>Delete</button></div></li>)}</ul> : <div className="empty"><strong>{query ? "No matching files or folders" : "This folder is empty"}</strong><span>{query ? "Try another search." : "Create a folder or add your first file."}</span></div>}</section>
    <button className="mobile-upload" onClick={() => inputRef.current?.click()} aria-label="Upload files">+</button>
  </main>;
}

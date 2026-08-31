"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { deleteObject, downloadUrl, listObjects, StorageObject, uploadObject } from "@/lib/storage";

const fileLabel = (key: string) => key.split("/").filter(Boolean).pop() || key;
const fileKind = (key: string) => {
  const extension = key.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension ?? "")) return "image";
  if (["mp4", "mov", "mkv", "webm"].includes(extension ?? "")) return "video";
  if (["pdf", "doc", "docx", "txt", "md"].includes(extension ?? "")) return "document";
  return "file";
};

export function StoragePortal() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      let completedBytes = 0;
      const totalBytes = list.reduce((total, file) => total + file.size, 0);
      for (const file of list) {
        await uploadObject(file.name, file, (fileProgress) => {
          const currentBytes = file.size * (fileProgress / 100);
          setUploadProgress(totalBytes ? Math.round(((completedBytes + currentBytes) / totalBytes) * 100) : 100);
        });
        completedBytes += file.size;
      }
      await refresh();
      setNotice(`${list.length} file${list.length === 1 ? "" : "s"} uploaded successfully.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); setUploadProgress(null); }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void upload(event.target.files); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); };
  const remove = async (key: string) => {
    if (!window.confirm(`Delete “${fileLabel(key)}”? This cannot be undone.`)) return;
    try { await deleteObject(key); setObjects((current) => current.filter((object) => object.key !== key)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed."); }
  };
  const visible = objects.filter(({ key }) => key.toLowerCase().includes(query.toLowerCase()));

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>RCloud<span>Storage</span></span></div><span className="status"><i /> Coordinator</span></header>
    <section className="hero"><p className="eyebrow">PERSONAL CLOUD</p><h1>Your files, within reach.</h1><p>Upload, find, and download files stored safely through your RCloudStorage coordinator.</p></section>
    <section className="controls"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files" /></label><button className="upload-button" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "+ Upload"}</button></section>
    <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInput} />
    <div className={`drop-zone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}><strong>Drop files here</strong><span>or tap to choose from your device</span></div>
    {uploading && <div className="upload-progress" role="status" aria-live="polite"><div><span>Uploading your files</span><strong>{uploadProgress ?? 0}%</strong></div><div className="progress-track" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress ?? 0}><i style={{ width: `${uploadProgress ?? 0}%` }} /></div></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="files"><div className="section-heading"><div><p className="eyebrow">LIBRARY</p><h2>My files</h2></div><button className="refresh" onClick={() => void refresh()} disabled={loading}>↻ Refresh</button></div>
      {loading ? <div className="empty">Loading files…</div> : visible.length ? <ul className="file-list">{visible.map(({ key }) => <li key={key} className="file-row"><span className={`file-icon ${fileKind(key)}`}>{fileKind(key) === "image" ? "◈" : fileKind(key) === "video" ? "▶" : "▤"}</span><div className="file-name"><strong title={key}>{fileLabel(key)}</strong><span title={key}>{key}</span></div><div className="file-actions"><a href={downloadUrl(key)} download={fileLabel(key)}>Download</a><button onClick={() => void remove(key)} aria-label={`Delete ${key}`}>Delete</button></div></li>)}</ul> : <div className="empty"><strong>{query ? "No matching files" : "Your library is empty"}</strong><span>{query ? "Try another search." : "Add your first file to get started."}</span></div>}</section>
    <button className="mobile-upload" onClick={() => inputRef.current?.click()} aria-label="Upload files">+</button>
  </main>;
}

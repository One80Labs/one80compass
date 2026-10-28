import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import { usePortal } from "./shell";
import { MilestonePanel } from "./plan";
import { EditDrawer, PageHead, Pill, Tabs, fileKind, formatSize, formatWhen } from "./ui";
import { VaultStaffControls } from "./vault-staff";
import type { MilestoneView } from "../../../packages/domain/src/milestones";
import { MAX_UPLOAD_BYTES } from "../../../packages/domain/src/index";

type Health = "green" | "yellow" | "red" | "";
type OverviewResponse = {
  project: { name: string };
  overview: { health: Health | null; healthExplanation: string | null; notes: string };
  links: { applicationId: string; displayName: string; moduleKey: string }[];
  summary: { activeDocuments: number; deletedDocuments: number; progress?: string };
  milestones: MilestoneView[];
  publishedReport: { reportId: string; title: string; publishedAt: string } | null;
  activity: { eventId: string; action: string; at: string }[];
};
type DocumentSourceLabel = "compass-upload" | "krisp" | "fireflies" | "other";
type ListedDocument = {
  documentId: string;
  name: string;
  folder: string;
  createdAt: string;
  /** Last stored version time, or createdAt when no file is stored yet. */
  updatedAt?: string;
  currentFileName: string | null;
  currentVersionId: string | null;
  /** 1-based index of the current stored version; 0 when no file is stored. */
  versionNumber?: number;
  versionCount?: number;
  deletedAt?: string | null;
  /** Vault filing label. Null keeps the file out of the staff vault. */
  sourceLabel?: DocumentSourceLabel | null;
};
type ListedFolder = { path: string; name: string; parent: string };
type StoredVersion = {
  versionId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export function modulePath(moduleKey: string, projectId: string): string {
  if (moduleKey === "documents") return `/projects/${projectId}/documents`;
  if (moduleKey === "plan") return `/projects/${projectId}/plan`;
  if (moduleKey === "kanban") return `/projects/${projectId}/kanban`;
  if (moduleKey === "reports") return `/projects/${projectId}/reports`;
  if (moduleKey === "audit") return `/projects/${projectId}/audit`;
  return `/projects/${projectId}/overview`;
}

export function OverviewPage({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const portal = usePortal();
  const canWrite = portal.canWrite;
  const project = portal.projects.find((item) => item.projectId === projectId);
  const customer = portal.customers.find((item) => item.customerId === portal.customerId);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [sync, setSync] = useState("Checking GitHub…");
  const [tab, setTab] = useState("Timeline");
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState<Health>("");
  const [explanation, setExplanation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<OverviewResponse>(`/projects/${projectId}/overview`, session.idToken)
      .then((result) => {
        setData(result);
        setHealth(result.overview.health ?? "");
        setExplanation(result.overview.healthExplanation ?? "");
        setNotes(result.overview.notes);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not open the project."));
    api<{ sync: { status: string; detail: string | null } }>(`/projects/${projectId}/plan`, session.idToken)
      .then((result) => setSync(result.sync.detail || result.sync.status))
      .catch(() => setSync("GitHub status is unavailable."));
  }, [projectId, session]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/overview`, session.idToken, {
        method: "PUT",
        body: { health: health || null, healthExplanation: explanation, notes },
      });
      const result = await api<OverviewResponse>(`/projects/${projectId}/overview`, session.idToken);
      setData(result);
      setHealth(result.overview.health ?? "");
      setExplanation(result.overview.healthExplanation ?? "");
      setNotes(result.overview.notes);
      setSaving(false);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the overview.");
      setSaving(false);
    }
  }

  function closeEdit() {
    setSaving(false);
    setEditing(false);
  }

  const name = data?.project.name ?? project?.name ?? "this project";
  const healthLabel = health === "green" ? "Green" : health === "yellow" ? "Yellow" : health === "red" ? "Red" : "Not set";

  return (
    <>
      <PageHead
        title="Project overview."
        subtitle={`Key information and status for ${name}.`}
        action={
          canWrite ? (
            <button className="btn primary" type="button" onClick={() => setEditing(true)}>
              Edit overview
            </button>
          ) : undefined
        }
      />
      {!session && <p>Sign in to open this project.</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="meta-strip">
            <div>
              <label>Customer</label>
              <strong>{customer?.name ?? "Not set"}</strong>
            </div>
            <div>
              <label>Status</label>
              <strong>{healthLabel}</strong>
            </div>
            <div>
              <label>Milestone</label>
              <strong>{data.milestones[0]?.title ?? "None"}</strong>
            </div>
            <div>
              <label>Started</label>
              <strong>{project?.createdAt ? formatWhen(project.createdAt) : "Not set"}</strong>
            </div>
            <div>
              <label>Target end date</label>
              <strong>Not set</strong>
            </div>
          </div>
          <div className="grid two">
            <div>
              <h3 className="section-title">Project description</h3>
              <p className="copy">{data.overview.notes || (canWrite ? "No description yet. Use Edit overview to add notes." : "No description yet.")}</p>
              {data.overview.healthExplanation && <p className="copy">Health note: {data.overview.healthExplanation}</p>}
            </div>
            <div>
              <MilestonePanel
                session={session}
                projectId={projectId}
                canWrite={canWrite}
                milestones={data.milestones}
                onReload={async () => {
                  const result = await api<OverviewResponse>(`/projects/${projectId}/overview`, session?.idToken ?? "");
                  setData(result);
                }}
              />
            </div>
          </div>
          <Tabs label="Overview" tabs={["Timeline", "Key stakeholders", "Links", "GitHub"]} value={tab} onChange={setTab} />
          {tab === "Timeline" &&
            (data.milestones.length === 0 ? (
              <p className="copy">No GitHub milestones on this project yet. Phase dates for the whole project are still a later part of this release.</p>
            ) : (
              <div className="timeline">
                {data.milestones.map((item) => (
                  <div className={`timeline-step ${item.state === "confirmed" ? "" : "current"}`} key={item.key}>
                    <strong>{item.title}</strong>
                    {item.targetDate ? ` Target ${item.targetDate}` : " No target date"}
                    {item.late ? " · Late" : ""}
                    {item.state === "ready" ? " · Ready for confirmation" : item.state === "confirmed" ? " · Confirmed" : " · Open"}
                  </div>
                ))}
              </div>
            ))}
          {tab === "Key stakeholders" && (
            <section className="panel">
              <h3>Key stakeholders</h3>
              <p className="copy">A Contributor can edit, add, and upload. View can open this project and cannot change it. Invitations are managed in Settings.</p>
            </section>
          )}
          {tab === "Links" && (
            <section className="panel">
              <h3>Project links</h3>
              {data.links.length === 0 && <p className="copy">No modules are enabled for this project.</p>}
              <ul className="goal-list">
                {data.links.map((link) => (
                  <li key={link.applicationId}>
                    <Link to={modulePath(link.moduleKey, projectId)}>{link.displayName}</Link>
                  </li>
                ))}
              </ul>
              <p className="copy">
                Progress: {data.summary.progress ?? "Not Started / No Tasks"}. {data.summary.activeDocuments} active documents.
                {data.publishedReport ? ` Latest report: ${data.publishedReport.title}.` : " No published report yet."}
              </p>
            </section>
          )}
          {tab === "GitHub" && (
            <section className="panel">
              <h3>GitHub integration</h3>
              <p className="copy">{sync}</p>
              <Link className="btn" to={modulePath("plan", projectId)}>
                Open project plan
              </Link>
            </section>
          )}
        </>
      )}
      {editing && canWrite && (
        <EditDrawer title="Edit overview" onClose={closeEdit} onSubmit={save} saving={saving}>
          <p>Health and notes are saved for this project.</p>
          <label>
            Health
            <select className="field" value={health} onChange={(event) => setHealth(event.target.value as Health)}>
              <option value="">Not set</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
            </select>
          </label>
          <label>
            Health explanation
            <input className="field" value={explanation} onChange={(event) => setExplanation(event.target.value)} />
          </label>
          <label>
            Notes
            <textarea className="field" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
        </EditDrawer>
      )}
    </>
  );
}

export function DocumentsPage({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const portal = usePortal();
  const canWrite = portal.canWrite;
  const projectName = portal.projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const [documents, setDocuments] = useState<ListedDocument[]>([]);
  const [deleted, setDeleted] = useState<ListedDocument[]>([]);
  const [tab, setTab] = useState("All documents");
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<ListedFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<ListedFolder | null>(null);
  const [renamingDocument, setRenamingDocument] = useState<ListedDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<ListedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = Boolean(session?.adminGroup);

  async function reload() {
    if (!session) return;
    const active = await api<{ documents: ListedDocument[]; folders: ListedFolder[] }>(`/projects/${projectId}/documents`, session.idToken);
    const bin = await api<{ documents: ListedDocument[] }>(`/projects/${projectId}/documents?state=deleted`, session.idToken);
    setDocuments(active.documents);
    setFolders(active.folders ?? []);
    setDeleted(bin.documents);
  }

  useEffect(() => {
    if (!session) return;
    reload().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load documents."));
  }, [projectId, session]);

  async function upload(file: File, name: string, folder: string, documentId?: string) {
    if (!session) return;
    const path = documentId ? `/projects/${projectId}/documents/${documentId}/versions` : `/projects/${projectId}/documents`;
    const created = await api<{ documentId: string; versionId: string; uploadUrl: string }>(path, session.idToken, {
      method: "POST",
      body: { name: name || file.name, folder, fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size },
    });
    const put = await fetch(created.uploadUrl, { method: "PUT", body: file });
    if (!put.ok) throw new Error("The file did not upload.");
    await api(`/projects/${projectId}/documents/${created.documentId}/versions/${created.versionId}/complete`, session.idToken, { method: "POST" });
    await reload();
  }

  const browsing = tab === "All documents";
  const source = tab === "Recycle bin" ? deleted : documents;
  const scoped = browsing
    ? source.filter((document) => (query ? inFolderTree(document.folder, currentFolder) : document.folder === currentFolder))
    : source;
  const visible = scoped.filter((document) => document.name.toLowerCase().includes(query.toLowerCase()));
  const childFolders = browsing
    ? folders.filter((folder) => folder.parent === currentFolder && (!query || folder.name.toLowerCase().includes(query.toLowerCase())))
    : [];
  const crumbs = currentFolder ? currentFolder.split("/") : [];

  return (
    <>
      <PageHead
        title="Documents."
        subtitle={`Manage project documents and versions for ${projectName}.`}
        action={
          canWrite && browsing ? (
            <div className="row">
              <button className="btn" type="button" onClick={() => setCreatingFolder(true)}>
                New folder
              </button>
              <button className="btn primary" type="button" onClick={() => setUploading(true)}>
                Upload document
              </button>
            </div>
          ) : undefined
        }
      />
      {!session && <p>Sign in to open documents.</p>}
      {error && <p className="error">{error}</p>}
      {session?.adminGroup && <VaultStaffControls session={session} projectId={projectId} />}
      <Tabs label="Documents" tabs={["All documents", "Recycle bin"]} value={tab} onChange={setTab} />
      <>
          {browsing && (
            <nav className="crumbs" aria-label="Folders">
              <button type="button" className={currentFolder ? "" : "current"} onClick={() => setCurrentFolder("")}>
                All documents
              </button>
              {crumbs.map((part, index) => {
                const path = crumbs.slice(0, index + 1).join("/");
                return (
                  <span key={path}>
                    <span aria-hidden="true"> / </span>
                    <button type="button" className={path === currentFolder ? "current" : ""} onClick={() => setCurrentFolder(path)}>
                      {part}
                    </button>
                  </span>
                );
              })}
            </nav>
          )}
          <div className="toolbar">
            <input type="search" value={query} placeholder="Search documents…" aria-label="Search documents" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {childFolders.map((folder) => (
                  <tr key={folder.path}>
                    <td>
                      <button className="linkish" type="button" onClick={() => { setQuery(""); setCurrentFolder(folder.path); }}>
                        <FolderMark />
                        <strong>{folder.name}</strong>
                      </button>
                    </td>
                    <td>Folder</td>
                    <td />
                    <td />
                    <td />
                    <td>
                      {canWrite && (
                        <span className="row">
                          <button className="btn small" type="button" onClick={() => setRenamingFolder(folder)}>
                            Rename
                          </button>
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => {
                              if (!session) return;
                              api(`/projects/${projectId}/folders/delete`, session.idToken, { method: "POST", body: { path: folder.path } })
                                .then(() => {
                                  if (currentFolder === folder.path) setCurrentFolder(folder.parent);
                                  return reload();
                                })
                                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not remove the folder."));
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.map((document) => (
                  <tr key={document.documentId}>
                    <td>
                      <button className="linkish" type="button" onClick={() => navigate(`/projects/${projectId}/documents/${document.documentId}`)}>
                        <span className={`file-icon ${fileKind(document.currentFileName).toLowerCase()}`}>▣</span>
                        <strong>{document.name}</strong>
                      </button>
                    </td>
                    <td>{fileKind(document.currentFileName)}</td>
                    <td>{document.versionNumber ? `v${document.versionNumber}` : "No file"}</td>
                    <td>
                      <Pill tone={tab === "Recycle bin" ? "orange" : "good"}>{tab === "Recycle bin" ? "Recycle bin" : "Current"}</Pill>
                    </td>
                    <td>{formatWhen(document.updatedAt ?? document.createdAt)}</td>
                    <td>
                      {tab === "Recycle bin" ? (
                        canWrite && (
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => {
                              if (!session) return;
                              api(`/projects/${projectId}/documents/${document.documentId}/restore`, session.idToken, { method: "POST", body: {} })
                                .then(reload)
                                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not restore the document."));
                            }}
                          >
                            Restore
                          </button>
                        )
                      ) : (
                        <span className="row">
                          <button className="btn small" type="button" onClick={() => navigate(`/projects/${projectId}/documents/${document.documentId}`)}>
                            Open
                          </button>
                          {canWrite && (
                            <button className="btn small" type="button" onClick={() => setRenamingDocument(document)}>
                              Rename
                            </button>
                          )}
                          {canWrite && (
                            <MoveFolder
                              folders={folders}
                              value={document.folder}
                              onMove={(folder) => {
                                if (!session) return;
                                api(`/projects/${projectId}/documents/${document.documentId}`, session.idToken, { method: "PATCH", body: { folder } })
                                  .then(reload)
                                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not move the document."));
                              }}
                            />
                          )}
                          {isAdmin && (
                            <SourceLabelSelect
                              value={document.sourceLabel ?? null}
                              onChange={(sourceLabel) => {
                                if (!session) return;
                                api(`/projects/${projectId}/documents/${document.documentId}`, session.idToken, {
                                  method: "PATCH",
                                  body: { sourceLabel },
                                })
                                  .then(reload)
                                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not set the source label."));
                              }}
                            />
                          )}
                          {canWrite && (
                            <button
                              className="btn small"
                              type="button"
                              title="Move to the recycle bin. You can restore it later."
                              onClick={() => setDeletingDocument(document)}
                            >
                              Delete
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {childFolders.length === 0 && visible.length === 0 && <div className="empty">{browsing && currentFolder && !query ? "This folder is empty." : "No documents match this view."}</div>}
          </div>
      </>
      {uploading && session && (
        <div className="dialog-layer" onClick={() => setUploading(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Upload document" onClick={(event) => event.stopPropagation()}>
            <h2>Upload document</h2>
            <p>The file is stored for this project after the upload finishes. Drop a file here or choose one from your computer.</p>
            <UploadForm
              folders={folders}
              folder={currentFolder}
              onCancel={() => setUploading(false)}
              onUpload={async (file, name, folder) => {
                setError(null);
                await upload(file, name, folder);
                setUploading(false);
              }}
            />
          </div>
        </div>
      )}
      {creatingFolder && session && (
        <FolderForm
          title="New folder"
          description={currentFolder ? `This folder is created inside ${currentFolder}.` : "This folder is created in All documents."}
          submitLabel="Create folder"
          maxLength={80}
          onClose={() => setCreatingFolder(false)}
          onSubmit={async (name) => {
            await api(`/projects/${projectId}/folders`, session.idToken, { method: "POST", body: { name, parent: currentFolder } });
            setCreatingFolder(false);
            await reload();
          }}
        />
      )}
      {renamingFolder && session && (
        <FolderForm
          title="Rename folder"
          description={renamingFolder.parent ? `This folder stays inside ${renamingFolder.parent}.` : "This folder stays in All documents."}
          initialName={renamingFolder.name}
          submitLabel="Rename folder"
          maxLength={80}
          onClose={() => setRenamingFolder(null)}
          onSubmit={async (name) => {
            const previousPath = renamingFolder.path;
            const result = await api<{ path: string }>(`/projects/${projectId}/folders/rename`, session.idToken, {
              method: "POST",
              body: { path: previousPath, name },
            });
            if (currentFolder === previousPath || currentFolder.startsWith(`${previousPath}/`)) {
              const next =
                currentFolder === previousPath ? result.path : `${result.path}${currentFolder.slice(previousPath.length)}`;
              setCurrentFolder(next);
            }
            setRenamingFolder(null);
            await reload();
          }}
        />
      )}
      {renamingDocument && session && (
        <FolderForm
          title="Rename document"
          description="This changes the display name in the library. The stored file name stays the same."
          initialName={renamingDocument.name}
          submitLabel="Rename"
          onClose={() => setRenamingDocument(null)}
          onSubmit={async (name) => {
            await api(`/projects/${projectId}/documents/${renamingDocument.documentId}`, session.idToken, {
              method: "PATCH",
              body: { name },
            });
            setRenamingDocument(null);
            await reload();
          }}
        />
      )}
      {deletingDocument && session && (
        <ConfirmDialog
          title="Move to recycle bin?"
          body={`“${deletingDocument.name}” leaves All documents and can be restored from the Recycle bin later.`}
          confirmLabel="Move to recycle bin"
          onClose={() => setDeletingDocument(null)}
          onConfirm={async () => {
            await api(`/projects/${projectId}/documents/${deletingDocument.documentId}/delete`, session.idToken, {
              method: "POST",
              body: {},
            });
            setDeletingDocument(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

export function DocumentDetailPage({ session }: { session: Session | null }) {
  const { projectId = "", documentId = "" } = useParams();
  const canWrite = usePortal().canWrite;
  const isAdmin = Boolean(session?.adminGroup);
  const navigate = useNavigate();
  const [document, setDocument] = useState<ListedDocument | null>(null);
  const [folders, setFolders] = useState<ListedFolder[]>([]);
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [tab, setTab] = useState("Preview");
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function reload() {
    if (!session) return;
    const active = await api<{ documents: ListedDocument[]; folders: ListedFolder[] }>(`/projects/${projectId}/documents`, session.idToken);
    const bin = await api<{ documents: ListedDocument[] }>(`/projects/${projectId}/documents?state=deleted`, session.idToken);
    const found = [...active.documents, ...bin.documents].find((item) => item.documentId === documentId) ?? null;
    setDocument(found);
    setFolders(active.folders ?? []);
    const history = await api<{ versions: StoredVersion[] }>(`/projects/${projectId}/documents/${documentId}/versions`, session.idToken);
    setVersions(history.versions);
  }

  useEffect(() => {
    if (!session) return;
    reload().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not open the document."));
  }, [projectId, documentId, session]);

  const orderedVersions = [...versions].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const current = orderedVersions.find((version) => version.versionId === document?.currentVersionId) ?? orderedVersions[orderedVersions.length - 1];
  const currentVersionNumber = current
    ? orderedVersions.findIndex((version) => version.versionId === current.versionId) + 1
    : 0;
  const kind = fileKind(current?.fileName ?? document?.currentFileName ?? null);
  const previewMode = previewKind(current?.contentType ?? null, current?.fileName ?? null);

  // Load a short-lived inline URL for browser-native preview (PDF, image, text).
  useEffect(() => {
    if (!session || !current || tab !== "Preview" || previewMode === "none") {
      setPreviewUrl(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    const query = `?inline=1&versionId=${encodeURIComponent(current.versionId)}`;
    api<{ url: string }>(`/projects/${projectId}/documents/${documentId}/download${query}`, session.idToken)
      .then((result) => {
        if (!cancelled) {
          setPreviewUrl(result.url);
          setPreviewLoading(false);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setPreviewError(caught instanceof Error ? caught.message : "Could not load the preview.");
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, projectId, documentId, current?.versionId, tab, previewMode]);

  function download(versionId?: string) {
    if (!session) return;
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
    api<{ url: string }>(`/projects/${projectId}/documents/${documentId}/download${query}`, session.idToken)
      .then((result) => window.open(result.url, "_blank", "noopener"))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Download failed."));
  }

  return (
    <>
      <button className="backlink" type="button" onClick={() => navigate(`/projects/${projectId}/documents`)}>
        ← Back to documents
      </button>
      {!session && <p>Sign in to open documents.</p>}
      {error && <p className="error">{error}</p>}
      {!document && session && !error && <p>Loading document…</p>}
      {document && (
        <>
          <div className="docdetailbar">
            <div>
              <div className="small muted">
                ▣ {kind}
                {current ? ` · ${formatSize(current.sizeBytes)}` : ""}
                {currentVersionNumber ? ` · v${currentVersionNumber}` : ""}
                {document.deletedAt ? " · Recycle bin" : ""}
              </div>
              <h2>{document.name}</h2>
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={() => download(current?.versionId)}>
                Download
              </button>
              {session && canWrite && !document.deletedAt && (
                <button className="btn" type="button" onClick={() => setRenaming(true)}>
                  Rename
                </button>
              )}
              {session && canWrite && document.deletedAt && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    api(`/projects/${projectId}/documents/${document.documentId}/restore`, session.idToken, { method: "POST", body: {} })
                      .then(reload)
                      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not restore the document."));
                  }}
                >
                  Restore
                </button>
              )}
              {session && canWrite && !document.deletedAt && (
                <button className="btn" type="button" title="Move to the recycle bin. You can restore it later." onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </div>
          </div>
          <Tabs label="Document" tabs={["Preview", "Version history", "Audit history"]} value={tab} onChange={setTab} />
          {tab === "Preview" && (
            <div className="preview-grid">
              <DocumentPreview
                documentName={document.name}
                hasFile={Boolean(current)}
                mode={previewMode}
                url={previewUrl}
                loading={previewLoading}
                error={previewError}
                onDownload={() => download(current?.versionId)}
              />
              <section className="panel">
                <h3>Version details</h3>
                <dl className="detail-list">
                  <dt>Version</dt>
                  <dd>{currentVersionNumber ? `v${currentVersionNumber}` : "No file"}</dd>
                  <dt>Status</dt>
                  <dd>
                    <Pill tone={document.deletedAt ? "orange" : "good"}>{document.deletedAt ? "Recycle bin" : "Current"}</Pill>
                  </dd>
                  <dt>Uploaded on</dt>
                  <dd>{current ? formatWhen(current.createdAt) : "Not set"}</dd>
                  <dt>File size</dt>
                  <dd>{current ? formatSize(current.sizeBytes) : "Not set"}</dd>
                  <dt>File type</dt>
                  <dd>{kind}</dd>
                  <dt>Folder</dt>
                  <dd>
                    {document.deletedAt || !canWrite ? (
                      document.folder || "All documents"
                    ) : (
                      <MoveFolder
                        folders={folders}
                        value={document.folder}
                        onMove={(folder) => {
                          if (!session) return;
                          api(`/projects/${projectId}/documents/${document.documentId}`, session.idToken, { method: "PATCH", body: { folder } })
                            .then(reload)
                            .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not move the document."));
                        }}
                      />
                    )}
                  </dd>
                  {isAdmin && (
                    <>
                      <dt>Vault label</dt>
                      <dd>
                        {document.deletedAt ? (
                          document.sourceLabel ?? "None"
                        ) : (
                          <SourceLabelSelect
                            value={document.sourceLabel ?? null}
                            onChange={(sourceLabel) => {
                              if (!session) return;
                              api(`/projects/${projectId}/documents/${document.documentId}`, session.idToken, {
                                method: "PATCH",
                                body: { sourceLabel },
                              })
                                .then(reload)
                                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not set the source label."));
                            }}
                          />
                        )}
                      </dd>
                    </>
                  )}
                </dl>
                {previewMode === "none" && current && (
                  <p className="copy">This file type cannot be previewed in the browser. Download it to open locally.</p>
                )}
                {session && canWrite && !document.deletedAt && (
                  <VersionForm onUpload={(file) => addVersion(session, projectId, document, file).then(reload)} />
                )}
              </section>
            </div>
          )}
          {tab === "Version history" && (
            <section className="panel">
              <h3>Version history</h3>
              {orderedVersions.length === 0 && <p className="copy">No stored versions yet.</p>}
              <ul className="goal-list">
                {orderedVersions.map((version, index) => {
                  const isCurrent = version.versionId === document.currentVersionId;
                  return (
                    <li key={version.versionId}>
                      <strong>v{index + 1}</strong>
                      {isCurrent ? " · Current · " : " · "}
                      {version.fileName} · {formatSize(version.sizeBytes)} · {formatWhen(version.createdAt)}{" "}
                      <button className="btn small" type="button" onClick={() => download(version.versionId)}>
                        Download
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {tab === "Audit history" && (
            <section className="panel">
              <h3>Audit history</h3>
              <p className="copy">Document changes are recorded in the project audit.</p>
              <Link className="btn" to={`/projects/${projectId}/audit`}>
                Open the audit
              </Link>
            </section>
          )}
        </>
      )}
      {renaming && document && session && (
        <FolderForm
          title="Rename document"
          description="This changes the display name in the library. The stored file name stays the same."
          initialName={document.name}
          submitLabel="Rename"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            await api(`/projects/${projectId}/documents/${document.documentId}`, session.idToken, { method: "PATCH", body: { name } });
            setRenaming(false);
            await reload();
          }}
        />
      )}
      {confirmDelete && document && session && (
        <ConfirmDialog
          title="Move to recycle bin?"
          body={`“${document.name}” leaves All documents and can be restored from the Recycle bin later.`}
          confirmLabel="Move to recycle bin"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api(`/projects/${projectId}/documents/${document.documentId}/delete`, session.idToken, { method: "POST", body: {} });
            navigate(`/projects/${projectId}/documents`);
          }}
        />
      )}
    </>
  );
}

type PreviewMode = "pdf" | "image" | "text" | "none";

/** Chooses a browser-native preview mode from MIME type, with extension fallback. */
function previewKind(contentType: string | null, fileName: string | null): PreviewMode {
  const type = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const extension = fileName?.split(".").pop()?.toLowerCase() ?? "";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(extension)) return "image";
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    ["txt", "md", "csv", "json", "xml", "log", "html", "htm", "css", "js", "ts"].includes(extension)
  ) {
    return "text";
  }
  return "none";
}

/** Renders the current file with a signed inline URL, or a clear fallback. */
function DocumentPreview({
  documentName,
  hasFile,
  mode,
  url,
  loading,
  error,
  onDownload,
}: {
  documentName: string;
  hasFile: boolean;
  mode: PreviewMode;
  url: string | null;
  loading: boolean;
  error: string | null;
  onDownload: () => void;
}) {
  if (!hasFile) {
    return (
      <div className="preview preview-empty">
        <div className="paper">
          <strong>{documentName}</strong>
          <small>No file is stored for this document yet.</small>
        </div>
      </div>
    );
  }

  if (mode === "none") {
    return (
      <div className="preview preview-empty">
        <div className="paper">
          <strong>{documentName}</strong>
          <small>Preview is available for PDF, images, and text files.</small>
          <button className="btn primary" type="button" onClick={onDownload}>
            Download to open
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="preview preview-empty">
        <p className="copy">Loading preview…</p>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="preview preview-empty">
        <div className="paper">
          <strong>Preview unavailable</strong>
          <small>{error ?? "Could not load the file."}</small>
          <button className="btn primary" type="button" onClick={onDownload}>
            Download instead
          </button>
        </div>
      </div>
    );
  }

  if (mode === "image") {
    return (
      <div className="preview preview-media">
        <img className="preview-image" src={url} alt={`Preview of ${documentName}`} />
      </div>
    );
  }

  return (
    <div className="preview preview-media">
      <iframe className="preview-frame" title={`Preview of ${documentName}`} src={url} />
    </div>
  );
}

async function addVersion(session: Session, projectId: string, document: ListedDocument, file: File) {
  const created = await api<{ documentId: string; versionId: string; uploadUrl: string }>(`/projects/${projectId}/documents/${document.documentId}/versions`, session.idToken, {
    method: "POST",
    body: { name: document.name, folder: document.folder, fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size },
  });
  const put = await fetch(created.uploadUrl, { method: "PUT", body: file });
  if (!put.ok) throw new Error("The file did not upload.");
  await api(`/projects/${projectId}/documents/${created.documentId}/versions/${created.versionId}/complete`, session.idToken, { method: "POST" });
}

/** Upload dialog fields: drop or pick a file, edit display name, choose destination folder. */
function UploadForm({
  folders,
  folder: initialFolder,
  onCancel,
  onUpload,
}: {
  folders: ListedFolder[];
  folder: string;
  onCancel: () => void;
  onUpload: (file: File, name: string, folder: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState(initialFolder);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  /** Apply a chosen or dropped file and default the editable name to that file's name. */
  function applyFile(next: File | null) {
    if (next && next.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setName("");
      setFormError(`Files must be ${formatSize(MAX_UPLOAD_BYTES)} or smaller.`);
      return;
    }
    setFile(next);
    setName(next ? next.name : "");
    setFormError(null);
  }

  function onDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    const next = event.dataTransfer.files?.[0] ?? null;
    if (next) applyFile(next);
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) {
          setFormError("Choose or drop a file to upload.");
          return;
        }
        setBusy(true);
        setFormError(null);
        try {
          await onUpload(file, name.trim() || file.name, folder);
          setFile(null);
          setName("");
        } catch (caught) {
          setFormError(caught instanceof Error ? caught.message : "Upload failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div
        className={`upload-dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          className="upload-file-input"
          type="file"
          aria-label="Choose a file"
          onChange={(event) => applyFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="upload-dropzone-file">
            <strong>{file.name}</strong>
            <span>{formatSize(file.size)}</span>
          </p>
        ) : (
          <p className="upload-dropzone-hint">Drag and drop a file here, or</p>
        )}
        <button className="btn" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {file ? "Choose a different file" : "Choose file"}
        </button>
      </div>
      <label>
        Name
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={file ? file.name : "Document name"}
          required
          disabled={busy}
        />
      </label>
      <label>
        Folder
        <select className="field" aria-label="Upload folder" value={folder} onChange={(event) => setFolder(event.target.value)} disabled={busy}>
          <option value="">All documents</option>
          {folders.map((item) => (
            <option key={item.path} value={item.path}>
              {item.path}
            </option>
          ))}
        </select>
      </label>
      {formError && <p className="error">{formError}</p>}
      <div className="dialog-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

function FolderMark() {
  return (
    <svg className="file-icon" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function MoveFolder({ folders, value, onMove }: { folders: ListedFolder[]; value: string; onMove: (folder: string) => void }) {
  return (
    <select className="field move-folder" aria-label="Move to folder" value={value} onChange={(event) => onMove(event.target.value)}>
      <option value="">All documents</option>
      {folders.map((folder) => (
        <option key={folder.path} value={folder.path}>
          {folder.path}
        </option>
      ))}
    </select>
  );
}

/** Staff control for filing a document into the vault by source label. */
function SourceLabelSelect({
  value,
  onChange,
}: {
  value: DocumentSourceLabel | null;
  onChange: (sourceLabel: DocumentSourceLabel | null) => void;
}) {
  return (
    <select
      className="field"
      aria-label="Vault source label"
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === "" ? null : (next as DocumentSourceLabel));
      }}
    >
      <option value="">No vault label</option>
      <option value="compass-upload">compass-upload</option>
      <option value="krisp">krisp</option>
      <option value="fireflies">fireflies</option>
      <option value="other">other</option>
    </select>
  );
}

/** Shared create/rename dialog for folders and document display names. */
function FolderForm({
  title,
  description,
  initialName = "",
  submitLabel,
  maxLength = 200,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  initialName?: string;
  submitLabel: string;
  maxLength?: number;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="dialog-layer" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{description}</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            try {
              await onSubmit(name);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not save the name.");
            }
          }}
        >
          <label>
            Name
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} required maxLength={maxLength} autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="submit">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Confirms a soft-delete before the file moves to the recycle bin. */
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="dialog-layer" onClick={onClose}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{body}</p>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not complete that action.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function inFolderTree(folder: string, current: string): boolean {
  if (!current) return true;
  return folder === current || folder.startsWith(`${current}/`);
}

function VersionForm({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const input = event.currentTarget.elements.namedItem("version");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (!file) return;
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`Files must be ${formatSize(MAX_UPLOAD_BYTES)} or smaller.`);
          return;
        }
        await onUpload(file);
        event.currentTarget.reset();
      }}
    >
      <label>
        New version
        <input name="version" type="file" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit">
        Add version
      </button>
    </form>
  );
}

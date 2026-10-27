import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import { usePortal } from "./shell";
import { MilestonePanel } from "./plan";
import { Notice, PageHead, Pill, Tabs, fileKind, formatSize, formatWhen } from "./ui";
import type { MilestoneView } from "../../../packages/domain/src/milestones";

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
  currentFileName: string | null;
  currentVersionId: string | null;
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
    setError(null);
    try {
      await api(`/projects/${projectId}/overview`, session.idToken, {
        method: "PUT",
        body: { health: health || null, healthExplanation: explanation, notes },
      });
      const result = await api<OverviewResponse>(`/projects/${projectId}/overview`, session.idToken);
      setData(result);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the overview.");
    }
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
        <div className="dialog-layer" onClick={() => setEditing(false)}>
          <form className="dialog" role="dialog" aria-modal="true" aria-label="Edit overview" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h2>Edit overview</h2>
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
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Save overview
              </button>
            </div>
          </form>
        </div>
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
  const [error, setError] = useState<string | null>(null);

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
          canWrite ? (
            <div className="row">
              {browsing && (
                <button className="btn" type="button" onClick={() => setCreatingFolder(true)}>
                  New folder
                </button>
              )}
              <button className="btn primary" type="button" onClick={() => setUploading(true)}>
                Upload document
              </button>
            </div>
          ) : undefined
        }
      />
      {!session && <p>Sign in to open documents.</p>}
      {error && <p className="error">{error}</p>}
      <Tabs label="Documents" tabs={["All documents", "Recycle bin", "Baselines"]} value={tab} onChange={setTab} />
      {tab === "Baselines" ? (
        <section className="panel">
          <h3>Baselines</h3>
          <p className="copy">Document baselines are a later release. Current files stay in All documents.</p>
        </section>
      ) : (
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
                    <td>{document.currentVersionId ? "Current" : "No file"}</td>
                    <td>
                      <Pill tone={tab === "Recycle bin" ? "orange" : "good"}>{tab === "Recycle bin" ? "Recycle bin" : "Current"}</Pill>
                    </td>
                    <td>{formatWhen(document.createdAt)}</td>
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
                          {canWrite && (
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
      )}
      {uploading && session && (
        <div className="dialog-layer" onClick={() => setUploading(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Upload document" onClick={(event) => event.stopPropagation()}>
            <h2>Upload document</h2>
            <p>The file is stored for this project after the upload finishes.</p>
            <p>{currentFolder ? `This file goes in ${currentFolder}.` : "This file stays in All documents."}</p>
            <UploadForm
              folder={currentFolder}
              onUpload={async (file, name, folder) => {
                setError(null);
                try {
                  await upload(file, name, folder);
                  setUploading(false);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Upload failed.");
                }
              }}
            />
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => setUploading(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {creatingFolder && session && (
        <FolderForm
          parent={currentFolder}
          onClose={() => setCreatingFolder(false)}
          onCreate={async (name) => {
            await api(`/projects/${projectId}/folders`, session.idToken, { method: "POST", body: { name, parent: currentFolder } });
            setCreatingFolder(false);
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
  const navigate = useNavigate();
  const [document, setDocument] = useState<ListedDocument | null>(null);
  const [folders, setFolders] = useState<ListedFolder[]>([]);
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [tab, setTab] = useState("Preview");
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const current = versions.find((version) => version.versionId === document?.currentVersionId) ?? versions[0];
  const kind = fileKind(current?.fileName ?? document?.currentFileName ?? null);

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
              </div>
              <h2>{document.name}</h2>
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={() => download(current?.versionId)}>
                Download
              </button>
              <button className="btn primary" type="button" onClick={() => setNotice(true)}>
                More actions
              </button>
            </div>
          </div>
          <Tabs label="Document" tabs={["Preview", "Version history", "Baselines", "Audit history"]} value={tab} onChange={setTab} />
          {tab === "Preview" && (
            <div className="preview-grid">
              <div className="preview">
                <div className="paper">
                  <div className="small" style={{ color: "#C9683E", marginBottom: 28 }}>
                    One80Compass
                  </div>
                  <strong>
                    {document.name}
                  </strong>
                  <small>
                    {current ? formatWhen(current.createdAt) : "No file stored"}
                    <br />
                    Placeholder only. Download the file to read it.
                  </small>
                </div>
              </div>
              <section className="panel">
                <h3>Version details</h3>
                <dl className="detail-list">
                  <dt>Version</dt>
                  <dd>Current</dd>
                  <dt>Status</dt>
                  <dd>
                    <Pill tone="good">Current</Pill>
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
                </dl>
                <p className="copy">This preview is a placeholder. The stored file downloads from the project bucket.</p>
                {session && canWrite && <VersionForm onUpload={(file) => addVersion(session, projectId, document, file).then(reload)} />}
              </section>
            </div>
          )}
          {tab === "Version history" && (
            <section className="panel">
              <h3>Version history</h3>
              {versions.length === 0 && <p className="copy">No stored versions yet.</p>}
              <ul className="goal-list">
                {versions.map((version) => (
                  <li key={version.versionId}>
                    {version.fileName} · {formatSize(version.sizeBytes)} · {formatWhen(version.createdAt)}{" "}
                    <button className="btn small" type="button" onClick={() => download(version.versionId)}>
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tab === "Baselines" && (
            <section className="panel">
              <h3>Baselines</h3>
              <p className="copy">Baselines are a later release. Stored versions remain in Version history.</p>
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
      {notice && (
        <Notice
          title="More actions"
          body="Download and new versions are on this page. Permanent delete is a later release. Move the file to the recycle bin from the document library if you need to hide it."
          onClose={() => setNotice(false)}
        />
      )}
    </>
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

function UploadForm({ folder, onUpload }: { folder: string; onUpload: (file: File, name: string, folder: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return;
        await onUpload(file, name, folder);
        setFile(null);
        setName("");
      }}
    >
      <label>
        File
        <input
          className="field"
          type="file"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && !name) setName(next.name);
          }}
          required
        />
      </label>
      <label>
        Name
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <button className="btn primary" type="submit">
        Upload
      </button>
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

function FolderForm({ parent, onClose, onCreate }: { parent: string; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="dialog-layer" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="New folder" onClick={(event) => event.stopPropagation()}>
        <h2>New folder</h2>
        <p>{parent ? `This folder is created inside ${parent}.` : "This folder is created in All documents."}</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            try {
              await onCreate(name);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not create the folder.");
            }
          }}
        >
          <label>
            Name
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="submit">
              Create folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function inFolderTree(folder: string, current: string): boolean {
  if (!current) return true;
  return folder === current || folder.startsWith(`${current}/`);
}

function VersionForm({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("version");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (!file) return;
        await onUpload(file);
        event.currentTarget.reset();
      }}
    >
      <label>
        New version
        <input name="version" type="file" required />
      </label>
      <button className="btn" type="submit">
        Add version
      </button>
    </form>
  );
}

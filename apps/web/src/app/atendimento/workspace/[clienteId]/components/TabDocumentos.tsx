'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const FOLDERS = [
  { value: 'FISCAL',     label: 'Fiscal',              icon: '🧾' },
  { value: 'CONTABIL',   label: 'Contábil',             icon: '📊' },
  { value: 'PESSOAL',    label: 'Pessoal',              icon: '👷' },
  { value: 'PAYROLL',    label: 'Folha de Pagamento',   icon: '💵' },
  { value: 'SOCIETARIO', label: 'Societário',           icon: '🏛️' },
  { value: 'IR',         label: 'Imposto de Renda',     icon: '📋' },
  { value: 'CERTIDOES',  label: 'Certidões',            icon: '📜' },
  { value: 'OUTROS',     label: 'Outros',               icon: '📁' },
];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileIcon(mime?: string) {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  if (mime.includes('word')) return '📘';
  if (mime.includes('zip') || mime.includes('compressed')) return '🗜️';
  return '📄';
}

function formatCompetencia(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

export default function TabDocumentos({ clienteId }: { clienteId: string }) {
  const [tab, setTab] = useState<'docs' | 'checklist'>('docs');
  const [docs, setDocs] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderFilter, setFolderFilter] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState('OUTROS');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadComp, setUploadComp] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { fetchDocs(); }, [clienteId, folderFilter]);
  useEffect(() => { if (tab === 'checklist') fetchChecklist(); }, [tab, clienteId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchDocs() {
    setLoading(true);
    try {
      const params = folderFilter ? `?folder=${folderFilter}` : '';
      const res = await fetch(`${API}/documentos-contabil/cliente/${clienteId}${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChecklist() {
    try {
      const res = await fetch(`${API}/documentos-contabil/cliente/${clienteId}/checklist`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setChecklist(Array.isArray(data) ? data : []);
    } catch {
      setChecklist([]);
    }
  }

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    setUploadProgress(`Enviando ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('cliente_id', clienteId);
      fd.append('folder', uploadFolder);
      if (uploadDesc) fd.append('description', uploadDesc);
      if (uploadComp) fd.append('competencia', uploadComp);

      const res = await fetch(`${API}/documentos-contabil/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error('Falha no upload');
      setUploadProgress(null);
      setUploadDesc('');
      setUploadComp('');
      showToast('✅ Documento enviado com sucesso!');
      await fetchDocs();
    } catch (e: any) {
      setUploadProgress(null);
      showToast(`❌ Erro: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDownload(doc: any) {
    try {
      const res = await fetch(`${API}/documentos-contabil/${doc.id}/download`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Falha no download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_name || doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('❌ Erro ao baixar documento');
    }
  }

  async function handleShare(docId: string) {
    try {
      const res = await fetch(`${API}/documentos-contabil/${docId}/share`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      showToast('🔗 Link copiado! (expira em 24h)');
    } catch {
      showToast('❌ Erro ao gerar link');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover documento permanentemente?')) return;
    try {
      await fetch(`${API}/documentos-contabil/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      showToast('🗑️ Documento removido');
      await fetchDocs();
    } catch {
      showToast('❌ Erro ao remover');
    }
  }

  // Group docs by folder
  const grouped = FOLDERS.reduce((acc, f) => {
    const items = docs.filter(d => d.folder === f.value);
    if (items.length > 0) acc[f.value] = { ...f, items };
    return acc;
  }, {} as Record<string, any>);

  const totalDocs = docs.length;

  return (
    <div className="p-5 max-w-4xl space-y-4">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className="alert alert-info py-2 px-4 text-sm">{toast}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs tabs-boxed w-fit">
        <button className={`tab tab-sm ${tab === 'docs' ? 'tab-active' : ''}`} onClick={() => setTab('docs')}>
          📄 Documentos {totalDocs > 0 && <span className="ml-1 badge badge-sm">{totalDocs}</span>}
        </button>
        <button className={`tab tab-sm ${tab === 'checklist' ? 'tab-active' : ''}`} onClick={() => setTab('checklist')}>
          ✅ Checklist
        </button>
      </div>

      {tab === 'docs' && (
        <>
          {/* Upload zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${dragOver ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-md text-primary" />
                <p className="text-sm text-base-content/60">{uploadProgress}</p>
              </div>
            ) : (
              <>
                <p className="text-3xl mb-1">☁️</p>
                <p className="text-sm font-medium">Arraste um arquivo ou clique para selecionar</p>
                <p className="text-xs text-base-content/50 mt-1">PDF, Excel, Word, imagens — máx. 50 MB</p>
              </>
            )}
          </div>

          {/* Upload config */}
          <div className="grid grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Pasta</span></label>
              <select className="select select-bordered select-sm" value={uploadFolder} onChange={e => setUploadFolder(e.target.value)}>
                {FOLDERS.map(f => <option key={f.value} value={f.value}>{f.icon} {f.label}</option>)}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Competência (mês/ano)</span></label>
              <input type="month" className="input input-bordered input-sm" value={uploadComp} onChange={e => setUploadComp(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Descrição (opcional)</span></label>
              <input className="input input-bordered input-sm" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="Ex: Balancete março" />
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/50">Filtrar:</span>
            <div className="flex gap-1 flex-wrap">
              <button
                className={`btn btn-xs ${folderFilter === '' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFolderFilter('')}
              >
                Todos
              </button>
              {FOLDERS.map(f => (
                <button
                  key={f.value}
                  className={`btn btn-xs ${folderFilter === f.value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFolderFilter(f.value)}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Doc list */}
          {loading ? (
            <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-base-content/40">
              <p className="text-4xl mb-2">📁</p>
              <p className="text-sm">Nenhum documento cadastrado</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.values(grouped).map((folder: any) => (
                <div key={folder.value}>
                  <p className="text-xs font-bold text-base-content/50 uppercase mb-2 flex items-center gap-1">
                    {folder.icon} {folder.label}
                    <span className="badge badge-sm badge-ghost">{folder.items.length}</span>
                  </p>
                  <div className="space-y-2">
                    {folder.items.map((doc: any) => (
                      <DocRow
                        key={doc.id}
                        doc={doc}
                        onDownload={() => handleDownload(doc)}
                        onShare={() => handleShare(doc.id)}
                        onDelete={() => handleDelete(doc.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'checklist' && (
        <ChecklistTab checklist={checklist} />
      )}
    </div>
  );
}

function DocRow({ doc, onDownload, onShare, onDelete }: {
  doc: any;
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg bg-base-200 border border-base-300 group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-xl shrink-0">{fileIcon(doc.mime_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.name}</p>
        <p className="text-xs text-base-content/50 flex items-center gap-2 flex-wrap">
          {doc.uploaded_by?.name && <span>{doc.uploaded_by.name}</span>}
          {doc.size && <span>{formatSize(doc.size)}</span>}
          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
          {doc.description && <span className="italic">{doc.description}</span>}
        </p>
      </div>
      {doc.competencia && (
        <span className="badge badge-outline badge-sm shrink-0">
          {formatCompetencia(doc.competencia)}
        </span>
      )}
      <div className={`flex gap-1 transition-opacity ${hover ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={onDownload}
          className="btn btn-ghost btn-xs tooltip"
          data-tip="Baixar"
          title="Baixar"
        >⬇️</button>
        <button
          onClick={onShare}
          className="btn btn-ghost btn-xs"
          title="Copiar link"
        >🔗</button>
        <button
          onClick={onDelete}
          className="btn btn-ghost btn-xs text-error"
          title="Remover"
        >🗑️</button>
      </div>
    </div>
  );
}

function ChecklistTab({ checklist }: { checklist: any[] }) {
  if (checklist.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40">
        <p className="text-4xl mb-2">📋</p>
        <p className="text-sm">Checklist não disponível para este tipo de serviço</p>
      </div>
    );
  }

  const found = checklist.filter(i => i.encontrado).length;
  const total = checklist.length;
  const pct = Math.round((found / total) * 100);

  // Group by folder
  const byFolder: Record<string, any[]> = {};
  for (const item of checklist) {
    if (!byFolder[item.folder]) byFolder[item.folder] = [];
    byFolder[item.folder].push(item);
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <progress className="progress progress-primary flex-1" value={found} max={total} />
        <span className="text-sm font-bold whitespace-nowrap">{found}/{total} ({pct}%)</span>
      </div>

      {Object.entries(byFolder).map(([folder, items]) => {
        const folderInfo = FOLDERS.find(f => f.value === folder);
        return (
          <div key={folder}>
            <p className="text-xs font-bold text-base-content/50 uppercase mb-2">
              {folderInfo?.icon} {folderInfo?.label || folder}
            </p>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${item.encontrado ? 'bg-success/10 border-success/30' : 'bg-base-200 border-base-300'}`}>
                  <span className="text-lg">{item.encontrado ? '✅' : '⬜'}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${item.encontrado ? 'line-through text-base-content/50' : ''}`}>
                      {item.nome}
                    </p>
                    {item.obrigatorio && !item.encontrado && (
                      <span className="badge badge-error badge-xs">Obrigatório</span>
                    )}
                  </div>
                  {item.encontrado && <span className="text-xs text-success font-medium">Recebido</span>}
                  {!item.encontrado && <span className="text-xs text-base-content/40">Pendente</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

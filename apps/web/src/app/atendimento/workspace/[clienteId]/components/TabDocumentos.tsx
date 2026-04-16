'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const FOLDERS = [
  { value: 'CONTRATO', label: 'Contratos' },
  { value: 'PROCURACAO', label: 'Procurações' },
  { value: 'CERTIDAO', label: 'Certidões' },
  { value: 'NOTA_FISCAL', label: 'Notas Fiscais' },
  { value: 'SPED', label: 'SPED / Fiscais' },
  { value: 'FOLHA', label: 'Folha de Pagamento' },
  { value: 'IR', label: 'Imposto de Renda' },
  { value: 'CNPJ', label: 'CNPJ / Contrato Social' },
  { value: 'SOCIOS', label: 'Sócios' },
  { value: 'OUTROS', label: 'Outros' },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime?.includes('pdf')) return '📕';
  if (mime?.includes('image')) return '🖼️';
  if (mime?.includes('sheet') || mime?.includes('excel')) return '📗';
  if (mime?.includes('word')) return '📘';
  return '📄';
}

export default function TabDocumentos({ clienteId, tenantId }: { clienteId: string; tenantId?: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState('');

  useEffect(() => { fetch_(); }, [clienteId, folder]);

  async function fetch_() {
    setLoading(true);
    const params = folder ? `?folder=${folder}` : '';
    const res = await fetch(`${API}/documentos-contabil/cliente/${clienteId}${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setDocs(await res.json());
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover documento?')) return;
    await fetch(`${API}/documentos-contabil/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  const grouped = FOLDERS.reduce((acc, f) => {
    const items = docs.filter(d => d.folder === f.value);
    if (items.length > 0 || f.value === folder) acc[f.value] = { label: f.label, items };
    return acc;
  }, {} as Record<string, { label: string; items: any[] }>);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Documentos</h3>
        <select value={folder} onChange={e => setFolder(e.target.value)} className="select select-bordered select-sm">
          <option value="">Todas as pastas</option>
          {FOLDERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-base-content/40">
          <p className="text-3xl mb-2">📁</p>
          <p>Nenhum documento cadastrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([fv, { label, items }]) => (
            <div key={fv}>
              <p className="text-xs font-semibold text-base-content/50 uppercase mb-2">{label}</p>
              <div className="space-y-2">
                {items.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-base-200 border border-base-300">
                    <span className="text-xl">{fileIcon(doc.mime_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-base-content/50">
                        {doc.uploaded_by?.name && <>{doc.uploaded_by.name} · </>}
                        {doc.size && formatSize(doc.size)} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <button onClick={() => handleDelete(doc.id)} className="btn btn-ghost btn-xs text-error">✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import TabFichaContabil from './components/TabFichaContabil';
import TabObrigacoes from './components/TabObrigacoes';
import TabDocumentos from './components/TabDocumentos';
import TabHonorarios from './components/TabHonorarios';
import TabTimeline from './components/TabTimeline';
import TabComunicacoes from './components/TabComunicacoes';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STAGE_OPTIONS = ['ONBOARDING', 'ATIVO', 'SUSPENSO', 'ENCERRADO'];
const STAGE_COLORS: Record<string, string> = {
  ONBOARDING: 'badge-info', ATIVO: 'badge-success',
  SUSPENSO: 'badge-warning', ENCERRADO: 'badge-ghost',
};

const SERVICE_LABELS: Record<string, string> = {
  BPO_FISCAL: 'BPO Fiscal', BPO_CONTABIL: 'BPO Contábil', DP: 'Dep. Pessoal',
  ABERTURA: 'Abertura/Alteração', ENCERRAMENTO: 'Encerramento',
  IR_PF: 'IRPF', IR_PJ: 'IRPJ', CONSULTORIA: 'Consultoria', OUTRO: 'Outro',
};

type TabId = 'ficha' | 'obrigacoes' | 'documentos' | 'honorarios' | 'timeline' | 'comunicacoes';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'ficha', label: 'Ficha', icon: '🏢' },
  { id: 'obrigacoes', label: 'Obrigações', icon: '📅' },
  { id: 'documentos', label: 'Documentos', icon: '📄' },
  { id: 'honorarios', label: 'Honorários', icon: '💰' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'comunicacoes', label: 'Comunicações', icon: '💬' },
];

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params?.clienteId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('ficha');
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => { if (clienteId) fetchData(); }, [clienteId]);

  async function fetchData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/clientes-contabil/${clienteId}/workspace`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setData(await res.json());
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }

  async function handleStageChange(stage: string) {
    await fetch(`${API}/clientes-contabil/${clienteId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ stage }),
    });
    fetchData();
  }

  async function handleDelete() {
    await fetch(`${API}/clientes-contabil/${clienteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    router.push('/atendimento/clientes');
  }

  async function handleArchive() {
    if (!archiveReason) return;
    await fetch(`${API}/clientes-contabil/${clienteId}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ reason: archiveReason }),
    });
    setShowArchiveModal(false);
    fetchData();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-lg" />
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-full text-base-content/40">
      <div className="text-center">
        <p className="text-4xl mb-2">⚠️</p>
        <p>Cliente não encontrado</p>
      </div>
    </div>
  );

  const lead = data.lead;
  const ficha = lead?.ficha_contabil;

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex items-start gap-4 px-6 py-4 border-b border-base-300 bg-base-200/30">
        {/* Botão voltar */}
        <button
          onClick={() => router.push('/atendimento/clientes')}
          className="shrink-0 flex items-center gap-1.5 mt-0.5 px-3 py-1.5 rounded-lg text-sm font-medium text-base-content/60 hover:text-base-content hover:bg-base-300 transition-all"
          title="Voltar para Clientes Contábeis"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Clientes</span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate">{lead?.name || 'Sem nome'}</h1>
            <span className={`badge ${STAGE_COLORS[data.stage] || 'badge-ghost'}`}>{data.stage}</span>
            {data.archived && <span className="badge badge-error">Arquivado</span>}
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-base-content/60">
            <span>📱 {lead?.phone}</span>
            {ficha?.cnpj && <span>🔢 CNPJ: {ficha.cnpj}</span>}
            <span>📦 {SERVICE_LABELS[data.service_type] || data.service_type}</span>
            {data.regime_tributario && <span>💼 {data.regime_tributario.replace(/_/g, ' ')}</span>}
            {data.accountant && <span>👤 {data.accountant.name}</span>}
          </div>
        </div>

        {/* Controles de stage */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={data.stage}
            onChange={e => handleStageChange(e.target.value)}
            className="select select-sm select-bordered"
            disabled={data.archived}
          >
            {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!data.archived && (
            <button onClick={() => setShowArchiveModal(true)} className="btn btn-sm btn-ghost text-error">
              Encerrar
            </button>
          )}
          <button onClick={() => setShowDeleteModal(true)} className="btn btn-sm btn-error">
            Excluir
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex border-b border-base-300 bg-base-100 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/60 hover:text-base-content'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'ficha' && <TabFichaContabil cliente={data} onRefresh={() => fetchData(true)} />}
        {activeTab === 'obrigacoes' && <TabObrigacoes clienteId={clienteId} cliente={data} onRefresh={() => fetchData(true)} />}
        {activeTab === 'documentos' && <TabDocumentos clienteId={clienteId} />}
        {activeTab === 'honorarios' && <TabHonorarios clienteId={clienteId} onRefresh={() => fetchData(true)} />}
        {activeTab === 'timeline' && <TabTimeline clienteId={clienteId} cliente={data} />}
        {activeTab === 'comunicacoes' && <TabComunicacoes conversationId={data.conversation_id} />}
      </div>

      {/* Modal de exclusão */}
      {showDeleteModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Excluir cliente</h3>
            <p className="text-sm text-base-content/70">Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.</p>
            <div className="modal-action">
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-ghost">Cancelar</button>
              <button onClick={handleDelete} className="btn btn-error">Excluir</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)} />
        </div>
      )}

      {/* Modal de encerramento */}
      {showArchiveModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Encerrar cliente</h3>
            <p className="text-sm text-base-content/70 mb-3">Informe o motivo do encerramento:</p>
            <textarea
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              className="textarea textarea-bordered w-full"
              placeholder="Ex: cliente encerrou empresa, mudou de escritório..."
              rows={3}
            />
            <div className="modal-action">
              <button onClick={() => setShowArchiveModal(false)} className="btn btn-ghost">Cancelar</button>
              <button onClick={handleArchive} disabled={!archiveReason} className="btn btn-error">Confirmar</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowArchiveModal(false)} />
        </div>
      )}
    </div>
  );
}

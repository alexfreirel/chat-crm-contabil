'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const TIPOS_LABELS: Record<string, string> = {
  DAS_MENSAL: 'DAS Mensal', PGDAS: 'PGDAS-D', SPED_FISCAL: 'SPED Fiscal',
  EFD_CONTRIB: 'EFD-Contrib', ECF: 'ECF', ECD: 'ECD', DCTF: 'DCTF',
  DEFIS: 'DEFIS', DASN: 'DASN-SIMEI', DIRF: 'DIRF', RAIS: 'RAIS',
  eSocial: 'eSocial', FGTS: 'FGTS/GFIP', FOLHA: 'Folha', IRPF: 'IRPF',
  NOTA_FISCAL: 'NF', CERTIDAO: 'Certidão', OUTRO: 'Outro',
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function UrgencyBadge({ days, completed }: { days: number; completed?: boolean }) {
  if (completed) return <span className="badge badge-success badge-sm">✓ Entregue</span>;
  if (days < 0)  return <span className="badge badge-error   badge-sm">Vencida {Math.abs(days)}d</span>;
  if (days === 0) return <span className="badge badge-error   badge-sm">Hoje!</span>;
  if (days === 1) return <span className="badge badge-warning badge-sm">Amanhã</span>;
  if (days <= 7) return <span className="badge badge-warning badge-sm">{days}d</span>;
  return              <span className="badge badge-ghost   badge-sm">{days}d</span>;
}

// ─── Calendário mensal ──────────────────────────────────────────────────────

function CalendarioMes({
  ano, mes, obrigacoes, onComplete,
}: {
  ano: number; mes: number;
  obrigacoes: any[];
  onComplete: (id: string) => void;
}) {
  const router = useRouter();
  const firstDay = new Date(ano, mes - 1, 1).getDay(); // 0=dom
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const today = new Date();

  // Indexar obrigações por dia
  const byDay = useMemo(() => {
    const m: Record<number, any[]> = {};
    obrigacoes.forEach(o => {
      const d = new Date(o.due_at).getDate();
      if (!m[d]) m[d] = [];
      m[d].push(o);
    });
    return m;
  }, [obrigacoes]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
      {/* Header dos dias da semana */}
      <div className="grid grid-cols-7 bg-base-200/60 border-b border-base-300">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} className="text-center py-2 text-xs font-bold text-base-content/50">{d}</div>
        ))}
      </div>
      {/* Grid de dias */}
      <div className="grid grid-cols-7 divide-x divide-y divide-base-300/50">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[80px] bg-base-200/20" />;
          const obs = byDay[day] || [];
          const isToday = today.getDate() === day && today.getMonth() + 1 === mes && today.getFullYear() === ano;
          const hasPending = obs.some(o => !o.completed);
          const hasOverdue = obs.some(o => !o.completed && daysUntil(o.due_at) < 0);
          return (
            <div
              key={idx}
              className={`min-h-[80px] p-1.5 ${isToday ? 'bg-primary/5' : ''}`}
            >
              <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? 'bg-primary text-primary-content' : 'text-base-content/60'
              }`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {obs.slice(0, 3).map(o => (
                  <div
                    key={o.id}
                    className={`text-[9px] px-1 py-0.5 rounded cursor-pointer truncate font-medium transition-opacity hover:opacity-80 ${
                      o.completed
                        ? 'bg-success/20 text-success'
                        : daysUntil(o.due_at) < 0
                        ? 'bg-error/20 text-error'
                        : daysUntil(o.due_at) <= 3
                        ? 'bg-warning/20 text-warning-content'
                        : 'bg-primary/10 text-primary'
                    }`}
                    title={`${o.titulo} — ${o.cliente?.lead?.name || 'Cliente'}`}
                    onClick={() => router.push(`/atendimento/workspace/${o.cliente_id}`)}
                  >
                    {TIPOS_LABELS[o.tipo] || o.tipo}: {(o.cliente?.lead?.name || 'N/A').split(' ')[0]}
                  </div>
                ))}
                {obs.length > 3 && (
                  <div className="text-[9px] text-base-content/40 text-center">+{obs.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

type ViewMode = 'lista' | 'calendario';

export default function ObrigacoesPage() {
  const router = useRouter();
  const now = new Date();
  const [view, setView] = useState<ViewMode>('lista');
  const [obrigacoes, setObrigacoes] = useState<any[]>([]);
  const [calendario, setCalendario] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [calAno, setCalAno] = useState(now.getFullYear());
  const [calMes, setCalMes] = useState(now.getMonth() + 1);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  useEffect(() => {
    if (view === 'lista') fetchLista();
  }, [dias, view]);

  useEffect(() => {
    if (view === 'calendario') fetchCalendario();
  }, [calAno, calMes, view]);

  async function fetchLista() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/obrigacoes/vencendo?dias=${dias}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setObrigacoes(Array.isArray(data) ? data : []);
    } catch { setObrigacoes([]); }
    finally { setLoading(false); }
  }

  async function fetchCalendario() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/obrigacoes/calendario?ano=${calAno}&mes=${calMes}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setCalendario(Array.isArray(data) ? data : []);
    } catch { setCalendario([]); }
    finally { setLoading(false); }
  }

  async function handleComplete(id: string) {
    await fetch(`${API}/obrigacoes/${id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    view === 'lista' ? fetchLista() : fetchCalendario();
  }

  function navMes(dir: -1 | 1) {
    let m = calMes + dir;
    let a = calAno;
    if (m < 1)  { m = 12; a--; }
    if (m > 12) { m = 1;  a++; }
    setCalMes(m); setCalAno(a);
  }

  // Filtros para lista
  const listaFiltrada = useMemo(() => {
    return obrigacoes.filter(o => {
      if (filtroTipo && o.tipo !== filtroTipo) return false;
      if (filtroCliente) {
        const nome = o.cliente?.lead?.name?.toLowerCase() || '';
        if (!nome.includes(filtroCliente.toLowerCase())) return false;
      }
      return true;
    });
  }, [obrigacoes, filtroTipo, filtroCliente]);

  const vencidas = listaFiltrada.filter(o => daysUntil(o.due_at) < 0).length;
  const hoje     = listaFiltrada.filter(o => daysUntil(o.due_at) === 0).length;
  const proximas = listaFiltrada.filter(o => daysUntil(o.due_at) > 0).length;

  const calStats = useMemo(() => ({
    total:     calendario.length,
    pendentes: calendario.filter(o => !o.completed).length,
    entregues: calendario.filter(o =>  o.completed).length,
    vencidas:  calendario.filter(o => !o.completed && daysUntil(o.due_at) < 0).length,
  }), [calendario]);

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">Obrigações Fiscais</h1>
          <p className="text-sm text-base-content/60">
            {view === 'lista'
              ? `${listaFiltrada.length} pendente${listaFiltrada.length !== 1 ? 's' : ''} nos próximos ${dias} dias`
              : `${MESES[calMes - 1]} ${calAno} — ${calStats.total} obrigação(ões)`}
          </p>
        </div>

        {/* Seletor de visão */}
        <div className="join">
          <button
            onClick={() => setView('lista')}
            className={`btn btn-sm join-item ${view === 'lista' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
          >
            📋 Lista
          </button>
          <button
            onClick={() => setView('calendario')}
            className={`btn btn-sm join-item ${view === 'calendario' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
          >
            📅 Calendário
          </button>
        </div>

        {/* Controles por view */}
        {view === 'lista' && (
          <select value={dias} onChange={e => setDias(parseInt(e.target.value))} className="select select-bordered select-sm">
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        )}
        {view === 'calendario' && (
          <div className="flex items-center gap-2">
            <button onClick={() => navMes(-1)} className="btn btn-ghost btn-sm btn-square">‹</button>
            <span className="font-semibold text-sm min-w-[120px] text-center">
              {MESES[calMes - 1]} {calAno}
            </span>
            <button onClick={() => navMes(1)} className="btn btn-ghost btn-sm btn-square">›</button>
          </div>
        )}
      </div>

      {/* ── Semáforo ── */}
      {!loading && view === 'lista' && (
        <div className="grid grid-cols-3 border-b border-base-300 bg-base-200/30">
          <div className={`flex flex-col items-center py-3 border-r border-base-300 ${vencidas > 0 ? 'bg-error/5' : ''}`}>
            <span className={`text-2xl font-bold ${vencidas > 0 ? 'text-error' : 'text-base-content/30'}`}>{vencidas}</span>
            <span className="text-xs text-base-content/60">Vencidas</span>
          </div>
          <div className={`flex flex-col items-center py-3 border-r border-base-300 ${hoje > 0 ? 'bg-warning/5' : ''}`}>
            <span className={`text-2xl font-bold ${hoje > 0 ? 'text-warning' : 'text-base-content/30'}`}>{hoje}</span>
            <span className="text-xs text-base-content/60">Vencem hoje</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <span className="text-2xl font-bold text-primary">{proximas}</span>
            <span className="text-xs text-base-content/60">Próximas</span>
          </div>
        </div>
      )}
      {!loading && view === 'calendario' && (
        <div className="grid grid-cols-4 border-b border-base-300 bg-base-200/30 text-center">
          <div className="py-2 border-r border-base-300">
            <div className="text-lg font-bold">{calStats.total}</div>
            <div className="text-xs text-base-content/50">Total</div>
          </div>
          <div className={`py-2 border-r border-base-300 ${calStats.vencidas > 0 ? 'bg-error/5' : ''}`}>
            <div className={`text-lg font-bold ${calStats.vencidas > 0 ? 'text-error' : ''}`}>{calStats.vencidas}</div>
            <div className="text-xs text-base-content/50">Vencidas</div>
          </div>
          <div className="py-2 border-r border-base-300">
            <div className="text-lg font-bold text-warning">{calStats.pendentes}</div>
            <div className="text-xs text-base-content/50">Pendentes</div>
          </div>
          <div className="py-2">
            <div className="text-lg font-bold text-success">{calStats.entregues}</div>
            <div className="text-xs text-base-content/50">Entregues</div>
          </div>
        </div>
      )}

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : view === 'calendario' ? (
          /* ── Calendário ── */
          <div className="p-6">
            <CalendarioMes
              ano={calAno} mes={calMes}
              obrigacoes={calendario}
              onComplete={handleComplete}
            />
            {/* Legenda */}
            <div className="flex gap-4 mt-4 text-xs text-base-content/50 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-error/20" /> Vencida</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning/20" /> Próxima (≤3d)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10" /> Pendente</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/20" /> Entregue</span>
            </div>
          </div>
        ) : listaFiltrada.length === 0 ? (
          /* ── Lista vazia ── */
          <div className="text-center py-20 text-base-content/40">
            <p className="text-5xl mb-4">✅</p>
            <p className="font-semibold text-lg">Nenhuma obrigação pendente</p>
            <p className="text-sm mt-2">Todos os prazos estão em dia!</p>
          </div>
        ) : (
          /* ── Lista ── */
          <div className="p-6 space-y-3">
            {/* Filtros */}
            <div className="flex gap-3 flex-wrap mb-1">
              <input
                value={filtroCliente}
                onChange={e => setFiltroCliente(e.target.value)}
                placeholder="Filtrar por cliente..."
                className="input input-bordered input-sm flex-1 min-w-[180px] max-w-xs"
              />
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="select select-bordered select-sm">
                <option value="">Todos os tipos</option>
                {Object.entries(TIPOS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {(filtroTipo || filtroCliente) && (
                <button onClick={() => { setFiltroTipo(''); setFiltroCliente(''); }} className="btn btn-ghost btn-sm">
                  Limpar filtros
                </button>
              )}
            </div>

            {listaFiltrada.map(o => {
              const days = daysUntil(o.due_at);
              return (
                <div
                  key={o.id}
                  className={`rounded-lg p-4 flex items-start gap-4 border transition-colors ${
                    days < 0
                      ? 'bg-error/5 border-error/30 border-l-4 border-l-error'
                      : days <= 3
                      ? 'bg-warning/5 border-warning/20 border-l-4 border-l-warning'
                      : days <= 7
                      ? 'bg-info/5 border-info/20 border-l-4 border-l-info'
                      : 'bg-base-200 border-base-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.titulo}</span>
                      <UrgencyBadge days={days} />
                      <span className="badge badge-outline badge-xs">{TIPOS_LABELS[o.tipo] || o.tipo}</span>
                      {o.recorrente && <span className="badge badge-ghost badge-xs">🔁</span>}
                    </div>
                    <p className="text-xs text-base-content/60 mt-1">
                      📅 Vence {new Date(o.due_at).toLocaleDateString('pt-BR')}
                      {o.competencia && ` · Ref: ${new Date(o.competencia).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`}
                    </p>
                    <p className="text-xs mt-0.5">
                      🏢{' '}
                      <button
                        onClick={() => router.push(`/atendimento/workspace/${o.cliente_id}`)}
                        className="link link-primary font-medium"
                      >
                        {o.cliente?.lead?.name || 'Cliente'}
                      </button>
                      {o.responsavel && <span className="text-base-content/50"> · 👤 {o.responsavel.name}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleComplete(o.id)}
                    className="btn btn-success btn-sm btn-outline shrink-0"
                  >
                    ✓ Entregar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

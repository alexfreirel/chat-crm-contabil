'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LineChart as LineIcon, Loader2, Printer, ArrowLeft, Cloud } from 'lucide-react';
import { Cliente, novoCliente, analyze } from '@/lib/pgdas';
import { RelatorioPgdas } from '@/components/RelatorioPgdas';
import { carregarEmpresas, buscarAnalise, apagarAnalise, fmtCnpj, limparCnpj } from '@/lib/analiseClientes';

// Os dados vêm do PGDAS-D anexado na aba Impostos (um registro por CNPJ); esta tela só exibe a análise.

export default function AnaliseEmpresaPage() {
  const router = useRouter();
  const params = useParams<{ cnpj: string }>();
  const cnpj = limparCnpj(String(params?.cnpj || ''));
  const [S, setS] = useState<Cliente>(novoCliente);
  const [carregando, setCarregando] = useState(true);
  const [confirmar, setConfirmar] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  // ─── Carrega a empresa e a análise salva ────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/atendimento/login'); return; }
    let vivo = true;
    (async () => {
      try {
        const [salva, emp] = await Promise.all([
          buscarAnalise(cnpj),
          carregarEmpresas().catch(() => null),
        ]);
        if (!vivo) return;
        const empresa = emp?.empresas.find(e => e.cnpj === cnpj);
        const base = salva?.dados || novoCliente();
        if (!base.cnpj) base.cnpj = fmtCnpj(cnpj);
        if (!base.nome && empresa) base.nome = empresa.nome;
        setS(base);
        setSalvoEm(salva?.updated_at || null);
      } catch {
        if (vivo) setErroCarga('Não foi possível carregar a análise desta empresa.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [router, cnpj]);

  const a = useMemo(() => analyze(S), [S]);

  const limpar = async () => {
    setConfirmar(false);
    await apagarAnalise(cnpj).catch(() => {});
    const n = novoCliente();
    n.cnpj = fmtCnpj(cnpj);
    n.nome = S.nome;
    setS(n); setSalvoEm(null);
  };

  if (carregando) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );
  if (erroCarga) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 text-sm text-muted-foreground">
      <p>{erroCarga}</p>
      <button type="button" onClick={() => router.push('/atendimento/analise-clientes')} className="text-primary font-semibold hover:underline">Voltar para a lista</button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background print-full">
      <style>{`@media print {
        aside, nav, .no-print { display: none !important; }
        .print-full { overflow: visible !important; height: auto !important; }
      }`}</style>

      {/* Cabeçalho */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-4 no-print">
        <button type="button" onClick={() => router.push('/atendimento/analise-clientes')}
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={13} /> Análise de Clientes
        </button>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LineIcon size={22} className="text-primary shrink-0" />
              <h1 className="text-2xl font-bold truncate">{S.nome || fmtCnpj(cnpj)}</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono">{fmtCnpj(cnpj)}</span>
              <span className="inline-flex items-center gap-1">
                {salvoEm ? <><Cloud size={12} /> Atualizado em {new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>
                  : 'Nenhuma análise salva ainda'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} disabled={!a}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Printer size={16} /> Imprimir / PDF
            </button>
            <button type="button" onClick={() => setConfirmar(true)} disabled={!Object.keys(S.months).length}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              Limpar análise
            </button>
          </div>
        </div>
        {confirmar && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm">
            Apagar todos os dados da análise desta empresa?
            <button type="button" onClick={limpar} className="rounded-md bg-red-600 px-3 py-1 text-white font-medium">Apagar</button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-md border border-border px-3 py-1">Cancelar</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto print-full">
        <div className="grid gap-6 p-6">
          {/* ─── Relatório ─── */}
          <main className="flex flex-col gap-4 min-w-0">
            {!a ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <h3 className="text-lg font-semibold">Nenhum dado ainda</h3>
                <p className="text-sm text-muted-foreground mt-1">Anexe o PGDAS-D do cliente na aba Impostos para gerar a análise automaticamente.</p>
              </div>
            ) : <RelatorioPgdas S={S} />}
          </main>
        </div>
      </div>
    </div>
  );
}

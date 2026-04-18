'use client';

import { AlertTriangle } from 'lucide-react';

interface InadimplenciaItem {
  clienteId: string;
  nome: string;
  totalAtrasado: number;
  parcelas: number;
}

interface InadimplenciaWidgetProps {
  data: InadimplenciaItem[] | undefined;
  loading: boolean;
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function InadimplenciaWidget({ data, loading }: InadimplenciaWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} className="text-red-500" />
        <h3 className="text-sm font-semibold text-foreground">Ranking de Inadimplência</h3>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex justify-between items-center py-2">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-6 w-20 bg-muted rounded-full" />
            </div>
          ))}
        </div>
      )}

      {!loading && (!data || data.length === 0) && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Nenhuma inadimplência encontrada
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((item, index) => (
            <div
              key={item.clienteId}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.parcelas} {item.parcelas === 1 ? 'parcela' : 'parcelas'}
                  </p>
                </div>
              </div>
              <span className="ml-3 shrink-0 inline-flex items-center px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-semibold">
                {fmtBRL(item.totalAtrasado)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

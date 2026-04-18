'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ProdutividadeData {
  concluidas: number;
  pendentes: number;
  total: number;
  pct: number;
}

interface ProdutividadeWidgetProps {
  data: ProdutividadeData | undefined;
  loading: boolean;
}

export function ProdutividadeWidget({ data, loading }: ProdutividadeWidgetProps) {
  const chartData = [
    { name: 'Concluídas', value: data?.concluidas ?? 0, color: '#10b981' },
    { name: 'Pendentes', value: data?.pendentes ?? 0, color: '#f59e0b' },
  ];

  const pct = data?.pct ?? 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Produtividade — Obrigações do Mês
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        {data?.total ?? 0} obrigações no mês
      </p>

      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-pulse w-full h-20 bg-muted rounded-lg" />
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} barCategoryGap="40%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso</span>
              <span className="font-semibold text-foreground">{pct}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

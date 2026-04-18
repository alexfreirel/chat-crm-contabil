'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Building2 } from 'lucide-react';

interface RegimeTributarioChartProps {
  data: Array<{ regime: string; count: number }> | undefined;
  loading: boolean;
}

const COLORS: Record<string, string> = {
  SIMPLES_NACIONAL: '#10b981',
  LUCRO_PRESUMIDO: '#3b82f6',
  LUCRO_REAL: '#8b5cf6',
  MEI: '#f59e0b',
  ISENTO: '#6b7280',
};

const LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
  ISENTO: 'Isento',
};

export function RegimeTributarioChart({ data, loading }: RegimeTributarioChartProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Clientes por Regime Tributário</h3>
      </div>

      {loading && (
        <div className="h-48 flex items-center justify-center">
          <div className="animate-pulse w-32 h-32 rounded-full bg-muted" />
        </div>
      )}

      {!loading && (!data || data.length === 0) && (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          Nenhum dado disponível
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="count"
              nameKey="regime"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.regime}
                  fill={COLORS[entry.regime] || '#6b7280'}
                />
              ))}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [value, LABELS[String(name)] || name]}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => LABELS[String(value)] || value}
              wrapperStyle={{ fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

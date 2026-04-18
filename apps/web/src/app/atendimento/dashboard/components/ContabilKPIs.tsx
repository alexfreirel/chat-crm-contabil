'use client';

import { ReactNode } from 'react';
import { Users, AlertTriangle, Clock, UserPlus } from 'lucide-react';

interface ContabilKPIsProps {
  data: any;
  loading: boolean;
}

function KpiCard({
  icon,
  value,
  label,
  color,
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-muted mb-2" />
      <div className="h-7 w-12 bg-muted rounded mb-1" />
      <div className="h-3 w-20 bg-muted rounded" />
    </div>
  );
}

export function ContabilKPIs({ data, loading }: ContabilKPIsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        icon={<Users size={16} className="text-emerald-600" />}
        value={data?.clientesAtivos ?? 0}
        label="Clientes Ativos"
        color="bg-emerald-100 dark:bg-emerald-900/30"
      />
      <KpiCard
        icon={<AlertTriangle size={16} className="text-red-600" />}
        value={data?.obrigacoesAtrasadas ?? 0}
        label="Obrigações Atrasadas"
        color="bg-red-100 dark:bg-red-900/30"
      />
      <KpiCard
        icon={<Clock size={16} className="text-amber-600" />}
        value={data?.obrigacoesEssaSemana ?? 0}
        label="Obrigações Esta Semana"
        color="bg-amber-100 dark:bg-amber-900/30"
      />
      <KpiCard
        icon={<UserPlus size={16} className="text-blue-600" />}
        value={data?.novosClientesPeriodo ?? 0}
        label="Novos Clientes"
        color="bg-blue-100 dark:bg-blue-900/30"
      />
    </div>
  );
}

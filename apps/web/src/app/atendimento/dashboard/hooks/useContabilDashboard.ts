'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export function useContabilDashboard(period: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/dashboard/contabil?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  return { data, loading };
}

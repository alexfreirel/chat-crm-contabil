'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TasksPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/atendimento/agenda');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Redirecionando para Agenda...
    </div>
  );
}

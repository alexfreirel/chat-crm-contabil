'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';

export default function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const isLoginPage = pathname === '/atendimento/login';
    if (!token && !isLoginPage) {
      router.replace('/atendimento/login');
    }
    if (token && isLoginPage) {
      router.replace('/atendimento');
    }
  }, [pathname, router]);

  // Escuta o evento auth:logout disparado pelo interceptor axios (api.ts)
  // Usa router.replace (sem full page reload) para evitar cascata de logouts entre abas
  useEffect(() => {
    const handleAuthLogout = () => {
      const isLoginPage = pathname === '/atendimento/login';
      if (!isLoginPage) router.replace('/atendimento/login');
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [pathname, router]);

  const isLoginPage = pathname === '/atendimento/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

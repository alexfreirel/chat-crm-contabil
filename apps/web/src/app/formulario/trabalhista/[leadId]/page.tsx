'use client';

import { useParams, useRouter } from 'next/navigation';
import FichaTrabalhista from '@/components/FichaTrabalhista';

export default function FormularioTrabalhistaPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.leadId as string;

  if (!leadId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Link inválido.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <span className="text-amber-500 text-lg font-bold">AL</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              André Lustosa Advogados
            </h1>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
              Ficha Trabalhista
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground mb-2">
            Formulário de Informações Trabalhistas
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Preencha as informações abaixo sobre o seu caso trabalhista. Seus dados
            são salvos automaticamente conforme você preenche. Ao finalizar, nosso
            advogado irá analisar as informações e entrará em contato.
          </p>
        </div>

        <FichaTrabalhista
          leadId={leadId}
          isPublic={true}
          onFinalize={() => router.push('/formulario/trabalhista/sucesso')}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-[11px] text-muted-foreground">
            Suas informações são protegidas e serão utilizadas exclusivamente para
            análise do seu caso.
          </p>
        </div>
      </footer>
    </div>
  );
}

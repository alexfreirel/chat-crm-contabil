'use client';

import { ExternalLink, FileText, Loader2, Maximize2, Edit3, Eye } from 'lucide-react';
import { useState } from 'react';

interface GoogleDocsEmbedProps {
  docUrl: string;
  editable?: boolean;
  className?: string;
  fullHeight?: boolean;
  petitionId?: string;
}

/**
 * Embed de Google Docs dentro do sistema.
 *
 * O iframe usa /preview (visualização) porque navegadores modernos bloqueiam
 * cookies de terceiros necessários para /edit embedded.
 *
 * Para EDITAR, o usuário clica em "Editar no Docs" que abre em nova aba —
 * experiência completa do Google Docs (formatação, comentários, etc).
 */
export default function GoogleDocsEmbed({
  docUrl,
  editable = true,
  className = '',
  fullHeight = true,
  petitionId,
}: GoogleDocsEmbedProps) {
  const [loaded, setLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  if (!docUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-base-200/50 border border-base-300 rounded-xl text-base-content/50 gap-2">
        <FileText className="w-8 h-8 opacity-40" />
        <p className="text-sm">Google Doc não disponível</p>
      </div>
    );
  }

  // Extrair base URL do doc (sem /edit, /preview, query strings)
  const baseUrl = docUrl.replace(/\/(edit|preview|pub).*$/, '');

  // Sempre usar /preview no iframe (funciona sem cookies de terceiros)
  const previewUrl = baseUrl + '/preview';
  // URL de edição para abrir em nova aba
  const editUrl = baseUrl + '/edit';

  const iframeStyle = fullHeight
    ? { height: 'calc(100vh - 200px)', minHeight: '600px' }
    : { height: 'calc(100vh - 300px)', minHeight: '500px' };

  return (
    <div className={`relative w-full flex flex-col ${className}`}>
      {/* Loading spinner overlay */}
      {!loaded && !iframeError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-100 rounded-xl z-10 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-base-content/50">Carregando Google Docs...</p>
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 border border-base-300 border-b-0 rounded-t-lg">
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium">Google Docs</span>
          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-[10px] font-semibold">
            Preview
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Botão principal — Editar no Google Docs (nova aba) */}
          {editable && (
            <a
              href={editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
              title="Editar no Google Docs (abre em nova aba)"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar no Docs
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {/* Abrir em nova aba (visualizar) */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-base-content"
            title="Abrir visualização em nova aba"
          >
            <Eye className="w-3 h-3" />
            Abrir
          </a>
        </div>
      </div>

      {/* iframe — preview (não requer cookies de terceiros) */}
      <iframe
        src={previewUrl}
        onLoad={() => setLoaded(true)}
        onError={() => setIframeError(true)}
        className="w-full border border-base-300 rounded-b-lg bg-white flex-1"
        style={iframeStyle}
        allow="clipboard-read; clipboard-write"
      />

      {/* Mensagem de ajuda */}
      {loaded && (
        <p className="text-[10px] text-base-content/40 text-center mt-1">
          Para editar, clique em <strong>"Editar no Docs"</strong> acima — abre o editor completo do Google Docs em nova aba
        </p>
      )}
    </div>
  );
}

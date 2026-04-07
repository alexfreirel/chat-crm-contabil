'use client';

import { ExternalLink, FileText, Loader2, Maximize2, Download } from 'lucide-react';
import { useState } from 'react';

interface GoogleDocsEmbedProps {
  docUrl: string;
  editable?: boolean;
  className?: string;
  /** Se true, o iframe ocupa quase 100% da viewport (modo fullscreen) */
  fullHeight?: boolean;
  /** ID da petição — usado para exportar PDF */
  petitionId?: string;
}

/**
 * Embed de Google Docs dentro do sistema.
 * Usa iframe com URL /edit?embedded=true (editável) ou /preview (somente leitura).
 *
 * Quando Google Drive está configurado e a petição tem google_doc_url,
 * este é o editor PRIMÁRIO — oferece experiência idêntica ao Google Docs.
 */
export default function GoogleDocsEmbed({
  docUrl,
  editable = true,
  className = '',
  fullHeight = true,
  petitionId,
}: GoogleDocsEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  if (!docUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-base-200/50 border border-base-300 rounded-xl text-base-content/50 gap-2">
        <FileText className="w-8 h-8 opacity-40" />
        <p className="text-sm">Google Doc não disponível</p>
      </div>
    );
  }

  // Converter URL para embed
  // Formato: https://docs.google.com/document/d/{docId}/edit?embedded=true
  let embedUrl: string;
  if (editable) {
    // Remove qualquer query string ou fragmento e adiciona /edit?embedded=true
    embedUrl = docUrl.replace(/\/(edit|preview).*$/, '') + '/edit?embedded=true';
  } else {
    embedUrl = docUrl.replace(/\/(edit|preview).*$/, '') + '/preview';
  }

  // Altura do iframe — no modo fullHeight, usa quase toda a viewport
  const iframeStyle = fullHeight
    ? { height: 'calc(100vh - 200px)', minHeight: '600px' }
    : { height: 'calc(100vh - 300px)', minHeight: '500px' };

  return (
    <div className={`relative w-full flex flex-col ${className}`}>
      {/* Loading spinner overlay */}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-100 rounded-xl z-10 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-base-content/50">Carregando Google Docs...</p>
        </div>
      )}

      {/* Barra de ações compacta */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-200/80 border border-base-300 border-b-0 rounded-t-lg">
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium">Google Docs</span>
          {editable ? (
            <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-semibold">
              Editável
            </span>
          ) : (
            <span className="px-1.5 py-0.5 bg-gray-500/15 text-gray-500 dark:text-gray-400 rounded text-[10px] font-semibold">
              Somente leitura
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Abrir em nova aba (Google Docs completo) */}
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-xs gap-1 text-primary hover:text-primary/80"
            title="Abrir no Google Docs (tela cheia)"
          >
            <Maximize2 className="w-3 h-3" />
            Abrir no Docs
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* iframe — ocupa toda a área disponível */}
      <iframe
        src={embedUrl}
        onLoad={() => setLoaded(true)}
        className="w-full border border-base-300 rounded-b-lg bg-white flex-1"
        style={iframeStyle}
        allow="clipboard-read; clipboard-write"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
      />
    </div>
  );
}

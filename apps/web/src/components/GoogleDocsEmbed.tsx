'use client';

import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface GoogleDocsEmbedProps {
  docUrl: string;
  editable?: boolean;
  className?: string;
}

/**
 * Embed de Google Docs dentro do sistema.
 * Usa iframe com URL /edit?embedded=true (editável) ou /preview (somente leitura).
 */
export default function GoogleDocsEmbed({ docUrl, editable = true, className = '' }: GoogleDocsEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  if (!docUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-background border border-border rounded-xl text-muted-foreground gap-2">
        <FileText className="w-8 h-8 opacity-40" />
        <p className="text-sm">Google Doc não disponível</p>
      </div>
    );
  }

  // Converter URL para embed
  const embedUrl = editable
    ? docUrl.replace(/\/edit.*$/, '/edit?embedded=true')
    : docUrl.replace(/\/edit.*$/, '/preview');

  return (
    <div className={`relative w-full ${className}`}>
      {/* Loading spinner */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background rounded-xl z-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex items-center justify-between px-3 py-2 bg-card border border-border border-b-0 rounded-t-xl">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium">Google Docs</span>
          {editable && <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-medium">Editável</span>}
        </div>
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Abrir no Google Docs
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* iframe */}
      <iframe
        src={embedUrl}
        onLoad={() => setLoaded(true)}
        className="w-full border border-border rounded-b-xl bg-white"
        style={{ height: 'calc(100vh - 300px)', minHeight: '500px' }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

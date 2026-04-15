'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

export default function TabComunicacoes({ conversationId }: { conversationId?: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (conversationId) fetch_(); }, [conversationId]);

  async function fetch_() {
    setLoading(true);
    const res = await fetch(`${API}/messages?conversationId=${conversationId}&limit=50`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : (data.data || []));
    setLoading(false);
  }

  if (!conversationId) return (
    <div className="flex items-center justify-center h-48 text-base-content/40">
      <p className="text-sm">💬 Nenhuma conversa vinculada a este cliente</p>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Histórico de Mensagens</h3>
        <a href={`/atendimento/chat/${conversationId}`} className="btn btn-sm btn-outline">Abrir chat</a>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>
      ) : messages.length === 0 ? (
        <p className="text-center text-sm text-base-content/40 py-8">💬 Nenhuma mensagem registrada</p>
      ) : (
        <div className="space-y-2">
          {[...messages].reverse().map(m => (
            <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === 'out' ? 'bg-primary text-primary-content' : 'bg-base-200'}`}>
                <p>{m.text || <span className="italic opacity-60">[{m.type}]</span>}</p>
                <p className={`text-xs mt-0.5 ${m.direction === 'out' ? 'text-primary-content/60' : 'text-base-content/40'}`}>
                  {new Date(m.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

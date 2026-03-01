'use client';

import { useRef, useState, useCallback } from 'react';
import { Mic, Square, X } from 'lucide-react';
import api from '@/lib/api';

interface AudioRecorderProps {
  conversationId: string;
  onSent: (msg: any) => void;
  disabled?: boolean;
}

export function AudioRecorder({ conversationId, onSent, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      setRecording(true);
    } catch {
      alert('Permissão de microfone negada ou não disponível.');
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setSending(true);
      try {
        const ext = mimeType.includes('ogg')
          ? 'ogg'
          : mimeType.includes('mp4')
            ? 'mp4'
            : 'webm';
        const formData = new FormData();
        formData.append('conversationId', conversationId);
        formData.append('audio', blob, `gravacao.${ext}`);
        const res = await api.post('/messages/send-audio', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        onSent(res.data);
      } catch (e) {
        console.error('[AUDIO] Falha ao enviar áudio:', e);
      } finally {
        setSending(false);
      }
    };

    recorder.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }, [conversationId, onSent]);

  const cancel = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    chunksRef.current = [];
  }, []);

  if (sending) {
    return (
      <div className="flex items-center px-3 py-2 text-xs text-muted-foreground animate-pulse">
        Enviando áudio...
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium animate-pulse">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          Gravando...
        </span>
        <button
          onClick={cancel}
          className="p-2 rounded-xl text-muted-foreground hover:bg-accent transition-colors"
          title="Cancelar gravação"
        >
          <X size={18} />
        </button>
        <button
          onClick={stopAndSend}
          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          title="Parar e enviar"
        >
          <Square size={18} fill="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="p-4 rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
      title="Gravar áudio"
    >
      <Mic size={20} />
    </button>
  );
}

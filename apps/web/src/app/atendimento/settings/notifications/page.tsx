'use client';

import { useState, useEffect } from 'react';
import { Bell, Volume2, Play, Monitor } from 'lucide-react';
import {
  NOTIFICATION_SOUNDS,
  getNotificationSoundId,
  setNotificationSoundId,
  playNotificationSound,
  type SoundId,
} from '@/lib/notificationSounds';
import {
  isDesktopNotifSupported,
  getDesktopNotifPermission,
  isDesktopNotifEnabled,
  setDesktopNotifEnabled,
  requestNotificationPermission,
} from '@/lib/desktopNotifications';

export default function NotificationsSettingsPage() {
  const [selected, setSelected] = useState<SoundId>('ding');
  const [saved, setSaved] = useState(false);
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>('default');

  useEffect(() => {
    setSelected(getNotificationSoundId());
    setDesktopEnabled(isDesktopNotifEnabled());
    if (isDesktopNotifSupported()) {
      setPermissionState(getDesktopNotifPermission());
    }
  }, []);

  const handleSelect = (id: SoundId) => {
    setSelected(id);
    setNotificationSoundId(id);
    playNotificationSound(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleToggleDesktopNotif = async () => {
    if (!isDesktopNotifSupported()) return;

    if (permissionState === 'default') {
      const result = await requestNotificationPermission();
      setPermissionState(result);
      if (result === 'granted') {
        setDesktopEnabled(true);
        setDesktopNotifEnabled(true);
      }
      return;
    }

    if (permissionState === 'granted') {
      const next = !desktopEnabled;
      setDesktopEnabled(next);
      setDesktopNotifEnabled(next);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bell className="text-primary" size={22} />
          <h1 className="text-2xl font-bold">Notificacoes</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure alertas sonoros e notificacoes do navegador.
        </p>
      </div>

      {/* Desktop notifications toggle */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Monitor size={15} className="text-muted-foreground" />
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Notificacoes do Navegador
          </h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold">Notificacoes Desktop</p>
            <p className="text-[12px] text-muted-foreground">
              Receba alertas mesmo quando o navegador nao estiver em foco
            </p>
          </div>
          <button
            onClick={handleToggleDesktopNotif}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              desktopEnabled && permissionState === 'granted'
                ? 'bg-primary'
                : 'bg-muted-foreground/30'
            }`}
            disabled={permissionState === 'denied'}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                desktopEnabled && permissionState === 'granted' ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {permissionState === 'denied' && (
          <p className="text-[12px] text-amber-500 mt-2">
            Permissao bloqueada pelo navegador. Habilite nas configuracoes do navegador para este site.
          </p>
        )}

        {permissionState === 'default' && (
          <p className="text-[12px] text-muted-foreground mt-2">
            Clique no toggle para solicitar permissao ao navegador.
          </p>
        )}
      </div>

      {/* Sound selector */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Volume2 size={15} className="text-muted-foreground" />
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Som de Notificacao
          </h2>
          {saved && (
            <span className="ml-auto text-xs text-primary font-semibold animate-fade-in">
              Salvo
            </span>
          )}
        </div>

        <div className="grid gap-2.5">
          {NOTIFICATION_SOUNDS.map((sound) => {
            const isActive = selected === sound.id;
            return (
              <div
                key={sound.id}
                onClick={() => handleSelect(sound.id)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-xl border cursor-pointer transition-all ${
                  isActive
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-muted/20 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Radio indicator */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'border-primary' : 'border-muted-foreground/40'
                    }`}
                  >
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <p className={`font-semibold text-[14px] ${isActive ? 'text-primary' : 'text-foreground'}`}>
                      {sound.label}
                    </p>
                    <p className={`text-[12px] ${isActive ? 'text-primary/70' : 'text-muted-foreground'}`}>
                      {sound.description}
                    </p>
                  </div>
                </div>

                {/* Preview button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playNotificationSound(sound.id);
                  }}
                  title="Ouvir previa"
                  className={`p-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/20 hover:bg-primary/30 text-primary'
                      : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Play size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="text-sm font-semibold mb-3">Como funciona</h3>
        <ul className="space-y-2.5 text-[13px] text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            <span>
              O som e tocado quando voce recebe uma nova mensagem em uma conversa atribuida a voce.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            <span>
              Notificacoes desktop aparecem mesmo quando o navegador nao esta em foco.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            <span>
              Use <kbd className="px-1 py-0.5 bg-muted rounded text-[11px] font-mono mx-0.5">Ctrl+K</kbd> para abrir a paleta de comandos e navegar rapidamente.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            <span>
              A preferencia e salva por dispositivo — ao clicar em um som ele ja fica ativo automaticamente.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

function getUtmParams() {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get('utm_source') || undefined,
    utm_medium: p.get('utm_medium') || undefined,
    utm_campaign: p.get('utm_campaign') || undefined,
    utm_term: p.get('utm_term') || undefined,
    utm_content: p.get('utm_content') || undefined,
    gclid: p.get('gclid') || undefined,
  };
}

function getOrCreateVisitorId(): string {
  const key = 'lp_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

async function sendEvent(
  pageId: string,
  event_type: 'view' | 'whatsapp_click',
) {
  try {
    const visitor_id = getOrCreateVisitorId();
    const utms = getUtmParams();
    const referrer = document.referrer || undefined;

    await fetch(`${API_URL}/landing-pages/${pageId}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, visitor_id, referrer, ...utms }),
    });

    // GTM dataLayer push
    if (window.dataLayer) {
      window.dataLayer.push({
        event: event_type === 'view' ? 'lp_page_view' : 'lp_whatsapp_click',
        pageId,
        ...utms,
      });
    }
  } catch (err) {
    console.error('[LPTracker] falha ao registrar evento', err);
  }
}

export function LPTracker({ pageId }: { pageId: string }) {
  useEffect(() => {
    const key = `lp_viewed_${pageId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    sendEvent(pageId, 'view');
  }, [pageId]);

  return null;
}

export function trackWhatsappClick(pageId: string) {
  sendEvent(pageId, 'whatsapp_click');
}

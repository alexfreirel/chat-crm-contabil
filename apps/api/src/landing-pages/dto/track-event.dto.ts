export class TrackEventDto {
  event_type: 'view' | 'whatsapp_click';
  visitor_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  referrer?: string;
}

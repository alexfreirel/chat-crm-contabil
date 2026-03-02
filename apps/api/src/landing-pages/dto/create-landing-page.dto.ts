export class CreateLandingPageDto {
  title: string;
  slug: string;
  is_published?: boolean;
  content: Record<string, unknown>;
  whatsapp_number?: string;
  gtm_id?: string;
}

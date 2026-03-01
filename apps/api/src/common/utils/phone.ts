/**
 * Centraliza a normalização de telefones para evitar duplicidades no banco de dados.
 */
export function normalizeBrazilianPhone(phone: string): string {
  // Limpar carácteres não numéricos
  const cleaned = phone.replace(/\D/g, '');

  // Se não é Brasil (55), não mexe
  if (!cleaned.startsWith('55')) return cleaned;

  // Mobile com 9 digitos (atual): 55 + DD + 9 + 8 digitos = 13 digitos
  // O usuário quer SEM o nono dígito (12 dígitos totais)
  if (cleaned.length === 13) {
    const ddd = cleaned.substring(2, 4);
    const nine = cleaned.substring(4, 5);
    const rest = cleaned.substring(5);

    if (nine === '9') {
      return `55${ddd}${rest}`;
    }
  }

  return cleaned;
}

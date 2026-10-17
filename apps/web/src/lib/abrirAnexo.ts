import { API_BASE_URL } from '@/lib/api';

/**
 * Abre em nova aba um anexo (certidão, contrato ou imposto) servido pela API.
 * O link do Drive só funciona para contas com permissão; por aqui basta estar logado no sistema.
 */
export async function abrirAnexo(fileId: string): Promise<boolean> {
  // Abre a aba já no clique, para o navegador não bloquear o pop-up
  const aba = window.open('', '_blank');
  try {
    const res = await fetch(`${API_BASE_URL}/google-drive/anexo/${fileId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    if (aba) aba.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return true;
  } catch {
    aba?.close();
    return false;
  }
}

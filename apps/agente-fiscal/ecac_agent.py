"""
ecac_agent.py
─────────────
Baixa relatórios do e-CAC (Receita Federal) usando certificado digital A3/A1.

Fluxo:
  1. Abre Edge via Selenium
  2. Navega para e-CAC login
  3. Usuário clica "Entrar com gov.br", resolve captcha e seleciona o certificado
     (diálogo nativo do Windows — funciona com A1 e A3)
  4. Agente detecta autenticação e extrai cookies
  5. Baixa Consulta Pendências — Situação Fiscal para cada empresa

Dependências:
  pip install selenium webdriver-manager

Uso:
  py ecac_agent.py [--cnpj <CNPJ>]
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

import requests

import config
from config import Empresa

log = logging.getLogger("ecac_agent")

BASE_ECAC = "https://cav.receita.fazenda.gov.br"
BASE_DIR  = Path(__file__).parent

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── Configurar log ─────────────────────────────────────────────────────────────
def _configurar_log():
    root = logging.getLogger()
    root.handlers.clear()
    sh = logging.StreamHandler(sys.stdout)
    if hasattr(sh.stream, "reconfigure"):
        sh.stream.reconfigure(encoding="utf-8", errors="replace")
    fh = logging.FileHandler(config.DOWNLOAD_DIR / "ecac_agente.log", encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s")
    sh.setFormatter(fmt)
    fh.setFormatter(fmt)
    root.setLevel(logging.INFO)
    root.addHandler(sh)
    root.addHandler(fh)


# ── Listar certificados (ainda útil para exibir no menu) ──────────────────────

def listar_certificados() -> list[dict]:
    """
    Lista certificados com chave privada do repositório Pessoal do Windows.
    Retorna lista de dicts: Subject, Thumbprint, NotAfter, FriendlyName.
    """
    ps_script = "\n".join([
        r"$certs = Get-ChildItem Cert:\CurrentUser\My |",
        "    Where-Object { $_.HasPrivateKey -eq $true } |",
        "    ForEach-Object {",
        "        [PSCustomObject]@{",
        "            Subject      = $_.Subject",
        "            Thumbprint   = $_.Thumbprint",
        "            NotAfter     = $_.NotAfter.ToString('yyyy-MM-dd')",
        "            FriendlyName = $_.FriendlyName",
        "        }",
        "    }",
        'if ($certs) { $certs | ConvertTo-Json -Compress } else { "[]" }',
    ])
    ps_path = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False,
                                         encoding="utf-8") as f:
            f.write(ps_script)
            ps_path = f.name
        r = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path],
            capture_output=True, text=True, timeout=15,
        )
        saida = r.stdout.strip()
        if not saida or saida == "[]":
            return []
        data = json.loads(saida)
        if isinstance(data, dict):
            data = [data]
        return data
    except Exception as e:
        log.error(f"Erro ao listar certificados: {e}")
        return []
    finally:
        try:
            if ps_path and Path(ps_path).exists():
                Path(ps_path).unlink()
        except Exception:
            pass


# ── Autenticação via Selenium (Edge) ──────────────────────────────────────────

def _encontrar_edge() -> "str | None":
    """Localiza o executável do Microsoft Edge."""
    import shutil
    candidatos = [
        shutil.which("msedge"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for p in candidatos:
        if p and Path(p).exists():
            return p
    return None


def _extrair_cookies_cdp(porta: int) -> "requests.Session | None":
    """
    Conecta ao Edge via CDP websocket e extrai todos os cookies do e-CAC.
    Não usa Selenium — nenhuma flag de automação detectável.
    """
    import websocket  # websocket-client

    try:
        r = requests.get(f"http://127.0.0.1:{porta}/json", timeout=5)
        tabs = r.json()
    except Exception as e:
        log.error(f"  CDP: nao foi possivel conectar na porta {porta}: {e}")
        return None

    # Pega a primeira aba do tipo "page"
    ws_url = None
    for tab in tabs:
        if tab.get("type") == "page":
            ws_url = tab.get("webSocketDebuggerUrl")
            break

    if not ws_url:
        log.error("  CDP: nenhuma aba encontrada")
        return None

    try:
        conn = websocket.create_connection(ws_url, timeout=10)
        conn.send(json.dumps({"id": 1, "method": "Network.getAllCookies"}))
        resp = json.loads(conn.recv())
        conn.close()
    except Exception as e:
        log.error(f"  CDP: erro ao obter cookies: {e}")
        return None

    cookies_raw = resp.get("result", {}).get("cookies", [])
    if not cookies_raw:
        log.warning("  CDP: nenhum cookie retornado")

    sess = requests.Session()
    sess.headers.update({
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": BASE_ECAC + "/",
    })

    n = 0
    for c in cookies_raw:
        domain = c.get("domain", "")
        if "receita.fazenda" in domain or "cav.receita" in domain or "acesso.gov" in domain:
            sess.cookies.set(c["name"], c["value"], domain=domain.lstrip("."))
            n += 1

    if n == 0:
        # Adiciona todos os cookies se nenhum do domínio específico for encontrado
        for c in cookies_raw:
            sess.cookies.set(c["name"], c["value"], domain=c.get("domain", "").lstrip("."))
        n = len(cookies_raw)
        log.warning("  CDP: cookies de receita.fazenda nao encontrados — usando todos os cookies")

    log.info(f"  [e-CAC] {n} cookie(s) extraidos via CDP")
    return sess if n > 0 else None


def autenticar_ecac() -> "requests.Session | None":
    """
    Abre o Edge com --remote-debugging-port (sem --enable-automation).
    Assim navigator.webdriver fica undefined e o portal nao detecta automacao.
    O usuario faz login manualmente; apos pressionar ENTER, cookies sao
    extraidos via CDP websocket (sem precisar ler o banco de cookies do disco).
    Suporta A1 e A3 — dialogo de certificado e nativo do Windows.
    """
    edge_exe = _encontrar_edge()
    if not edge_exe:
        print("\n  ERRO: Microsoft Edge nao encontrado.")
        return None

    porta = 9226

    # Perfil temporário isolado para não interferir com o Edge do usuário
    import tempfile
    perfil_tmp = Path(tempfile.mkdtemp(prefix="ecac_edge_"))

    proc = subprocess.Popen([
        edge_exe,
        f"--remote-debugging-port={porta}",
        f"--user-data-dir={perfil_tmp}",
        "--start-maximized",
        "--no-first-run",
        "--no-default-browser-check",
        f"{BASE_ECAC}/autenticacao/login",
    ])

    print("\n" + "=" * 60)
    print("  AUTENTICACAO MANUAL NO e-CAC")
    print("=" * 60)
    print("  O Edge foi aberto na pagina de login do e-CAC.")
    print()
    print("  Passos:")
    print("  1. Clique em 'Entrar com gov.br'")
    print("  2. Resolva o captcha")
    print("  3. Selecione 'Certificado Digital'")
    print("  4. Escolha seu certificado no dialogo do Windows")
    print()
    input("  Pressione ENTER aqui apos completar o login no e-CAC...")
    print("=" * 60)

    sess = _extrair_cookies_cdp(porta)

    # Encerra o Edge temporário
    try:
        proc.terminate()
    except Exception:
        pass

    # Remove perfil temporário
    try:
        import shutil
        shutil.rmtree(perfil_tmp, ignore_errors=True)
    except Exception:
        pass

    return sess


def _copiar_arquivo_windows(src: Path, dst: Path) -> bool:
    """
    Copia arquivo bloqueado por outro processo usando Windows API (CreateFileW)
    com FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE.
    Necessário para ler o Cookies.db do Edge enquanto ele está aberto.
    Declara restype/argtypes para evitar truncamento de HANDLE em 64-bit.
    """
    import ctypes
    import ctypes.wintypes

    k32 = ctypes.windll.kernel32

    # Declarar tipos corretamente (sem isso, HANDLE é truncado para 32-bit)
    k32.CreateFileW.restype  = ctypes.wintypes.HANDLE
    k32.CreateFileW.argtypes = [
        ctypes.wintypes.LPCWSTR,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.DWORD,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.HANDLE,
    ]
    k32.ReadFile.restype  = ctypes.wintypes.BOOL
    k32.ReadFile.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(ctypes.wintypes.DWORD),
        ctypes.c_void_p,
    ]
    k32.CloseHandle.restype  = ctypes.wintypes.BOOL
    k32.CloseHandle.argtypes = [ctypes.wintypes.HANDLE]

    GENERIC_READ          = 0x80000000
    FILE_SHARE_READ       = 0x00000001
    FILE_SHARE_WRITE      = 0x00000002
    FILE_SHARE_DELETE     = 0x00000004
    OPEN_EXISTING         = 3
    FILE_ATTRIBUTE_NORMAL = 0x00000080
    INVALID_HANDLE_VALUE  = ctypes.wintypes.HANDLE(-1).value

    handle = k32.CreateFileW(
        str(src),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        None,
    )
    if handle == INVALID_HANDLE_VALUE:
        log.error(f"  CreateFileW falhou: erro {ctypes.GetLastError()}")
        return False

    try:
        tamanho = src.stat().st_size
        if tamanho <= 0:
            return False
        buf   = ctypes.create_string_buffer(tamanho)
        lidos = ctypes.wintypes.DWORD(0)
        ok    = k32.ReadFile(handle, buf, tamanho, ctypes.byref(lidos), None)
        if ok:
            dst.write_bytes(buf.raw[: lidos.value])
            return True
        log.error(f"  ReadFile falhou: erro {ctypes.GetLastError()}")
        return False
    finally:
        k32.CloseHandle(handle)


def _ler_cookies_edge() -> "requests.Session | None":
    """
    Lê e descriptografa cookies do e-CAC do perfil padrão do Edge.
    Usa pywin32 (DPAPI) + pycryptodomex (AES-GCM) — sem necessidade de admin.
    """
    import os, json, base64, sqlite3, shutil

    appdata = os.environ.get("LOCALAPPDATA", "")
    edge_dir = Path(appdata) / "Microsoft/Edge/User Data"

    if not edge_dir.exists():
        log.error("  Perfil do Edge nao encontrado")
        return None

    # ── Chave de criptografia AES do Local State ──────────────────────────────
    local_state_path = edge_dir / "Local State"
    try:
        ls = json.loads(local_state_path.read_text(encoding="utf-8"))
        enc_key_b64 = ls["os_crypt"]["encrypted_key"]
    except Exception as e:
        log.error(f"  Erro ao ler Local State: {e}")
        return None

    enc_key_bytes = base64.b64decode(enc_key_b64)[5:]  # remove prefixo "DPAPI"

    try:
        import win32crypt
        aes_key = win32crypt.CryptUnprotectData(enc_key_bytes, None, None, None, 0)[1]
    except Exception as e:
        log.error(f"  Erro DPAPI ao obter chave AES: {e}")
        return None

    # ── Banco de cookies ──────────────────────────────────────────────────────
    for sub in ["Default/Network/Cookies", "Default/Cookies"]:
        cookie_db = edge_dir / sub
        if cookie_db.exists():
            break
    else:
        log.error("  Banco de cookies do Edge nao encontrado")
        return None

    # Copia o arquivo com flags de compartilhamento Windows
    # (shutil.copy2 falha com WinError 32 quando Edge está aberto)
    tmp_db = Path(tempfile.mktemp(suffix=".db"))
    if not _copiar_arquivo_windows(cookie_db, tmp_db):
        log.error("  Nao foi possivel copiar o banco de cookies do Edge")
        return None

    # ── Lê e descriptografa ───────────────────────────────────────────────────
    try:
        from Cryptodome.Cipher import AES
    except ImportError:
        try:
            from Crypto.Cipher import AES
        except ImportError:
            log.error("  pycryptodomex nao instalado. Execute: pip install pycryptodomex")
            return None

    sess = requests.Session()
    sess.headers.update({
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": BASE_ECAC + "/",
    })

    n_cookies = 0
    try:
        conn = sqlite3.connect(tmp_db)
        rows = conn.execute(
            "SELECT name, encrypted_value, host_key, path FROM cookies "
            "WHERE host_key LIKE '%receita.fazenda.gov.br%' "
            "   OR host_key LIKE '%cav.receita%'"
        ).fetchall()
        conn.close()
    except Exception as e:
        log.error(f"  Erro ao ler banco de cookies: {e}")
        return None
    finally:
        try:
            tmp_db.unlink()
        except Exception:
            pass

    for name, enc_val, host, path_ in rows:
        try:
            if enc_val[:3] == b"v10":
                # AES-256-GCM (Chrome/Edge v80+)
                iv      = enc_val[3:15]
                payload = enc_val[15:]
                cipher  = AES.new(aes_key, AES.MODE_GCM, nonce=iv)
                value   = cipher.decrypt(payload[:-16]).decode("utf-8", errors="replace")
            else:
                # DPAPI (formato antigo)
                value = win32crypt.CryptUnprotectData(enc_val, None, None, None, 0)[1].decode("utf-8")
            sess.cookies.set(name, value, domain=host.lstrip("."))
            n_cookies += 1
        except Exception:
            pass

    if n_cookies == 0:
        print("\n  Nenhum cookie do e-CAC encontrado.")
        print("  Certifique-se de ter feito login ANTES de pressionar ENTER.")
        return None

    log.info(f"  [e-CAC] {n_cookies} cookie(s) lidos do Edge (sem admin)")
    return sess


# ── Download por empresa ────────────────────────────────────────────────────────

def _baixar_pendencias_empresa(empresa: Empresa, sess: requests.Session) -> dict:
    """
    Baixa Consulta Pendências — Situação Fiscal para a empresa.
    Salva na pasta relatorio da empresa.
    """
    resultado = {"ok": [], "falha": []}

    mes_str = date.today().strftime("%Y-%m")
    pasta   = empresa.pasta
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"ecac-consulta-pendencias-{mes_str}.pdf"

    if destino.exists():
        log.info(f"  Ja existe: {destino.name}")
        resultado["ok"].append("Consulta Pendencias (ja existia)")
        return resultado

    cnpj = empresa.cnpj

    candidatos = [
        f"{BASE_ECAC}/eCAC/financeiro/pendencias/consultar.jsf?cnpj={cnpj}",
        f"{BASE_ECAC}/eCAC/financeiro/pendencias/situacaofiscal.jsf?cnpj={cnpj}",
        f"{BASE_ECAC}/financeiro/pendencias/consultar?cnpj={cnpj}",
    ]

    for url in candidatos:
        try:
            r = sess.get(url, timeout=(15, 60), allow_redirects=True)
            ct = r.headers.get("Content-Type", "")

            if r.status_code == 200:
                if "pdf" in ct.lower() or r.content[:4] == b"%PDF":
                    destino.write_bytes(r.content)
                    log.info(f"  Salvo: {destino.name} ({len(r.content):,} bytes)")
                    resultado["ok"].append("Consulta Pendencias")
                    return resultado
                elif "html" in ct.lower() and len(r.content) > 500:
                    destino_html = pasta / f"ecac-consulta-pendencias-{mes_str}.html"
                    destino_html.write_bytes(r.content)
                    log.info(f"  Salvo HTML: {destino_html.name} — verificar URL exata")
                    resultado["ok"].append("Consulta Pendencias (HTML)")
                    return resultado
            else:
                log.debug(f"  {url[:60]}: HTTP {r.status_code}")

        except Exception as e:
            log.debug(f"  Erro em {url[:60]}: {e}")

    resultado["falha"].append("Consulta Pendencias (nenhuma URL funcionou)")
    return resultado


# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    filtro_cnpj = None
    if "--cnpj" in args:
        idx = args.index("--cnpj")
        filtro_cnpj = args[idx + 1]

    _configurar_log()

    try:
        todas = config.carregar_empresas()
    except RuntimeError as e:
        print(f"\nERRO: {e}\n")
        sys.exit(1)

    empresas = [e for e in todas if e.cnpj == filtro_cnpj] if filtro_cnpj else todas

    if not empresas:
        print("\nERRO: Nenhuma empresa encontrada.\n")
        sys.exit(1)

    print("=" * 65)
    print("  AGENTE LEXCON  |  RECEITA FEDERAL — e-CAC")
    print(f"  Data     : {date.today()}")
    print(f"  Empresas : {len(empresas)}")
    print("=" * 65)

    sess = autenticar_ecac()
    if not sess:
        print("\n  ERRO: Falha ou timeout na autenticacao e-CAC.")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("  Login realizado com sucesso!")
    print(f"  Cookies de sessao: {len(sess.cookies)}")
    print("=" * 65)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
certidao_sefaz.py
─────────────────
Baixa a Certidão Estadual (CND Estadual) do Portal do Contribuinte SEFAZ-AL
via API REST — mesma abordagem do agente_nfe_claude.py (sem Selenium).

Se a certidão for POSITIVA, também baixa o Extrato de Pendência de Débitos.

Uso: python certidao_sefaz.py --cnpj <CNPJ> [--destino <pasta>]
"""

import argparse
import json
import os
import sys
import time
from datetime import date
from pathlib import Path

import requests

BASE_DIR  = Path(__file__).parent
BASE      = "https://contribuinte.sefaz.al.gov.br"

# Respeita EMPRESAS_DATA_DIR igual ao app.py (volume Docker)
_DATA_DIR    = Path(os.environ.get("EMPRESAS_DATA_DIR", str(BASE_DIR)))
EMPRESAS_JSON = _DATA_DIR / "empresas.json"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Endpoints de autenticação a tentar (em ordem)
_AUTH_ENDPOINTS = [
    f"{BASE}/malhafiscal/api/authenticate",
    f"{BASE}/certidao/api/authenticate",
    f"{BASE}/regularidadefiscal/api/authenticate",
    f"{BASE}/debitosFiscais/api/authenticate",
]

# Endpoints para download da certidão estadual (em ordem de tentativa)
_CERTIDAO_ENDPOINTS = [
    f"{BASE}/certidao/sfz-certidao-api/api/certidao/emitir",
    f"{BASE}/certidao/sfz-certidao-api/api/certidao/gerar",
    f"{BASE}/certidao/api/certidao/emitir",
    f"{BASE}/certidao/api/certidao",
    f"{BASE}/regularidadefiscal/sfz-regularidade-fiscal-api/api/certidao/emitir",
    f"{BASE}/regularidadefiscal/sfz-regularidade-fiscal-api/api/certidao",
    f"{BASE}/regularidadefiscal/api/certidao/emitir",
    f"{BASE}/malhafiscal/sfz-malhafiscal-api/api/certidao",
]

# Endpoints para extrato de pendências (quando certidão é POSITIVA)
_EXTRATO_ENDPOINTS = [
    f"{BASE}/certidao/sfz-certidao-api/api/extrato/pendencias",
    f"{BASE}/certidao/sfz-certidao-api/api/extrato-pendencias",
    f"{BASE}/debitosFiscais/sfz-debito-relatorio-api/api/relatorio/extratoPendencias",
    f"{BASE}/debitosFiscais/sfz-debito-relatorio-api/api/relatorio/extratoDebitoContribuinte",
    f"{BASE}/regularidadefiscal/sfz-regularidade-fiscal-api/api/extrato-pendencias",
]


def _carregar_empresa(cnpj: str) -> dict | None:
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    if not EMPRESAS_JSON.exists():
        print(f"ERRO: Arquivo {EMPRESAS_JSON} não encontrado.")
        return None
    dados = json.loads(EMPRESAS_JSON.read_text(encoding="utf-8"))
    for e in dados:
        c = e.get("cnpj", "").replace(".", "").replace("/", "").replace("-", "")
        if c == cnpj_limpo:
            return e
    return None


def _nova_sessao() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": _UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Origin": BASE,
        "Referer": BASE + "/",
    })
    return sess


def _autenticar(sess: requests.Session, usuario: str, senha: str) -> str | None:
    """
    Tenta autenticar nos endpoints conhecidos do portal SEFAZ-AL.
    Retorna o JWT token ou None.
    """
    for url in _AUTH_ENDPOINTS:
        modulo = url.split("/")[3]
        for tentativa in range(1, 3):
            try:
                r = sess.post(
                    url,
                    json={"username": usuario, "password": senha, "rememberMe": False},
                    timeout=(15, 60),
                )
                if r.status_code == 200:
                    data = r.json()
                    token = data.get("id_token") or data.get("token") or data.get("access_token")
                    if token:
                        print(f"→ Login OK via [{modulo}]")
                        return token
                    print(f"  [{modulo}] 200 mas sem token na resposta")
                    break
                elif r.status_code == 401:
                    print(f"ERRO: Credenciais inválidas (401) em [{modulo}]")
                    return None
                elif r.status_code in (404, 405):
                    break  # endpoint não existe, tenta o próximo
                else:
                    print(f"  [{modulo}] HTTP {r.status_code} — tentativa {tentativa}/2")
                    if tentativa < 2:
                        time.sleep(3)
            except requests.exceptions.Timeout:
                print(f"  [{modulo}] Timeout (tentativa {tentativa}/2)")
                if tentativa < 2:
                    time.sleep(3)
            except Exception as e:
                print(f"  [{modulo}] Erro: {e}")
                break

    print("ERRO: Não foi possível autenticar em nenhum endpoint do portal.")
    return None


def _get_pdf(sess: requests.Session, url: str, params: dict | None = None, max_t: int = 8) -> bytes | None:
    """GET com retry para 406; retorna bytes do PDF ou None."""
    for t in range(1, max_t + 1):
        try:
            r = sess.get(url, params=params, timeout=(15, 120))
            ct = r.headers.get("Content-Type", "")
            if r.status_code == 200 and ("pdf" in ct.lower() or r.content[:4] == b"%PDF"):
                return r.content
            if r.status_code == 406:
                time.sleep(3)
                continue
            if r.status_code == 401:
                print("  Token expirou (401)")
                return None
            if r.status_code in (404, 405):
                return None  # endpoint não existe
            print(f"  HTTP {r.status_code} — {ct[:60]}")
            return None
        except requests.exceptions.Timeout:
            print(f"  Timeout (tentativa {t}/{max_t})")
            if t < max_t:
                time.sleep(5)
        except Exception as e:
            print(f"  Erro: {e}")
            return None
    return None


def _detectar_status(pdf_bytes: bytes) -> str:
    """
    Tenta inferir o status da certidão a partir do conteúdo do PDF.
    Retorna 'negativa', 'positiva_efeito_negativa' ou 'positiva'.
    """
    try:
        import pdfplumber
        import io
        texto = ""
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pg in pdf.pages:
                texto += (pg.extract_text() or "").upper()

        if "POSITIVA COM EFEITO DE NEGATIVA" in texto:
            return "positiva_efeito_negativa"
        if "NEGATIVA" in texto:
            return "negativa"
        if "POSITIVA" in texto:
            return "positiva"
    except Exception:
        pass
    return "desconhecido"


def baixar_certidao(cnpj: str, destino: Path | None = None) -> int:
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    empresa = _carregar_empresa(cnpj_limpo)
    if not empresa:
        print(f"ERRO: Empresa com CNPJ {cnpj_limpo} não encontrada no cadastro.")
        return 1

    nome    = empresa["nome"]
    usuario = empresa["usuario"]
    senha   = empresa["senha"]

    mes_str = date.today().strftime("%Y-%m")
    if destino is None:
        destino = BASE_DIR / "downloads" / mes_str / nome / "certidoes"
    destino.mkdir(parents=True, exist_ok=True)

    print(f"→ Empresa  : {nome}")
    print(f"→ CNPJ     : {cnpj_limpo}")
    print(f"→ Destino  : {destino}")
    print()

    # ── Autenticação ──────────────────────────────────────────────────────
    sess = _nova_sessao()
    token = _autenticar(sess, usuario, senha)
    if not token:
        return 1

    sess.headers["Authorization"] = f"Bearer {token}"

    # ── Download da certidão ──────────────────────────────────────────────
    print()
    print("→ Baixando certidão estadual...")

    nome_certidao = f"certidao-estadual-{cnpj_limpo[:8]}-{mes_str}.pdf"
    destino_certidao = destino / nome_certidao

    if destino_certidao.exists():
        print(f"→ Já existe: {nome_certidao}")
    else:
        pdf_bytes = None
        for url in _CERTIDAO_ENDPOINTS:
            modulo = url.split("/")[3]
            print(f"  Tentando [{modulo}]...")
            # Tenta com CNPJ como parâmetro (padrão JHipster)
            for params in [
                {"numeroCnpj": cnpj_limpo},
                {"cnpj": cnpj_limpo},
                {"numeroDocumento": cnpj_limpo},
                {"numeroCnpj": cnpj_limpo, "tipo": "pdf"},
            ]:
                sess.headers["Accept"] = "application/json, text/plain, */*"
                pdf_bytes = _get_pdf(sess, url, params=params, max_t=6)
                if pdf_bytes:
                    break
            if pdf_bytes:
                break

        if not pdf_bytes:
            print()
            print("ERRO: Nenhum endpoint retornou a certidão em PDF.")
            print("AVISO: O endpoint exato não foi descoberto automaticamente.")
            print("AVISO: Acesse o portal manualmente para identificar a URL correta.")
            print(f"       {BASE}/#/certidao  ou  {BASE}/#/regularidadefiscal")
            return 1

        destino_certidao.write_bytes(pdf_bytes)
        print(f"✔  Certidão salva: {nome_certidao} ({len(pdf_bytes):,} bytes)")

    # ── Verificar status ──────────────────────────────────────────────────
    pdf_bytes = destino_certidao.read_bytes()
    status = _detectar_status(pdf_bytes)

    print()
    if status == "negativa":
        print("✔  STATUS: NEGATIVA — empresa em situação regular na SEFAZ-AL.")
    elif status == "positiva_efeito_negativa":
        print("✔  STATUS: POSITIVA COM EFEITO DE NEGATIVA — empresa regular com ressalvas.")
    elif status == "positiva":
        print("⚠  STATUS: POSITIVA — empresa com débitos pendentes na SEFAZ-AL.")
    else:
        print(f"→  STATUS: não identificado no texto do PDF.")

    # ── Extrato de pendências (somente se POSITIVA) ───────────────────────
    if status == "positiva":
        print()
        print("→ Certidão POSITIVA — baixando Extrato de Pendência de Débitos...")

        nome_extrato = f"extrato-pendencias-{cnpj_limpo[:8]}-{mes_str}.pdf"
        destino_extrato = destino / nome_extrato

        if destino_extrato.exists():
            print(f"→ Já existe: {nome_extrato}")
        else:
            extrato_bytes = None
            for url in _EXTRATO_ENDPOINTS:
                modulo = url.split("/")[3]
                print(f"  Tentando extrato [{modulo}]...")
                for params in [
                    {"numeroCnpj": cnpj_limpo},
                    {"cnpj": cnpj_limpo},
                    {"numeroDocumento": cnpj_limpo},
                    {"numeroDocumento": usuario},
                ]:
                    extrato_bytes = _get_pdf(sess, url, params=params, max_t=5)
                    if extrato_bytes:
                        break
                if extrato_bytes:
                    break

            if extrato_bytes:
                destino_extrato.write_bytes(extrato_bytes)
                print(f"✔  Extrato salvo: {nome_extrato} ({len(extrato_bytes):,} bytes)")
            else:
                print("AVISO: Extrato de Pendências não disponível via API.")
                print(f"AVISO: Acesse manualmente: {BASE}/#/debitosFiscais")

    # ── Resumo ────────────────────────────────────────────────────────────
    print()
    arquivos = list(destino.glob("*.pdf"))
    print(f"→ {len(arquivos)} arquivo(s) em: {destino}")
    for a in arquivos:
        print(f"   • {a.name} ({a.stat().st_size:,} bytes)")

    return 0


def main():
    parser = argparse.ArgumentParser(description="Baixa certidão estadual SEFAZ-AL via API REST")
    parser.add_argument("--cnpj", required=True, help="CNPJ da empresa (14 dígitos)")
    parser.add_argument("--destino", default=None, help="Pasta de destino (opcional)")
    args = parser.parse_args()

    destino = Path(args.destino) if args.destino else None
    sys.exit(baixar_certidao(args.cnpj, destino))


if __name__ == "__main__":
    main()

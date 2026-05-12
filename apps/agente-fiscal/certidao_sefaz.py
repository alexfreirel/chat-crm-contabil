#!/usr/bin/env python3
"""
certidao_sefaz.py
─────────────────
Baixa a Certidão Estadual (CND Estadual) do Portal do Contribuinte SEFAZ-AL.
Se a certidão for POSITIVA, também baixa o Extrato de Pendência de Débitos.

Fluxo descoberto via DevTools:
  1. POST /certidao/api/authenticate               → JWT token
  2. GET  /certidao/sfz-pessoa-api/api/pessoa
          ?numeroDocumento={caceal}                → numeroPessoa, nome, tipoDocumento
  3. GET  /certidao/sfz-certidao-api/api/private/emitirCertidaoPositiva.pdf
          ?nome=…&numeroDocumento={caceal}&numeroPessoa={id}&tipoDocumento=CACE  → PDF
     (fallback: emitirCertidaoNegativa.pdf com mesmos parâmetros)

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

# Endpoints descobertos via DevTools
BASE_CERT         = f"{BASE}/certidao"
API_AUTH_CERT     = f"{BASE_CERT}/api/authenticate"
API_AUTH_MALHA    = f"{BASE}/malhafiscal/api/authenticate"
API_PESSOA        = f"{BASE_CERT}/sfz-pessoa-api/api/pessoa"
API_CERT_POSITIVA = f"{BASE_CERT}/sfz-certidao-api/api/private/emitirCertidaoPositiva.pdf"
API_CERT_NEGATIVA = f"{BASE_CERT}/sfz-certidao-api/api/private/emitirCertidaoNegativa.pdf"

# Endpoint do extrato confirmado via DevTools (debitosFiscais funciona)
_EXTRATO_CANDIDATOS = [
    f"{BASE}/debitosFiscais/sfz-debito-relatorio-api/api/relatorio/extratoDebitoContribuinteLogado/",
    f"{BASE_CERT}/sfz-certidao-api/api/private/emitirExtratoPendencias.pdf",
    f"{BASE_CERT}/sfz-certidao-api/api/private/extratoPendencias.pdf",
]

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Respeita EMPRESAS_DATA_DIR igual ao app.py (volume Docker)
_DATA_DIR     = Path(os.environ.get("EMPRESAS_DATA_DIR", str(BASE_DIR)))
EMPRESAS_JSON = _DATA_DIR / "empresas.json"


# ── Helpers ───────────────────────────────────────────────────────────────────

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
        "Referer": BASE + "/certidao/",
    })
    return sess


def _autenticar(sess: requests.Session, usuario: str, senha: str) -> str | None:
    """Autentica no módulo certidão (fallback: malhafiscal). Retorna JWT ou None."""
    for url, label in [(API_AUTH_CERT, "certidao"), (API_AUTH_MALHA, "malhafiscal")]:
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
                        print(f"→ Login OK via [{label}]")
                        return token
                    break
                elif r.status_code == 401:
                    print(f"ERRO: Credenciais inválidas (401)")
                    return None
                elif r.status_code in (404, 405, 500):
                    break  # endpoint não existe ou erro — tenta próximo
            except requests.exceptions.Timeout:
                if tentativa < 2:
                    time.sleep(3)
            except Exception as e:
                print(f"  [{label}] Erro: {e}")
                break
    print("ERRO: Autenticação falhou em todos os endpoints.")
    return None


def _buscar_pessoa(sess: requests.Session, caceal: str) -> dict | None:
    """
    GET /certidao/sfz-pessoa-api/api/pessoa?numeroDocumento={caceal}
    Retorna { numeroPessoa, nome, numeroDocumento, tipoDocumento } ou None.
    """
    try:
        r = sess.get(API_PESSOA, params={"numeroDocumento": caceal}, timeout=(15, 30))
        if r.status_code == 200:
            data = r.json()
            print(f"→ Pessoa encontrada: numeroPessoa={data.get('numeroPessoa')} tipoDocumento={data.get('tipoDocumento')}")
            return data
        print(f"  [pessoa] HTTP {r.status_code}")
        return None
    except Exception as e:
        print(f"  [pessoa] Erro: {e}")
        return None


def _get_pdf(sess: requests.Session, url: str, params: dict, label: str, max_t: int = 10) -> bytes | None:
    """GET com retry para 406. Retorna bytes do PDF ou None."""
    orig_accept = sess.headers.get("Accept", "")
    sess.headers["Accept"] = "application/pdf, application/octet-stream, */*"
    try:
        for t in range(1, max_t + 1):
            try:
                r = sess.get(url, params=params, timeout=(20, 120))
                ct = r.headers.get("Content-Type", "")
                if r.status_code == 200 and ("pdf" in ct.lower() or r.content[:4] == b"%PDF"):
                    return r.content
                if r.status_code == 406:
                    time.sleep(3)
                    continue
                if r.status_code == 401:
                    print(f"  [{label}] Token expirou (401)")
                    return None
                if r.status_code in (404, 405):
                    return None
                print(f"  [{label}] HTTP {r.status_code} — {ct[:60]}")
                return None
            except requests.exceptions.Timeout:
                print(f"  [{label}] Timeout (tentativa {t}/{max_t})")
                if t < max_t:
                    time.sleep(5)
            except Exception as e:
                print(f"  [{label}] Erro: {e}")
                return None
    finally:
        sess.headers["Accept"] = orig_accept
    return None


# ── Principal ──────────────────────────────────────────────────────────────────

def baixar_certidao(cnpj: str, destino: Path | None = None) -> int:
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    empresa = _carregar_empresa(cnpj_limpo)
    if not empresa:
        print(f"ERRO: Empresa com CNPJ {cnpj_limpo} não encontrada no cadastro.")
        return 1

    nome_emp = empresa["nome"]
    usuario  = empresa["usuario"]   # CACEAL (ex: 24014839)
    senha    = empresa["senha"]

    mes_str = date.today().strftime("%Y-%m")
    if destino is None:
        destino = BASE_DIR / "downloads" / mes_str / nome_emp / "certidoes"
    destino.mkdir(parents=True, exist_ok=True)

    print(f"→ Empresa  : {nome_emp}")
    print(f"→ CNPJ     : {cnpj_limpo}")
    print(f"→ CACEAL   : {usuario}")
    print(f"→ Destino  : {destino}")
    print()

    # ── 1. Autenticação ────────────────────────────────────────────────────
    sess = _nova_sessao()
    token = _autenticar(sess, usuario, senha)
    if not token:
        return 1
    sess.headers["Authorization"] = f"Bearer {token}"

    # ── 2. Buscar numeroPessoa ─────────────────────────────────────────────
    print()
    print("→ Buscando dados da pessoa no portal...")
    pessoa = _buscar_pessoa(sess, usuario)
    if not pessoa:
        print("ERRO: Não foi possível obter dados da pessoa (CACEAL inválido?)")
        return 1

    numero_pessoa  = pessoa["numeroPessoa"]
    nome_pessoa    = pessoa["nome"]
    tipo_documento = pessoa.get("tipoDocumento", "CACE")

    params_cert = {
        "nome":            nome_pessoa,
        "numeroDocumento": usuario,
        "numeroPessoa":    numero_pessoa,
        "tipoDocumento":   tipo_documento,
    }

    # ── 3. Baixar certidão ─────────────────────────────────────────────────
    print()
    print("→ Baixando certidão estadual...")

    nome_certidao    = f"certidao-estadual-{cnpj_limpo[:8]}-{mes_str}.pdf"
    destino_certidao = destino / nome_certidao
    status_certidao  = "desconhecido"

    if destino_certidao.exists():
        print(f"→ Já existe: {nome_certidao}")
        # Tenta inferir status pelo nome do arquivo já salvo
        if "positiva" in destino_certidao.stem.lower():
            status_certidao = "positiva"
        else:
            status_certidao = "negativa"
    else:
        # Tenta POSITIVA primeiro; se não retornar PDF, tenta NEGATIVA
        pdf_bytes = None

        print(f"  Tentando emitirCertidaoPositiva.pdf...")
        pdf_bytes = _get_pdf(sess, API_CERT_POSITIVA, params_cert, "positiva")
        if pdf_bytes:
            status_certidao = "positiva"
            nome_certidao   = f"certidao-estadual-positiva-{cnpj_limpo[:8]}-{mes_str}.pdf"

        if not pdf_bytes:
            print(f"  Tentando emitirCertidaoNegativa.pdf...")
            pdf_bytes = _get_pdf(sess, API_CERT_NEGATIVA, params_cert, "negativa")
            if pdf_bytes:
                status_certidao = "negativa"
                nome_certidao   = f"certidao-estadual-negativa-{cnpj_limpo[:8]}-{mes_str}.pdf"

        if not pdf_bytes:
            print()
            print("ERRO: Nenhum endpoint retornou a certidão em PDF.")
            return 1

        destino_certidao = destino / nome_certidao
        destino_certidao.write_bytes(pdf_bytes)
        print(f"✔  Certidão salva: {nome_certidao} ({len(pdf_bytes):,} bytes)")

    # ── 4. Status ──────────────────────────────────────────────────────────
    print()
    if status_certidao == "positiva":
        print("⚠  STATUS: POSITIVA — empresa com débitos pendentes na SEFAZ-AL.")
    elif status_certidao == "negativa":
        print("✔  STATUS: NEGATIVA — empresa em situação regular na SEFAZ-AL.")
    else:
        print(f"→  STATUS: {status_certidao}")

    # ── 5. Extrato de pendências (somente POSITIVA) ────────────────────────
    if status_certidao == "positiva":
        print()
        print("→ Certidão POSITIVA — baixando Extrato de Pendência de Débitos...")

        nome_extrato    = f"extrato-pendencias-{cnpj_limpo[:8]}-{mes_str}.pdf"
        destino_extrato = destino / nome_extrato

        if destino_extrato.exists():
            print(f"→ Já existe: {nome_extrato}")
        else:
            extrato_bytes = None
            for url in _EXTRATO_CANDIDATOS:
                modulo = url.split("/")[3]
                print(f"  Tentando extrato [{modulo}]...")
                # Tenta com os parâmetros da pessoa e também com o usuario (CACEAL)
                for params in [
                    params_cert,
                    {"numeroPessoa": numero_pessoa, "tipoDocumento": tipo_documento},
                    {"numeroDocumento": usuario},
                    {"numeroDocumento": usuario, "numeroPessoa": numero_pessoa},
                ]:
                    extrato_bytes = _get_pdf(sess, url, params, "extrato", max_t=5)
                    if extrato_bytes:
                        break
                if extrato_bytes:
                    break

            if extrato_bytes:
                destino_extrato.write_bytes(extrato_bytes)
                print(f"✔  Extrato salvo: {nome_extrato} ({len(extrato_bytes):,} bytes)")
            else:
                print("AVISO: Extrato de Pendências não disponível via API ainda.")
                print(f"AVISO: Acesse manualmente: {BASE}/certidao/#/emitir-certidao-positiva")
                print("AVISO: Abra o DevTools → Network → Fetch/XHR e clique em 'Extrato'")
                print("AVISO: para descobrir o endpoint e atualize _EXTRATO_CANDIDATOS.")

    # ── 6. Resumo ──────────────────────────────────────────────────────────
    print()
    arquivos = list(destino.glob("*.pdf"))
    print(f"→ {len(arquivos)} arquivo(s) em: {destino}")
    for a in arquivos:
        print(f"   • {a.name} ({a.stat().st_size:,} bytes)")

    return 0


def main():
    parser = argparse.ArgumentParser(description="Baixa certidão estadual SEFAZ-AL")
    parser.add_argument("--cnpj", required=True, help="CNPJ da empresa (14 dígitos)")
    parser.add_argument("--destino", default=None, help="Pasta de destino (opcional)")
    args = parser.parse_args()

    destino = Path(args.destino) if args.destino else None
    sys.exit(baixar_certidao(args.cnpj, destino))


if __name__ == "__main__":
    main()

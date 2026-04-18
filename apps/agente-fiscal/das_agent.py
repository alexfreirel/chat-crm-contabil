"""
das_agent.py
────────────
Download automático de guias DAS (Documento de Arrecadação do Simples Nacional)
e apuração via PGDAS-D.

Funcionalidades:
  - Download DAS-MEI (SIMEI)
  - Download DAS Simples Nacional via PGDAS
  - Consulta de débitos no Simples Nacional
  - Emissão de segunda via de DAS vencida

Fluxo:
  1. Autenticação via gov.br (certificado digital ou login/senha)
  2. Acesso ao portal PGDAS-D da Receita Federal
  3. Download de guias por CNPJ / competência
"""

import logging
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import requests

log = logging.getLogger("das_agent")

BASE_PGDAS   = "https://www8.receita.fazenda.gov.br/SimplesNacional"
BASE_SIMEI   = "https://www8.receita.fazenda.gov.br/SIMEI"
BASE_ECAC    = "https://cav.receita.fazenda.gov.br"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── DAS Simples Nacional via PGDAS-D ─────────────────────────────────────────

def _competencia_para_str(competencia: Optional[str] = None) -> str:
    """Converte competência para formato AAAA-MM. Usa mês anterior se None."""
    if competencia:
        return competencia[:7]  # Garante formato AAAA-MM
    # Mês anterior (DAS do mês corrente é emitida no mês seguinte)
    hoje = date.today()
    if hoje.month == 1:
        return f"{hoje.year - 1}-12"
    return f"{hoje.year}-{hoje.month - 1:02d}"


def baixar_das_pgdas(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
    competencia: Optional[str] = None,
) -> dict:
    """
    Tenta baixar o DAS Simples Nacional para a competência especificada.
    Requer sessão autenticada no gov.br com certificado digital.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    comp = _competencia_para_str(competencia)
    pasta.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"das-simples-{cnpj_limpo[:8]}-{comp}.pdf"
    destino = pasta / nome_arquivo

    if destino.exists():
        log.info(f"  DAS já existe: {destino.name}")
        return {"ok": True, "msg": "já existia", "arquivo": str(destino)}

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": BASE_PGDAS + "/",
    }

    # Formato de competência para o PGDAS: MM/AAAA
    comp_parts  = comp.split("-")
    comp_pgdas  = f"{comp_parts[1]}/{comp_parts[0]}" if len(comp_parts) == 2 else comp

    candidatos = [
        # PGDAS-D — emissão de DAS por CNPJ e competência
        f"{BASE_PGDAS}/Aplicacoes/ATBHE/SolicitacaoPagamentoEletronicoP2/EmissaoDAS.aspx?cnpj={cnpj_limpo}&competencia={comp_pgdas}",
        f"{BASE_PGDAS}/Servicos/PGDAS-D/Arquivos/EmissaoDAS.aspx?cnpj={cnpj_limpo}&PA={comp_pgdas}",
        f"{BASE_PGDAS}/Aplicacoes/ATBHE/emissaoDAS.app.aspx?CNPJ={cnpj_limpo}&PA={comp.replace('-', '')}",
    ]

    for url in candidatos:
        try:
            r = sess.get(url, headers=headers, timeout=(15, 60), allow_redirects=True)
            ct = r.headers.get("Content-Type", "")
            if r.status_code == 200:
                if "pdf" in ct.lower() or r.content[:4] == b"%PDF":
                    destino.write_bytes(r.content)
                    log.info(f"  [DAS-SIMPLES] Salvo: {destino.name} ({len(r.content):,} bytes)")
                    return {"ok": True, "msg": "baixado", "arquivo": str(destino)}
                elif "html" in ct.lower() and len(r.content) > 500:
                    # Pode conter link de download no HTML
                    pdf_link = _extrair_link_pdf(r.text)
                    if pdf_link:
                        r2 = sess.get(pdf_link, headers=headers, timeout=(15, 60))
                        if r2.status_code == 200 and r2.content[:4] == b"%PDF":
                            destino.write_bytes(r2.content)
                            log.info(f"  [DAS-SIMPLES] Salvo via link: {destino.name}")
                            return {"ok": True, "msg": "baixado via link", "arquivo": str(destino)}
        except Exception as e:
            log.debug(f"  [DAS-SIMPLES] Erro: {e}")
        time.sleep(1)

    return {"ok": False, "msg": f"DAS Simples não obtido para {cnpj_limpo} — competência {comp}"}


def baixar_das_mei(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
    competencia: Optional[str] = None,
) -> dict:
    """
    Tenta baixar o DAS-MEI (SIMEI) para a competência especificada.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    comp = _competencia_para_str(competencia)
    pasta.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"das-mei-{cnpj_limpo[:8]}-{comp}.pdf"
    destino = pasta / nome_arquivo

    if destino.exists():
        log.info(f"  DAS-MEI já existe: {destino.name}")
        return {"ok": True, "msg": "já existia", "arquivo": str(destino)}

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }

    comp_parts = comp.split("-")
    comp_simei = f"{comp_parts[1]}/{comp_parts[0]}" if len(comp_parts) == 2 else comp

    candidatos = [
        f"{BASE_SIMEI}/Aplicacoes/ATBHE/EmissaoDas.aspx?cnpj={cnpj_limpo}&PA={comp_simei}",
        f"{BASE_PGDAS}/Aplicacoes/ATBHE/emissaoDASMEI.aspx?cnpj={cnpj_limpo}&competencia={comp_simei}",
    ]

    for url in candidatos:
        try:
            r = sess.get(url, headers=headers, timeout=(15, 60), allow_redirects=True)
            ct = r.headers.get("Content-Type", "")
            if r.status_code == 200:
                if "pdf" in ct.lower() or r.content[:4] == b"%PDF":
                    destino.write_bytes(r.content)
                    log.info(f"  [DAS-MEI] Salvo: {destino.name} ({len(r.content):,} bytes)")
                    return {"ok": True, "msg": "baixado", "arquivo": str(destino)}
        except Exception as e:
            log.debug(f"  [DAS-MEI] Erro: {e}")
        time.sleep(0.8)

    return {"ok": False, "msg": f"DAS-MEI não obtido para {cnpj_limpo} — competência {comp}"}


def baixar_das_empresa(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
    regime: str,
    competencias: Optional[list[str]] = None,
) -> dict:
    """
    Wrapper que escolhe a função correta (MEI ou Simples) e baixa DAS
    para uma ou mais competências.
    """
    if competencias is None:
        competencias = [_competencia_para_str()]  # Mês anterior

    resultados = {}
    for comp in competencias:
        if regime.upper() == "MEI":
            res = baixar_das_mei(sess, cnpj, pasta, comp)
        else:
            res = baixar_das_pgdas(sess, cnpj, pasta, comp)
        resultados[comp] = res
        time.sleep(1.5)

    return resultados


# ── Consulta débitos Simples Nacional ─────────────────────────────────────────

def consultar_debitos_simples(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
) -> dict:
    """
    Consulta débitos no Simples Nacional via e-CAC.
    Salva relatório HTML/PDF na pasta da empresa.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    pasta.mkdir(parents=True, exist_ok=True)

    mes_str = date.today().strftime("%Y-%m")
    destino = pasta / f"debitos-simples-{cnpj_limpo[:8]}-{mes_str}.html"

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": BASE_ECAC + "/",
    }

    urls = [
        f"{BASE_ECAC}/eCAC/servicos/pgdas/consultaDebitos.asp?cnpj={cnpj_limpo}",
        f"{BASE_PGDAS}/Aplicacoes/ATBHE/ConsultaDebitos.aspx?cnpj={cnpj_limpo}",
    ]

    for url in urls:
        try:
            r = sess.get(url, headers=headers, timeout=(15, 60), allow_redirects=True)
            if r.status_code == 200 and len(r.content) > 500:
                ct = r.headers.get("Content-Type", "")
                if "html" in ct.lower():
                    destino.write_bytes(r.content)
                    log.info(f"  [DÉBITOS] Salvo: {destino.name}")
                    return {"ok": True, "arquivo": str(destino)}
        except Exception as e:
            log.debug(f"  [DÉBITOS] Erro: {e}")
        time.sleep(1)

    return {"ok": False, "msg": "Não foi possível consultar débitos"}


# ── Utilitários internos ──────────────────────────────────────────────────────

def _extrair_link_pdf(html: str) -> Optional[str]:
    """Extrai primeiro link de PDF do HTML da página."""
    padroes = [
        r'href=["\']([^"\']*\.pdf[^"\']*)["\']',
        r'href=["\']([^"\']*download[^"\']*)["\']',
        r'action=["\']([^"\']*\.pdf[^"\']*)["\']',
    ]
    for p in padroes:
        m = re.search(p, html, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


# ── CLI standalone ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    args = sys.argv[1:]
    cnpj = next((args[i + 1] for i, a in enumerate(args) if a == "--cnpj"), None)
    regime = next((args[i + 1] for i, a in enumerate(args) if a == "--regime"), "SIMPLES_NACIONAL")
    comp = next((args[i + 1] for i, a in enumerate(args) if a == "--comp"), None)

    if not cnpj:
        print("Uso: python das_agent.py --cnpj 00000000000000 [--regime MEI|SIMPLES_NACIONAL] [--comp AAAA-MM]")
        sys.exit(1)

    # Sem sessão autenticada — mostra apenas consulta pública
    from certidoes_agent import consultar_cnpj_receita, consultar_simples_nacional
    info = consultar_cnpj_receita(cnpj)
    simples = consultar_simples_nacional(cnpj)
    print(json.dumps({"cnpj": info, "simples": simples}, ensure_ascii=False, indent=2, default=str))

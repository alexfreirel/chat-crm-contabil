"""
certidoes_agent.py
──────────────────
Download automático de Certidões Negativas de Débito (CND) via e-CAC.

Certidões suportadas:
  - CND Federal (Receita Federal + PGFN — Certidão Conjunta)
  - Certidão FGTS (Caixa Econômica Federal)
  - CADIN (Cadastro Informações dos Inadimplentes)
  - Situação no Simples Nacional

Fluxo:
  1. Recebe session requests já autenticada (via autenticar_ecac() do ecac_agent)
  2. Faz download de cada certidão por CNPJ
  3. Salva PDFs com timestamp na pasta da empresa
"""

import logging
import time
from datetime import date
from pathlib import Path

import requests

log = logging.getLogger("certidoes_agent")

BASE_ECAC = "https://cav.receita.fazenda.gov.br"
BASE_PGFN = "https://www.regularize.pgfn.gov.br"
BASE_CND  = "https://solucoes.receita.fazenda.gov.br"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Tipos de certidão ─────────────────────────────────────────────────────────

CERTIDOES = {
    "CND_FEDERAL": {
        "nome": "CND Federal (RF + PGFN)",
        "urls": [
            # Certidão Conjunta RF + PGFN
            "{BASE_CND}/servicos/certidao/CNDConjuntaInter/consultarCertidao.asp?cpfcnpj={cnpj}",
            "{BASE_ECAC}/eCAC/servicos/certidao/emissaoEmpresas/emissao.asp?ni={cnpj}&tipoNI=2",
        ],
        "arquivo": "cnd-federal-conjunta",
    },
    "CND_FGTS": {
        "nome": "Certidão de Regularidade do FGTS",
        "urls": [
            "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf",
        ],
        "arquivo": "certidao-fgts",
    },
    "SIMPLES_NACIONAL": {
        "nome": "Situação no Simples Nacional",
        "urls": [
            "https://www8.receita.fazenda.gov.br/SimplesNacional/Servicos/PGDAS-D/Arquivos/ConsultaSituacaoCompleto.aspx?cnpj={cnpj}",
            "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATBHE/consultaSituacao.app.aspx",
        ],
        "arquivo": "situacao-simples-nacional",
    },
}


def _baixar_certidao(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
    tipo: str,
) -> dict:
    """Tenta baixar a certidão especificada para o CNPJ. Retorna dict com status."""
    config = CERTIDOES.get(tipo)
    if not config:
        return {"ok": False, "msg": f"Tipo de certidão desconhecido: {tipo}"}

    mes_str = date.today().strftime("%Y-%m")
    pasta.mkdir(parents=True, exist_ok=True)
    nome_arquivo = f"{config['arquivo']}-{cnpj[:8]}-{mes_str}.pdf"
    destino = pasta / nome_arquivo

    if destino.exists():
        log.info(f"  Já existe: {destino.name}")
        return {"ok": True, "msg": "já existia", "arquivo": str(destino)}

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": BASE_ECAC + "/",
    }

    for url_template in config["urls"]:
        url = url_template.format(cnpj=cnpj, BASE_CND=BASE_CND, BASE_ECAC=BASE_ECAC)
        try:
            r = sess.get(url, headers=headers, timeout=(15, 60), allow_redirects=True)
            ct = r.headers.get("Content-Type", "")

            if r.status_code == 200:
                if "pdf" in ct.lower() or r.content[:4] == b"%PDF":
                    destino.write_bytes(r.content)
                    log.info(f"  [{tipo}] Salvo: {destino.name} ({len(r.content):,} bytes)")
                    return {"ok": True, "msg": "baixado", "arquivo": str(destino)}
                elif "html" in ct.lower() and len(r.content) > 1000:
                    # Salva HTML para inspeção manual
                    destino_html = pasta / nome_arquivo.replace(".pdf", ".html")
                    destino_html.write_bytes(r.content)
                    log.info(f"  [{tipo}] HTML salvo: {destino_html.name}")
                    return {"ok": True, "msg": "html salvo", "arquivo": str(destino_html)}
            else:
                log.debug(f"  [{tipo}] HTTP {r.status_code}: {url[:60]}")

        except requests.exceptions.Timeout:
            log.warning(f"  [{tipo}] Timeout em: {url[:60]}")
        except Exception as e:
            log.debug(f"  [{tipo}] Erro em {url[:60]}: {e}")

        time.sleep(1)

    return {"ok": False, "msg": f"Nenhuma URL funcionou para {tipo}"}


def baixar_certidoes_empresa(
    sess: requests.Session,
    cnpj: str,
    pasta: Path,
    tipos: list[str] | None = None,
) -> dict:
    """
    Baixa todas as certidões (ou os tipos especificados) para o CNPJ.
    Retorna dict com resultado por tipo.
    """
    if tipos is None:
        tipos = list(CERTIDOES.keys())

    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    resultado = {}

    log.info(f"Baixando certidões para CNPJ {cnpj_limpo} — {len(tipos)} tipo(s)")
    for tipo in tipos:
        resultado[tipo] = _baixar_certidao(sess, cnpj_limpo, pasta, tipo)
        time.sleep(1.5)  # Cortesia entre requests

    ok  = sum(1 for v in resultado.values() if v.get("ok"))
    log.info(f"  Resultado: {ok}/{len(tipos)} certidões obtidas")
    return resultado


def baixar_certidoes_todas(
    sess: requests.Session,
    empresas: list[dict],
    download_dir: Path,
    tipos: list[str] | None = None,
) -> list[dict]:
    """
    Baixa certidões para todas as empresas.
    Cada empresa deve ter 'cnpj' e 'nome'.
    """
    resultados = []
    for i, emp in enumerate(empresas, 1):
        cnpj = emp.get("cnpj", "")
        nome = emp.get("nome", f"empresa-{i}")
        log.info(f"\n[{i}/{len(empresas)}] {nome} — CNPJ {cnpj}")

        pasta = download_dir / date.today().strftime("%Y-%m") / nome
        res = baixar_certidoes_empresa(sess, cnpj, pasta, tipos)
        resultados.append({"empresa": nome, "cnpj": cnpj, "resultado": res})

    return resultados


# ── Consulta Simples Nacional (pública, sem autenticação) ─────────────────────

def consultar_simples_nacional(cnpj: str) -> dict:
    """
    Consulta pública da situação no Simples Nacional.
    Não requer autenticação — usa endpoint público da Receita Federal.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    sess = requests.Session()
    sess.headers.update({"User-Agent": _UA, "Accept-Language": "pt-BR,pt;q=0.9"})

    urls = [
        f"https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATBHE/consultaSituacao.app.aspx?cnpj={cnpj_limpo}",
        f"https://www.registroempresasnet.com.br/api/simples?cnpj={cnpj_limpo}",
    ]

    for url in urls:
        try:
            r = sess.get(url, timeout=15, allow_redirects=True)
            if r.status_code == 200:
                ct = r.headers.get("Content-Type", "")
                if "json" in ct:
                    data = r.json()
                    return {
                        "ok": True,
                        "cnpj": cnpj_limpo,
                        "optante": data.get("optante", None),
                        "data_opcao": data.get("data_opcao", None),
                        "situacao": data.get("situacao", None),
                        "fonte": url,
                    }
                elif "html" in ct and r.text:
                    # Parse básico do HTML para extrair informação
                    texto = r.text.lower()
                    optante = "optante" in texto and "não optante" not in texto
                    return {
                        "ok": True,
                        "cnpj": cnpj_limpo,
                        "optante": optante,
                        "data_opcao": None,
                        "situacao": "Optante" if optante else "Não optante",
                        "fonte": url,
                    }
        except Exception as e:
            log.debug(f"Simples Nacional query error: {e}")

    return {"ok": False, "cnpj": cnpj_limpo, "msg": "Consulta não disponível"}


# ── Consulta CNPJ na Receita Federal ─────────────────────────────────────────

def consultar_cnpj_receita(cnpj: str) -> dict:
    """
    Consulta dados cadastrais do CNPJ via APIs públicas.
    Tenta brasilapi.com.br e receitaws.com.br como fallback.
    """
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    sess = requests.Session()
    sess.headers.update({"User-Agent": _UA})

    apis = [
        f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}",
        f"https://receitaws.com.br/v1/cnpj/{cnpj_limpo}",
    ]

    for url in apis:
        try:
            r = sess.get(url, timeout=15)
            if r.status_code == 200:
                data = r.json()
                if "error" not in str(data.get("status", "")).lower():
                    return {
                        "ok": True,
                        "cnpj": cnpj_limpo,
                        "nome": data.get("razao_social") or data.get("nome"),
                        "fantasia": data.get("nome_fantasia") or data.get("fantasia"),
                        "situacao_cadastral": data.get("descricao_situacao_cadastral") or data.get("situacao"),
                        "data_abertura": data.get("data_inicio_atividade") or data.get("abertura"),
                        "porte": data.get("descricao_porte") or data.get("porte"),
                        "natureza": data.get("natureza_juridica", {}).get("descricao") if isinstance(data.get("natureza_juridica"), dict) else data.get("natureza_juridica"),
                        "atividade_principal": (data.get("cnae_fiscal_descricao") or
                                                (data.get("atividade_principal", [{}])[0].get("text") if data.get("atividade_principal") else None)),
                        "fonte": url,
                    }
        except Exception as e:
            log.debug(f"CNPJ query error ({url[:40]}): {e}")

    return {"ok": False, "cnpj": cnpj_limpo, "msg": "CNPJ não encontrado"}

"""
agente_nfe_claude.py
────────────────────
Agente NF-e para SEFAZ Alagoas.
Faz login no Portal do Contribuinte e baixa os relatórios de cada empresa.

Relatórios baixados por empresa/período:
  1. Notas Fiscais de Entrada
  2. Consolidação das Malhas Fiscais (MFIC01, MFIC02, MFIC03, MFIC04, MFIC06)
  3. Consolidação da Malha Fiscal MFIC05
  4. Consolidação das Malhas Fiscais (MFIC07, MFIC11, MFIC13)

Uso:
  py agente_nfe_claude.py --mes 2026-03
  py agente_nfe_claude.py --mes 2026-03 --cnpj 36834654000168
"""

import calendar
import importlib
import json
import logging
import os
import sys
import time
from datetime import date
from pathlib import Path

import requests

import config
from config import Empresa

log = logging.getLogger("agente_nfe")

BASE = "https://contribuinte.sefaz.al.gov.br"
API_MALHA        = f"{BASE}/malhafiscal/sfz-malhafiscal-api/api/relatorios"
API_EXTRATO      = f"{BASE}/debitosFiscais/sfz-debito-relatorio-api/api/relatorio"
BASE_PARCELAMENTO = f"{BASE}/parcelamento"
API_PARCELAMENTO  = f"{BASE_PARCELAMENTO}/sfz-parcelamento-api/api"

# ── Arrecadação do Contribuinte ───────────────────────────────────────────────
BASE_ARRECADACAO    = f"{BASE}/arrecadacaocontribuinte"
API_ARRECADACAO_AUTH = f"{BASE_ARRECADACAO}/api/authenticate"
_ARRECADACAO_CANDIDATOS = [
    f"{BASE_ARRECADACAO}/sfz-portal-fazendario-arrecadacao-api/api/relatorio/extratoArrecadacao",
]

# ── Cobrança DF-e ─────────────────────────────────────────────────────────────
BASE_COBRANCA_DFE   = f"{BASE}/cobrancadfe"
API_COBRANCA_AUTH   = f"{BASE_COBRANCA_DFE}/api/authenticate"
API_COBRANCA_LISTA  = f"{BASE_COBRANCA_DFE}/sfz-cobranca-dfe-api/api/cobranca-nfe/cobranca-paginada"
API_CONSOLIDAR_DAR  = f"{BASE_COBRANCA_DFE}/cobranca-dfe-obrigacao-api/api/consolidacao/consolidar-cobrancas"
API_EMITIR_DAR      = f"{BASE_COBRANCA_DFE}/cobranca-dfe-obrigacao-api/api/dar/emitir/consolidacoes"

# Um DAR por aba do portal (sem ANTEF — suas receitas já estão nos outros grupos)
GRUPOS_IMPOSTOS = [
    {"label": "DIFAL",                    "receitas": [1538, 2125, 1756, 2127],       "arquivo": "dar-difal-{mes}.pdf"},
    {"label": "Antecipado",               "receitas": [1220, 1546],                   "arquivo": "dar-antecipado-{mes}.pdf"},
    {"label": "Substituição Tributária",  "receitas": [1315, 1814, 1813, 1758, 1812], "arquivo": "dar-st-{mes}.pdf"},
    {"label": "ST Emitente",              "receitas": [1769, 1760, 2058],             "arquivo": "dar-st-emitente-{mes}.pdf"},
]

# ── Candidatos para relatório PDF de cobranças ────────────────────────────────
# Endpoint do botão "Imprimir relatório completo" do portal Cobrança DF-e.
# Endpoint correto identificado via DevTools: gerar-relatorio-cobrancas
# Tentados em ordem até retornar PDF válido; o que funcionar é cacheado.
_CACHE_KEY_REL_PDF = "relatorio-cobrancas-pdf-endpoint-v2"
API_COBRANCA_RELATORIO_CANDIDATOS = [
    f"{BASE_COBRANCA_DFE}/sfz-cobranca-dfe-api/api/cobranca-nfe/gerar-relatorio-cobrancas",
    f"{BASE_COBRANCA_DFE}/sfz-cobranca-dfe-api/api/cobranca-nfe/relatorio",
    f"{BASE_COBRANCA_DFE}/sfz-cobranca-dfe-api/api/cobranca-nfe/imprimir",
    f"{BASE_COBRANCA_DFE}/sfz-cobranca-dfe-api/api/relatorio/cobranca-nfe",
]

# ── Cache de endpoints descobertos ────────────────────────────────────────────
# Salvo localmente para não precisar redescobrir a cada execução
_CACHE_FILE = Path(__file__).parent / ".endpoints_cache.json"

def _carregar_cache() -> dict:
    if _CACHE_FILE.exists():
        try:
            return json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def _salvar_cache(cache: dict):
    _CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


# ── Definição dos relatórios ──────────────────────────────────────────────────
# Cada relatório tem:
#   nome_arquivo : nome do PDF salvo
#   descricao    : nome exibido no log
#   usa_datas    : se passa dataInicial/dataFinal
#   candidatos   : lista de (endpoint, params_extra) para tentar em ordem
RELATORIOS = [
    {
        "id": "notas-fiscais-entrada",
        "descricao": "Notas Fiscais de Entrada",
        "nome_arquivo": "notas-fiscais-entrada-{mes}.pdf",
        "usa_datas": True,
        "api_bases": [API_MALHA],
        "candidatos": [
            ("notas-fiscais-entrada", ""),
        ],
    },
    {
        "id": "consolidacao-mfic-grupo1",
        "descricao": "Consolidação MFIC01/02/03/04/06",
        "nome_arquivo": "consolidacao-mfic01-02-03-04-06-{mes}.pdf",
        "usa_datas": False,
        "api_bases": [API_MALHA],
        "candidatos": [
            ("consolidacaoMalhas", ""),
        ],
    },
    {
        "id": "consolidacao-mfic05",
        "descricao": "Consolidação MFIC05",
        "nome_arquivo": "consolidacao-mfic05-{mes}.pdf",
        "usa_datas": False,
        "api_bases": [API_MALHA],
        "candidatos": [
            ("consolidacaoMalhaMFIC05", ""),
        ],
    },
    {
        "id": "consolidacao-mfic-grupo3",
        "descricao": "Consolidação MFIC07/11/13",
        "nome_arquivo": "consolidacao-mfic07-11-13-{mes}.pdf",
        "usa_datas": False,
        "api_bases": [API_MALHA],
        "candidatos": [
            ("consolidacaoMalhas2", ""),
        ],
    },
    {
        "id": "extrato-debito-contribuinte",
        "descricao": "Extrato de Débito do Contribuinte",
        "nome_arquivo": "extrato-debito-contribuinte-{mes}.pdf",
        "usa_datas": False,
        "usa_usuario": True,   # parâmetro é numeroDocumento (usuário), não numeroCnpj
        "api_bases": [API_EXTRATO],
        "candidatos": [
            ("extratoDebitoContribuinteLogado/", ""),
        ],
    },
]


# ── Configurar log ─────────────────────────────────────────────────────────────
def _configurar_log():
    root = logging.getLogger()
    root.handlers.clear()
    sh = logging.StreamHandler(sys.stdout)
    if hasattr(sh.stream, "reconfigure"):
        sh.stream.reconfigure(encoding="utf-8", errors="replace")
    fh = logging.FileHandler(config.DOWNLOAD_DIR / "agente.log", encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s")
    sh.setFormatter(fmt)
    fh.setFormatter(fmt)
    root.setLevel(logging.INFO)
    root.addHandler(sh)
    root.addHandler(fh)


# ── Login ──────────────────────────────────────────────────────────────────────
def _autenticar(sess: requests.Session, url_auth: str, usuario: str, senha: str, label: str) -> "str | None":
    """Faz login em um endpoint e retorna o token JWT, ou None se falhar."""
    for tentativa in range(1, 4):
        try:
            r = sess.post(
                url_auth,
                json={"username": usuario, "password": senha, "rememberMe": False},
                timeout=(15, 60),
            )
            if r.status_code == 200:
                data = r.json()
                token = data.get("id_token") or data.get("token") or data.get("access_token")
                if token:
                    log.info(f"  [{label}] Login OK")
                    return token
                log.warning(f"  [{label}] 200 mas sem token: {r.text[:80]}")
                return None
            elif r.status_code == 401:
                log.error(f"  [{label}] Credenciais inválidas (401)")
                return None
            else:
                log.warning(f"  [{label}] HTTP {r.status_code}")
                return None
        except requests.exceptions.Timeout:
            log.warning(f"  [{label}] Timeout (tentativa {tentativa}/3)")
            if tentativa < 3:
                time.sleep(5)
        except Exception as e:
            log.error(f"  [{label}] Erro: {e}")
            if tentativa < 3:
                time.sleep(5)
    return None


def _login(empresa: Empresa) -> "tuple[requests.Session, str | None] | None":
    """
    Faz login nos dois portais (malhafiscal + debitosFiscais).
    Retorna (session, token_debitos) ou None se o login principal falhar.
    O session.headers["Authorization"] já traz o token do malhafiscal.
    token_debitos é usado apenas para relatórios do módulo Débitos Fiscais.
    """
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Origin": BASE,
        "Referer": BASE + "/",
    })

    log.info(f"[{empresa.nome}] Login...")

    # Login principal — Malha Fiscal
    token_malha = _autenticar(
        sess, f"{BASE}/malhafiscal/api/authenticate",
        empresa.usuario, empresa.senha, "malhafiscal"
    )
    if not token_malha:
        log.error(f"[{empresa.nome}] Login malhafiscal falhou")
        return None

    sess.headers["Authorization"] = f"Bearer {token_malha}"
    sess.headers["Accept"] = "application/json, text/plain, */*"

    # Login secundário — Débitos Fiscais (auth separada)
    token_debitos = _autenticar(
        sess, f"{BASE}/debitosFiscais/api/authenticate",
        empresa.usuario, empresa.senha, "debitosFiscais"
    )
    if not token_debitos:
        log.warning(f"[{empresa.nome}] Login debitosFiscais falhou — extrato será ignorado")

    return sess, token_debitos

    log.error(f"[{empresa.nome}] Login falhou após 3 tentativas")
    return None


# ── Baixar um PDF com retry para 406 ──────────────────────────────────────────
def _get_pdf(sess: requests.Session, url: str, max_tentativas: int = 15) -> "bytes | None":
    for tentativa in range(1, max_tentativas + 1):
        try:
            r = sess.get(url, timeout=(15, 120))
            ct = r.headers.get("Content-Type", "")
            if r.status_code == 200 and (
                "pdf" in ct.lower()
                or "octet-stream" in ct.lower()
                or r.content[:4] == b"%PDF"
            ):
                return r.content
            if r.status_code == 406:
                log.debug(f"  406 (backend instável) tentativa {tentativa}/{max_tentativas}")
                time.sleep(3)
                continue
            if r.status_code == 401:
                log.error("  Token expirou (401)")
                return None
            log.debug(f"  HTTP {r.status_code}  size={len(r.content)}")
            return None   # endpoint não existe ou erro definitivo
        except requests.exceptions.Timeout:
            log.warning(f"  Timeout (tentativa {tentativa})")
            if tentativa < max_tentativas:
                time.sleep(5)
        except Exception as e:
            log.warning(f"  Erro: {e}")
            if tentativa < max_tentativas:
                time.sleep(3)
    return None


# ── Descobrir e baixar um relatório ───────────────────────────────────────────
def _baixar_relatorio(
    sess: requests.Session,
    empresa: Empresa,
    relatorio: dict,
    cache: dict,
    token_debitos: "str | None" = None,
) -> "Path | None":
    mes = config.MES_STR
    nome_arquivo = relatorio["nome_arquivo"].format(mes=mes)
    destino = empresa.pasta / nome_arquivo
    rid = relatorio["id"]

    if destino.exists():
        log.info(f"  Já existe: {nome_arquivo}")
        return destino

    cnpj = empresa.cnpj
    di   = config.DATA_INICIAL_ISO
    df   = config.DATA_FINAL_ISO

    # Usa endpoint em cache se já descoberto
    cached = cache.get(rid)
    if cached:
        api_bases_lista  = [cached.get("api", relatorio["api_bases"][0])]
        candidatos_lista = [(cached["ep"], cached["extra"])]
        max_t = 15   # endpoint conhecido — mais tentativas
    else:
        api_bases_lista  = relatorio["api_bases"]
        candidatos_lista = relatorio["candidatos"]
        max_t = 4    # descoberta — descarta rápido se não funcionar

    # Token correto por módulo
    token_malha = sess.headers.get("Authorization", "")

    for api in api_bases_lista:
        for ep, extra in candidatos_lista:
            if relatorio["usa_datas"]:
                url = f"{api}/{ep}?numeroCnpj={cnpj}&dataInicial={di}&dataFinal={df}&tipo=pdf{extra}"
                sess.headers["Accept"]       = "application/octet-stream"
                sess.headers["Content-Type"] = "application/json"
                sess.headers["Authorization"] = token_malha
            elif relatorio.get("usa_usuario"):
                # Débitos Fiscais: parâmetro é numeroDocumento, token próprio
                if not token_debitos:
                    log.warning("  Token debitosFiscais indisponível — pulando")
                    return None
                url = f"{api}/{ep}?numeroDocumento={empresa.usuario}{extra}"
                sess.headers["Accept"]        = "application/json, text/plain, */*"
                sess.headers["Authorization"] = f"Bearer {token_debitos}"
                sess.headers.pop("Content-Type", None)
            else:
                url = f"{api}/{ep}?numeroCnpj={cnpj}{extra}"
                sess.headers["Accept"]        = "application/json, text/plain, */*"
                sess.headers["Authorization"] = token_malha
                sess.headers.pop("Content-Type", None)

            log.info(f"  Tentando: {api.split('/')[-3]}/{ep}{extra or ''}")
            pdf = _get_pdf(sess, url, max_tentativas=max_t)

            if pdf:
                destino.write_bytes(pdf)
                log.info(f"  Salvo: {nome_arquivo} ({len(pdf):,} bytes)")
                if not cached:
                    cache[rid] = {"api": api, "ep": ep, "extra": extra}
                    _salvar_cache(cache)
                    log.info(f"  Endpoint cacheado: {ep}{extra or ''}")
                return destino

    log.warning(f"  Nenhum endpoint funcionou para: {relatorio['descricao']}")
    return None


# ── Extrato de Arrecadação do Contribuinte ────────────────────────────────────
def _mes_anterior_datas() -> tuple[str, str, str]:
    """
    Retorna (mes_str, data_inicial_iso, data_final_iso) do mês anterior ao configurado.
    Ex: MES_STR=2026-05 → ('2026-04', '2026-04-01', '2026-04-30')
    """
    if config.MES_NUM == 1:
        ano, mes = config.ANO - 1, 12
    else:
        ano, mes = config.ANO, config.MES_NUM - 1
    ultimo = calendar.monthrange(ano, mes)[1]
    mes_str = f"{ano}-{mes:02d}"
    di = f"{ano}-{mes:02d}-01"
    df = f"{ano}-{mes:02d}-{ultimo:02d}"
    return mes_str, di, df


def _baixar_extrato_arrecadacao(sess: requests.Session, empresa: Empresa, cache: dict) -> "Path | None":
    """
    Baixa o Extrato de Arrecadação do mês anterior ao período selecionado.
    Usa empresa.usuario como numeroDocumento (inscrição estadual / CACEAL).
    """
    mes_ant, di, df = _mes_anterior_datas()
    nome_arquivo = f"extrato-arrecadacao-{mes_ant}.pdf"
    destino = empresa.pasta / nome_arquivo

    if destino.exists():
        log.info(f"  Já existe: {nome_arquivo}")
        return destino

    # Tenta autenticar no portal de arrecadação (auth própria, com fallback no token atual)
    token_arr = _autenticar(sess, API_ARRECADACAO_AUTH, empresa.usuario, empresa.senha, "arrecadacao")
    if not token_arr:
        log.warning(f"  [{empresa.nome}] Login arrecadação falhou — tentando com token malhafiscal")
        token_arr = sess.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token_arr:
        log.warning(f"  [{empresa.nome}] Sem token para arrecadação — ignorando")
        return None

    # usuario já é a inscrição estadual (CACEAL), remove formatação por segurança
    inscricao = empresa.usuario.replace("-", "").replace(".", "").strip()
    cache_key = "extrato-arrecadacao-endpoint"
    cached_url = cache.get(cache_key)

    candidatos = [cached_url] if cached_url else _ARRECADACAO_CANDIDATOS
    cache_buster = int(time.time() * 1000)

    headers_orig = dict(sess.headers)
    sess.headers["Authorization"] = f"Bearer {token_arr}"
    sess.headers["Accept"] = "application/octet-stream, application/pdf, */*"
    sess.headers.pop("Content-Type", None)

    for url_base in candidatos:
        params = (
            f"?cacheBuster={cache_buster}"
            f"&codigoReceita="
            f"&codigoUnidadeGestora=900003"
            f"&dataFinal={df}T00:00:00-00:00"
            f"&dataInicial={di}T00:00:00-00:00"
            f"&numeroDocumento={inscricao}"
        )
        url = f"{url_base}{params}"
        log.info(f"  [Arrecadação] Tentando: {url_base.split('/')[-1]}")
        try:
            r = sess.get(url, timeout=(15, 120))
            ct = r.headers.get("Content-Type", "")
            log.info(f"  [Arrecadação] HTTP {r.status_code}  CT={ct[:60]}  size={len(r.content)}")
            if r.status_code != 200:
                log.warning(f"  [Arrecadação] Resposta: {r.text[:300]}")
                continue
            if "pdf" in ct.lower() or r.content[:4] == b"%PDF":
                empresa.pasta.mkdir(parents=True, exist_ok=True)
                destino.write_bytes(r.content)
                log.info(f"  Salvo: {nome_arquivo} ({len(r.content):,} bytes) — mês ref: {mes_ant}")
                if not cached_url:
                    cache[cache_key] = url_base
                    _salvar_cache(cache)
                    log.info(f"  Endpoint arrecadação cacheado: {url_base}")
                sess.headers.update(headers_orig)
                return destino
            log.warning(f"  [Arrecadação] Content-Type inesperado — primeiros bytes: {r.content[:80]}")
        except Exception as e:
            log.warning(f"  [Arrecadação] Erro: {e}")

    sess.headers.update(headers_orig)
    log.warning(f"  [{empresa.nome}] Nenhum endpoint funcionou para Extrato de Arrecadação")
    return None


# ── Processar empresa ──────────────────────────────────────────────────────────
def processar_empresa(empresa: Empresa, cache: dict) -> dict:
    """Faz login e baixa todos os relatórios da empresa. Retorna resumo."""
    resultado = {"ok": [], "falha": []}

    login_result = _login(empresa)
    if not login_result:
        resultado["falha"] = [r["descricao"] for r in RELATORIOS]
        return resultado

    sess, token_debitos = login_result
    empresa.pasta.mkdir(parents=True, exist_ok=True)

    for rel in RELATORIOS:
        log.info(f"[{empresa.nome}] {rel['descricao']}...")
        pdf = _baixar_relatorio(sess, empresa, rel, cache, token_debitos)
        if pdf:
            resultado["ok"].append(rel["descricao"])
        else:
            resultado["falha"].append(rel["descricao"])

    # Extrato de Arrecadação — sempre baixa o mês anterior ao período selecionado
    log.info(f"[{empresa.nome}] Extrato de Arrecadação (mês anterior)...")
    pdf = _baixar_extrato_arrecadacao(sess, empresa, cache)
    if pdf:
        resultado["ok"].append("Extrato de Arrecadação")
    else:
        resultado["falha"].append("Extrato de Arrecadação")

    return resultado


# ── Emissão de Parcelas ────────────────────────────────────────────────────────

def _ultimo_dia_mes() -> str:
    """Retorna YYYY-MM-DD do último dia do mês corrente."""
    hoje = date.today()
    ultimo = calendar.monthrange(hoje.year, hoje.month)[1]
    return f"{hoje.year}-{hoje.month:02d}-{ultimo:02d}"


def _login_parcelamento(empresa: Empresa) -> "tuple[requests.Session, str, int] | None":
    """
    Faz login e retorna (session, token, numeroPessoa) para o módulo parcelamento.

    O módulo /parcelamento/ usa o mesmo JWT do malhafiscal (mesma plataforma JHipster,
    mesmo domínio, token compartilhado). O endpoint próprio /parcelamento/api/authenticate
    retorna 500 — autenticamos via malhafiscal e usamos o token gerado.
    """
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Origin": BASE,
        "Referer": BASE + "/",
    })

    # O token do malhafiscal é aceito pelo módulo parcelamento (mesmo domínio/plataforma)
    token = _autenticar(
        sess, f"{BASE}/malhafiscal/api/authenticate",
        empresa.usuario, empresa.senha, "parcelamento"
    )
    if not token:
        return None

    sess.headers["Authorization"] = f"Bearer {token}"

    # Busca numeroPessoa (necessário como header X-pessoaDeTrabalho)
    try:
        r = sess.get(
            f"{BASE_PARCELAMENTO}/sfz-pessoa-api/api/pessoa",
            params={"numeroDocumento": empresa.usuario},
            timeout=(10, 30),
        )
        if r.status_code == 200:
            numero_pessoa = r.json().get("numeroPessoa")
            if numero_pessoa:
                return sess, token, int(numero_pessoa)
        log.warning(f"  [parcelamento] Não foi possível obter numeroPessoa: {r.status_code}")
    except Exception as e:
        log.error(f"  [parcelamento] Erro ao buscar pessoa: {e}")

    return None


def _nome_seguro(s: str, max_len: int = 40) -> str:
    """Remove caracteres inválidos para nome de arquivo e limita comprimento."""
    import re
    s = re.sub(r'[\\/:*?"<>|]', "", s).strip()
    return s[:max_len].strip()


def _emitir_parcelas_empresa(empresa: Empresa) -> dict:
    """
    Emite DARs de todos os parcelamentos ativos da empresa.
    Salva PDFs na pasta relatorio da empresa com nome:
      {Razao Social} - Parcelamento {id} - Parcela {atual:02d}-{total:02d}.pdf
    Retorna {"ok": [...], "falha": [...]}
    """
    resultado = {"ok": [], "falha": []}

    login = _login_parcelamento(empresa)
    if not login:
        log.error(f"[{empresa.nome}] Login parcelamento falhou")
        resultado["falha"].append("login")
        return resultado

    sess, token, numero_pessoa = login
    data_pagamento = _ultimo_dia_mes()

    # 1. Lista consolidações
    try:
        r = sess.post(
            f"{API_PARCELAMENTO}/consolidacao/consultar",
            json={},
            headers={**sess.headers, "X-pessoaDeTrabalho": str(numero_pessoa)},
            timeout=(10, 60),
        )
        if r.status_code != 200:
            log.error(f"  consultar consolidações: HTTP {r.status_code}")
            resultado["falha"].append("consultar")
            return resultado
        consolidacoes = r.json()
    except Exception as e:
        log.error(f"  Erro ao consultar consolidações: {e}")
        resultado["falha"].append("consultar")
        return resultado

    parcelados = [c for c in consolidacoes if c.get("situacao") == "PARCELADO"]
    log.info(f"[{empresa.nome}] {len(parcelados)} consolidação(ões) PARCELADO")

    # Pasta destino dos DARs: {empresa}/parcelamentos sefaz - procuradoria/
    pasta_dar = empresa.pasta / "parcelamentos sefaz - procuradoria"
    pasta_dar.mkdir(parents=True, exist_ok=True)

    razao = _nome_seguro(empresa.nome)

    pendentes = list(parcelados)   # lista de consolidações ainda não processadas
    MAX_TENTATIVAS_GLOBAL = 5      # voltas no loop de retry global
    tentativa_global = 0

    while pendentes and tentativa_global < MAX_TENTATIVAS_GLOBAL:
        tentativa_global += 1
        ainda_pendentes = []

        for cons in pendentes:
            id_cons         = cons["id"]
            id_parcelamento = cons.get("idParcelamento", id_cons)
            desc            = cons.get("descricaoFormaConsolidacao", str(id_cons))

            # Parcelamento com mensagem de bloqueio definida pelo portal
            msg_bloqueio = cons.get("mensagemNaoEmitirDAR")
            if msg_bloqueio:
                log.info(f"  {desc}: nao emitivel — {msg_bloqueio}")
                resultado["ok"].append(f"{desc} — PARCELAMENTO ENCERRADO / QUITADO")
                continue

            nome_pdf = f"{razao} - Parcelamento {id_parcelamento}.pdf"
            destino  = pasta_dar / nome_pdf

            if destino.exists():
                log.info(f"  Já existe: {nome_pdf}")
                resultado["ok"].append(f"{desc}")
                continue

            try:
                hdrs_parc = {**sess.headers, "X-pessoaDeTrabalho": str(numero_pessoa)}

                # Passo 1: Calcular Parcela (equivalente ao botão "Calcular Parcela" do portal)
                r_gerar = sess.get(
                    f"{API_PARCELAMENTO}/parcelamento/gerar/{id_cons}/1/{data_pagamento}",
                    headers=hdrs_parc,
                    timeout=(15, 90),
                )
                if r_gerar.status_code != 200:
                    msg = r_gerar.text[:100] if r_gerar.text else ""
                    log.warning(f"  calcular parcela {id_cons}: HTTP {r_gerar.status_code} — tentativa {tentativa_global} | {msg}")
                    ainda_pendentes.append(cons)
                    continue

                # Passo 2: Obter dados da parcela → numeroProcessamento e dataVencimento
                r2 = sess.get(
                    f"{API_PARCELAMENTO}/parcelamento/{id_cons}/1/{data_pagamento}",
                    headers=hdrs_parc,
                    timeout=(15, 90),
                )

                # Qualquer erro != 200 → recoloca na fila para retentar
                if r2.status_code != 200:
                    msg = r2.text[:100] if r2.text else ""
                    log.warning(f"  gerar parcela {id_cons}: HTTP {r2.status_code} — tentativa {tentativa_global} | {msg}")
                    ainda_pendentes.append(cons)
                    continue

                parc = r2.json()
                numero_proc     = parc["numeroProcessamento"]
                data_vencimento = parc["dataVencimentoMaximo"]

                # Passo 3: Emite DAR
                body_dar = {
                    "informacoesDar": [
                        {"numeroProcessamento": numero_proc, "dataVencimento": data_vencimento}
                    ]
                }
                r3 = sess.post(
                    f"{API_PARCELAMENTO}/dar/visualizar",
                    json=body_dar,
                    headers={**hdrs_parc, "Accept": "application/pdf, */*"},
                    timeout=(15, 120),
                )
                ct = r3.headers.get("Content-Type", "")

                if r3.status_code == 200 and ("pdf" in ct.lower() or r3.content[:4] == b"%PDF"):
                    destino.write_bytes(r3.content)
                    log.info(f"  DAR salvo: {nome_pdf} ({len(r3.content):,} bytes)")
                    resultado["ok"].append(f"{desc}")

                elif r3.status_code != 200:
                    log.warning(f"  DAR {id_cons}: HTTP {r3.status_code} — tentativa {tentativa_global}")
                    ainda_pendentes.append(cons)
                    continue

                else:
                    log.warning(f"  DAR {id_cons}: HTTP {r3.status_code} — tentativa {tentativa_global}")
                    ainda_pendentes.append(cons)

            except requests.exceptions.Timeout:
                log.warning(f"  Timeout em {id_cons} — tentativa {tentativa_global}")
                ainda_pendentes.append(cons)

            except Exception as e:
                log.error(f"  Erro no DAR {id_cons}: {e} — tentativa {tentativa_global}")
                ainda_pendentes.append(cons)

        pendentes = ainda_pendentes

        if pendentes and tentativa_global < MAX_TENTATIVAS_GLOBAL:
            espera = tentativa_global * 10
            log.info(f"  {len(pendentes)} pendente(s) — aguardando {espera}s antes de retentar...")
            time.sleep(espera)

    # O que ainda restou após todas as tentativas = falha definitiva
    for cons in pendentes:
        desc = cons.get("descricaoFormaConsolidacao", str(cons["id"]))
        resultado["falha"].append(f"{desc} (falha após {MAX_TENTATIVAS_GLOBAL} tentativas)")

    return resultado


# ── Impostos Sefaz (Cobrança DF-e) ───────────────────────────────────────────

def _login_cobranca(empresa: Empresa) -> "tuple[requests.Session, str] | None":
    """
    Faz login no módulo Cobrança DF-e e retorna (session, token).

    O módulo cobrancadfe aceita o token do malhafiscal (mesmo domínio JHipster).
    O endpoint próprio /cobrancadfe/api/authenticate frequentemente dá timeout,
    então autenticamos via malhafiscal como fallback.
    """
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Origin": BASE,
        "Referer": BASE + "/cobrancadfe/",
    })

    # Tenta auth do cobrancadfe primeiro, fallback para malhafiscal
    token = _autenticar(
        sess, API_COBRANCA_AUTH,
        empresa.usuario, empresa.senha, "cobrancadfe"
    )
    if not token:
        log.info("  Fallback: autenticando via malhafiscal...")
        token = _autenticar(
            sess, f"{BASE}/malhafiscal/api/authenticate",
            empresa.usuario, empresa.senha, "cobrancadfe-via-malhafiscal"
        )

    if not token:
        return None

    sess.headers["Authorization"] = f"Bearer {token}"
    return sess, token


def _listar_cobrancas(
    sess: requests.Session,
    cnpj: str,
    comp_ini_mmyyyy: str,
    comp_fim_mmyyyy: str,
    receitas: list[int],
) -> list[dict]:
    """
    Lista cobranças paginadas do módulo Cobrança DF-e.

    Parâmetros no formato exato da API do portal:
      - numeroDocumento: CNPJ
      - competenciaInicial / competenciaFinal: MM/YYYY
      - receitas: lista de códigos de receita
      - situacao: "Em Aberto"
      - parametrosPaginacaoConsultaObrigacosDTO: {pagina, tamanho}
    """
    body = {
        "numeroDocumento": cnpj,
        "competencia": "",
        "competenciaInicial": comp_ini_mmyyyy,
        "competenciaFinal": comp_fim_mmyyyy,
        "receitas": receitas,
        "situacao": "Em Aberto",
        "parametrosPaginacaoConsultaObrigacosDTO": {
            "pagina": 0,
            "tamanho": 500,
        },
    }

    log.info(f"  Body: {json.dumps(body, ensure_ascii=False)}")

    try:
        r = sess.post(API_COBRANCA_LISTA, json=body, timeout=(15, 90))
        log.info(f"  Resposta: HTTP {r.status_code} — {len(r.content)} bytes")

        if r.status_code != 200:
            log.warning(f"  Erro: {r.text[:300]}")
            return []

        data = r.json()

        # Logar estrutura da resposta
        if isinstance(data, dict):
            log.info(f"  Chaves: {list(data.keys())}")
            # A API pode retornar paginação Spring ou objeto com chaves variadas
            items = data.get("content", data.get("cobrancas", data.get("data", [])))
            if not items and "resumo" in data:
                # Resposta é uma cobrança única
                items = [data]
            if items:
                log.info(f"  {len(items)} cobrança(s) encontrada(s)")
                amostra = json.dumps(items[0], ensure_ascii=False, default=str)[:400]
                log.info(f"  Amostra: {amostra}")
            return items if items else []
        elif isinstance(data, list):
            log.info(f"  {len(data)} cobrança(s) encontrada(s)")
            if data:
                amostra = json.dumps(data[0], ensure_ascii=False, default=str)[:400]
                log.info(f"  Amostra: {amostra}")
            return data
        else:
            return []

    except requests.exceptions.Timeout:
        log.warning("  Timeout ao listar cobranças")
        return []
    except Exception as e:
        log.error(f"  Erro ao listar cobranças: {e}")
        return []


def _consolidar_e_emitir_dar(
    sess: requests.Session,
    cnpj: str,
    obrigacoes_ids: list[int],
) -> "bytes | None":
    """
    Fluxo completo para emitir DAR de impostos:
      1. POST consolidar-cobrancas  → envia IDs das obrigações → retorna consolidações
      2. POST dar/emitir/consolidacoes → envia IDs das consolidações → retorna PDF
    """
    # ── Passo 1: Consolidar cobranças ─────────────────────────────────────────
    body_consolidar = {
        "numeroDocumento": cnpj,
        "obrigacoes": obrigacoes_ids,
        "dataConsolidacao": None,
    }

    log.info(f"  Passo 1: Consolidando {len(obrigacoes_ids)} obrigação(ões)...")

    try:
        r1 = sess.post(API_CONSOLIDAR_DAR, json=body_consolidar, timeout=(15, 90))
        log.info(f"  Consolidar: HTTP {r1.status_code} — {len(r1.content)} bytes")

        if r1.status_code != 200:
            log.warning(f"  Erro consolidar: {r1.text[:300]}")
            return None

        consolidacoes = r1.json()
        if not consolidacoes:
            log.warning("  Consolidar retornou lista vazia")
            return None

        # Extrair IDs das consolidações (sequencialConsolidacao ou id)
        ids_consolidacao = []
        for c in consolidacoes:
            cid = c.get("sequencialConsolidacao") or c.get("id")
            if cid:
                ids_consolidacao.append(cid)

        if not ids_consolidacao:
            log.warning("  Nenhum ID de consolidação encontrado na resposta")
            log.info(f"  Resposta: {json.dumps(consolidacoes[:2], ensure_ascii=False, default=str)[:500]}")
            return None

        log.info(f"  {len(ids_consolidacao)} consolidação(ões): {ids_consolidacao}")

    except requests.exceptions.Timeout:
        log.warning("  Timeout ao consolidar")
        return None
    except Exception as e:
        log.error(f"  Erro ao consolidar: {e}")
        return None

    # ── Passo 2: Emitir DAR (PDF) ─────────────────────────────────────────────
    log.info(f"  Passo 2: Emitindo DAR...")

    for tentativa in range(1, 4):
        try:
            r2 = sess.post(
                API_EMITIR_DAR,
                json=ids_consolidacao,
                timeout=(15, 120),
            )
            ct = r2.headers.get("Content-Type", "")
            log.info(f"  Emitir DAR: HTTP {r2.status_code} — CT: {ct} — {len(r2.content)} bytes")

            if r2.status_code == 200 and ("pdf" in ct.lower() or r2.content[:4] == b"%PDF"):
                return r2.content

            log.warning(f"  Emitir DAR erro: {r2.text[:300]}")
            return None

        except requests.exceptions.Timeout:
            log.warning(f"  Timeout emitir DAR (tentativa {tentativa}/3)")
            if tentativa < 3:
                time.sleep(5)
        except Exception as e:
            log.error(f"  Erro emitir DAR: {e}")
            return None

    return None


def _gerar_relatorio_cobrancas(cobrancas: list[dict], label: str, empresa_nome: str, cnpj: str) -> str:
    """
    Gera relatório texto das cobranças listadas, igual à tabela do portal.
    Colunas: Nº Documento | Emissão | Vencimento | Competência | Tipo de Imposto | Valor | Situação
    """
    linhas = []
    linhas.append("=" * 120)
    linhas.append(f"  RELATÓRIO DE COBRANÇAS — {label}")
    linhas.append(f"  Empresa: {empresa_nome}  |  CNPJ: {cnpj}")
    linhas.append(f"  Data: {date.today().strftime('%d/%m/%Y')}")
    linhas.append("=" * 120)
    linhas.append("")

    hdr = f"{'Nº Documento':<18} {'Emissão':<12} {'Vencimento':<12} {'Competência':<13} {'Tipo de Imposto':<30} {'Valor':>12} {'Situação':<12}"
    linhas.append(hdr)
    linhas.append("-" * 120)

    total_valor = 0.0

    for cob in cobrancas:
        resumo = cob.get("resumo", cob)
        num_nfe = resumo.get("numNfe") or resumo.get("numeroDocumento") or resumo.get("numDocumento") or ""
        num_doc = f"NF-e {num_nfe}" if num_nfe else str(resumo.get("seqObrigacao", ""))
        emissao = resumo.get("dataEmissao") or resumo.get("emissao") or ""
        vencimento = resumo.get("dataVencimento") or resumo.get("vencimento") or ""
        competencia = resumo.get("competencia") or resumo.get("mesAnoCompetencia") or ""
        tipo_imposto = resumo.get("nomeReceita") or resumo.get("tipoImposto") or resumo.get("descricaoReceita") or ""
        situacao = resumo.get("descricaoSituacaoObrigacao") or resumo.get("situacao") or ""
        valor = resumo.get("valorPrincipal") or resumo.get("valor") or 0
        try:
            valor = float(valor)
        except (ValueError, TypeError):
            valor = 0.0
        total_valor += valor
        valor_fmt = f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        linha = f"{num_doc:<18} {str(emissao):<12} {str(vencimento):<12} {str(competencia):<13} {tipo_imposto:<30} {valor_fmt:>12} {situacao:<12}"
        linhas.append(linha)

    linhas.append("-" * 120)
    total_fmt = f"R$ {total_valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    linhas.append(f"{'TOTAL':<18} {'':<12} {'':<12} {'':<13} {f'{len(cobrancas)} cobrança(s)':<30} {total_fmt:>12}")
    linhas.append("=" * 120)
    linhas.append("")
    return "\n".join(linhas)


def _baixar_relatorio_cobrancas_pdf(
    sess: requests.Session,
    empresa: Empresa,
    comp_mmyyyy: str,
    receitas: list,
    label: str,
) -> "bytes | None":
    """
    Baixa o PDF do Relatório de Cobranças de Documentos Fiscais Eletrônicos
    para um grupo de receitas — idêntico ao botão 'Imprimir relatório completo'
    do portal Cobrança DF-e.

    Body exato capturado via DevTools:
      { numeroDocumento, competencia, competenciaInicial, competenciaFinal,
        receitas, situacao }
    """
    # Body exato que o portal envia (capturado via DevTools)
    body = {
        "numeroDocumento": empresa.cnpj,
        "competencia": "",
        "competenciaInicial": comp_mmyyyy,
        "competenciaFinal": comp_mmyyyy,
        "receitas": receitas,
        "situacao": "Em Aberto",
    }

    url = API_COBRANCA_RELATORIO_CANDIDATOS[0]  # gerar-relatorio-cobrancas

    accept_orig = sess.headers.get("Accept", "application/json, text/plain, */*")
    sess.headers["Accept"] = "application/pdf, application/octet-stream, */*"

    try:
        for tentativa in range(1, 4):
            try:
                r = sess.post(url, json=body, timeout=(15, 120))
                ct = r.headers.get("Content-Type", "")
                log.info(
                    f"  [RelPDF-{label}] tentativa {tentativa} → "
                    f"HTTP {r.status_code} CT={ct} {len(r.content)}b"
                )
                if r.status_code == 200 and (
                    "pdf" in ct.lower() or r.content[:4] == b"%PDF"
                ):
                    return r.content
                if r.status_code == 200:
                    log.info(f"  [RelPDF-{label}] 200 mas não PDF: {r.content[:120]}")
                    return None
                if r.status_code in (401, 403):
                    log.warning(f"  [RelPDF-{label}] Sem permissão ({r.status_code})")
                    return None
                time.sleep(3)
            except requests.exceptions.Timeout:
                log.warning(f"  [RelPDF-{label}] Timeout (tentativa {tentativa}/3)")
                if tentativa < 3:
                    time.sleep(5)
            except Exception as e:
                log.warning(f"  [RelPDF-{label}] Erro: {e}")
                return None
    finally:
        sess.headers["Accept"] = accept_orig

    log.warning(f"  [RelPDF-{label}] Não foi possível baixar o relatório PDF")
    return None


def _baixar_impostos_empresa(empresa: Empresa) -> dict:
    """
    Baixa DARs de impostos (DIFAL, ANTECIPADO, ST, ST EMITENTE)
    do módulo Cobrança DF-e da SEFAZ para a empresa.

    Para cada grupo de impostos em GRUPOS_IMPOSTOS:
      1. Lista cobranças com filtro de receitas do grupo
      2. Consolida e emite DAR em PDF

    Filtros:
      - Competência: mês selecionado pelo usuário
      - Situação: Em Aberto
    """
    resultado = {"ok": [], "falha": []}

    login = _login_cobranca(empresa)
    if not login:
        log.error(f"[{empresa.nome}] Login cobrancadfe falhou")
        resultado["falha"].append("login cobrancadfe")
        return resultado

    sess, token = login

    # Competência: mês selecionado pelo usuário
    comp_ini = f"{config.MES_NUM:02d}/{config.ANO}"
    comp_fim = f"{config.MES_NUM:02d}/{config.ANO}"

    log.info(f"[{empresa.nome}] Buscando cobranças DF-e...")
    log.info(f"  Competência: {comp_ini} a {comp_fim}")

    # Pasta destino: downloads/{mes}/{empresa}/impostos sefaz/
    mes_str = config.MES_STR
    nome_limpo = empresa.nome.replace("/", "-").replace("\\", "-").strip()
    pasta_empresa = f"{nome_limpo} - {empresa.cnpj}"
    pasta = config.DOWNLOAD_DIR / pasta_empresa / "impostos sefaz"
    pasta.mkdir(parents=True, exist_ok=True)

    # Rastrear obrigações já processadas para não duplicar entre grupos
    obrigacoes_ja_processadas = set()

    # Para cada aba do portal:
    #   1. Buscar cobranças de CADA receita separadamente
    #   2. Filtrar detalhes pela receita correta e excluir já processados
    #   3. Consolidar e emitir UM ÚNICO DAR
    for grupo in GRUPOS_IMPOSTOS:
        label = grupo["label"]
        receitas = grupo["receitas"]
        nome_arquivo = grupo["arquivo"].format(mes=mes_str)
        destino = pasta / nome_arquivo

        if destino.exists():
            log.info(f"  Já existe: {nome_arquivo}")
            resultado["ok"].append(f"{label} (já existia)")
            continue

        log.info(f"  {label} — receitas {receitas}")

        # Passo 1: Buscar cobranças de todas as receitas do grupo
        todas_cobrancas = []
        for rec in receitas:
            cobs = _listar_cobrancas(sess, empresa.cnpj, comp_ini, comp_fim, [rec])
            if cobs:
                log.info(f"    Receita {rec}: {len(cobs)} cobrança(s)")
                todas_cobrancas.extend(cobs)

        if not todas_cobrancas:
            log.info(f"  {label}: nenhuma cobrança em aberto")
            resultado["ok"].append(f"{label} — sem cobranças")
            continue

        # Passo 2: Extrair seqObrigacao dos DETALHES, filtrando APENAS
        # as receitas que pertencem a este grupo e excluindo já processados.
        receitas_set = set(receitas)
        obrigacoes_ids = []
        for cob in todas_cobrancas:
            detalhes = cob.get("detalhes", [])
            if detalhes:
                for d in detalhes:
                    seq_receita = d.get("seqReceita")
                    oid = d.get("seqObrigacao")
                    if (oid and seq_receita in receitas_set
                            and oid not in obrigacoes_ids
                            and oid not in obrigacoes_ja_processadas):
                        obrigacoes_ids.append(oid)
            else:
                resumo = cob.get("resumo", cob)
                oid = resumo.get("seqObrigacao") or resumo.get("id")
                if (oid and oid not in obrigacoes_ids
                        and oid not in obrigacoes_ja_processadas):
                    obrigacoes_ids.append(oid)

        if not obrigacoes_ids:
            log.info(f"  {label}: nenhuma obrigação pendente")
            resultado["ok"].append(f"{label} — sem cobranças")
            continue

        log.info(f"  {len(obrigacoes_ids)} obrigação(ões) para consolidar")

        # Marcar como processadas
        obrigacoes_ja_processadas.update(obrigacoes_ids)

        # Gerar relatório (só quando tem cobranças)
        nome_relatorio = nome_arquivo.replace(".pdf", "-relatorio.txt")
        destino_relatorio = pasta / nome_relatorio
        if not destino_relatorio.exists():
            txt = _gerar_relatorio_cobrancas(todas_cobrancas, label, empresa.nome, empresa.cnpj)
            destino_relatorio.write_text(txt, encoding="utf-8")
            log.info(f"  Relatório salvo: {nome_relatorio}")

        # Passo 3: Consolidar TODAS as obrigações de uma vez
        body_consolidar = {
            "numeroDocumento": empresa.cnpj,
            "obrigacoes": obrigacoes_ids,
            "dataConsolidacao": None,
        }
        try:
            r1 = sess.post(API_CONSOLIDAR_DAR, json=body_consolidar, timeout=(15, 90))
            log.info(f"  Consolidar: HTTP {r1.status_code} — {len(r1.content)} bytes")

            if r1.status_code != 200:
                log.warning(f"  Erro consolidar: {r1.text[:300]}")
                resultado["falha"].append(f"{label}")
                continue

            consolidacoes = r1.json()
            ids_consolidacao = []
            for c in consolidacoes:
                cid = c.get("sequencialConsolidacao") or c.get("id")
                desc = c.get("descricaoReceita", "")
                valor = c.get("total", 0)
                if cid:
                    ids_consolidacao.append(cid)
                    log.info(f"    Consolidação {cid}: {desc} — R$ {valor}")

        except Exception as e:
            log.error(f"  Erro consolidar: {e}")
            resultado["falha"].append(f"{label}")
            continue

        if not ids_consolidacao:
            log.warning(f"  {label}: nenhuma consolidação gerada")
            resultado["falha"].append(f"{label}")
            continue

        # Passo 4: Emitir UM ÚNICO DAR com todas as consolidações juntas
        log.info(f"  Emitindo DAR com {len(ids_consolidacao)} consolidação(ões)")
        dar_ok = False
        try:
            r2 = sess.post(API_EMITIR_DAR, json=ids_consolidacao, timeout=(15, 120))
            ct = r2.headers.get("Content-Type", "")
            if r2.status_code == 200 and ("pdf" in ct.lower() or r2.content[:4] == b"%PDF"):
                destino.write_bytes(r2.content)
                log.info(f"  Salvo: {nome_arquivo} ({len(r2.content):,} bytes)")
                resultado["ok"].append(f"{label}")
                dar_ok = True
            else:
                log.warning(f"  Emitir DAR: HTTP {r2.status_code} — {r2.text[:200]}")
                resultado["falha"].append(f"{label}")
        except Exception as e:
            log.error(f"  Erro emitir DAR: {e}")
            resultado["falha"].append(f"{label}")

        # Passo 5: Relatório PDF do grupo (idêntico ao "Imprimir relatório completo")
        nome_rel_pdf = nome_arquivo.replace("dar-", "relatorio-")
        destino_rel_pdf = pasta / nome_rel_pdf
        if destino_rel_pdf.exists():
            log.info(f"  Relatório PDF já existe: {nome_rel_pdf}")
        else:
            log.info(f"  Baixando relatório PDF: {nome_rel_pdf}...")
            pdf_bytes = _baixar_relatorio_cobrancas_pdf(
                sess, empresa, comp_ini, receitas, label
            )
            if pdf_bytes:
                destino_rel_pdf.write_bytes(pdf_bytes)
                log.info(f"  Relatório PDF salvo: {nome_rel_pdf} ({len(pdf_bytes):,} bytes)")
                resultado["ok"].append(f"Relatório {label}")
            else:
                log.warning(f"  Relatório PDF não disponível para {label}")

    return resultado


# ── MAIN ───────────────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]

    if "--mes" in args:
        idx = args.index("--mes")
        os.environ["MES"] = args[idx + 1]
        importlib.reload(config)

    filtro_cnpj = None
    if "--cnpj" in args:
        idx = args.index("--cnpj")
        filtro_cnpj = args[idx + 1]

    modo = "relatorios"
    if "--modo" in args:
        idx = args.index("--modo")
        modo = args[idx + 1]

    if "--destino" in args:
        idx = args.index("--destino")
        os.environ["DOWNLOAD_DESTINO"] = args[idx + 1]
        importlib.reload(config)

    _configurar_log()

    # Emitir parcelas e impostos sempre usam o mês corrente
    if modo in ("emitir-parcelas", "impostos") and "--mes" not in args:
        os.environ["MES"] = date.today().strftime("%Y-%m")
        importlib.reload(config)

    try:
        todas = config.carregar_empresas()
    except RuntimeError as e:
        print(f"\nERRO: {e}\n")
        sys.exit(1)

    empresas = [e for e in todas if e.cnpj == filtro_cnpj] if filtro_cnpj else todas

    if not empresas:
        print(f"\nERRO: Nenhuma empresa encontrada.\n")
        sys.exit(1)

    # ── Modo: Emitir Parcelas ──────────────────────────────────────────────────
    if modo == "emitir-parcelas":
        print("=" * 65)
        print("  AGENTE LEXCON  |  EMISSAO DE PARCELAS")
        print(f"  Data pgto: {_ultimo_dia_mes()}")
        print(f"  Empresas : {len(empresas)}")
        print("=" * 65)

        resumo = {"ok": 0, "falha": 0}
        for i, empresa in enumerate(empresas, 1):
            print(f"\n[{i}/{len(empresas)}] {empresa.nome}  (CNPJ: {empresa.cnpj})")
            res = _emitir_parcelas_empresa(empresa)
            for desc in res["ok"]:
                print(f"  OK    {desc}")
                resumo["ok"] += 1
            for desc in res["falha"]:
                print(f"  FALHA {desc}")
                resumo["falha"] += 1

        total = resumo["ok"] + resumo["falha"]
        print("\n" + "=" * 65)
        print(f"  DARs emitidos : {resumo['ok']}/{total}")
        print(f"  Falhas        : {resumo['falha']}/{total}")
        print("=" * 65)
        return

    # ── Modo: Impostos Sefaz (Cobrança DF-e) ─────────────────────────────────
    if modo == "impostos":
        hoje = date.today()
        print("=" * 65)
        print("  AGENTE LEXCON  |  IMPOSTOS SEFAZ — Cobrança DF-e")
        print(f"  Competência : {hoje.year}")
        print(f"  Vencimento  : {hoje.month:02d}/{hoje.year}")
        print(f"  Empresas    : {len(empresas)}")
        print("=" * 65)

        resumo = {"ok": 0, "falha": 0}
        for i, empresa in enumerate(empresas, 1):
            print(f"\n[{i}/{len(empresas)}] {empresa.nome}  (CNPJ: {empresa.cnpj})")
            res = _baixar_impostos_empresa(empresa)
            for desc in res["ok"]:
                print(f"  OK    {desc}")
                resumo["ok"] += 1
            for desc in res["falha"]:
                print(f"  FALHA {desc}")
                resumo["falha"] += 1

        total = resumo["ok"] + resumo["falha"]
        print("\n" + "=" * 65)
        print(f"  Impostos OK : {resumo['ok']}/{total}")
        print(f"  Falhas      : {resumo['falha']}/{total}")
        print("=" * 65)
        return

    # ── Modo: Relatórios (padrão) ──────────────────────────────────────────────
    print("=" * 65)
    print("  AGENTE LEXCON  |  SEFAZ ALAGOAS — Portal do Contribuinte")
    print(f"  Período  : {config.DATA_INICIAL} a {config.DATA_FINAL}")
    print(f"  Empresas : {len(empresas)}")
    print(f"  Saída    : {config.DOWNLOAD_DIR}")
    print("=" * 65)

    cache = _carregar_cache()
    resumo_geral = {"ok": 0, "falha": 0}

    for i, empresa in enumerate(empresas, 1):
        print(f"\n[{i}/{len(empresas)}] {empresa.nome}  (CNPJ: {empresa.cnpj})")
        resultado = processar_empresa(empresa, cache)

        for desc in resultado["ok"]:
            print(f"  OK    {desc}")
            resumo_geral["ok"] += 1
        for desc in resultado["falha"]:
            print(f"  FALHA {desc}")
            resumo_geral["falha"] += 1

    total = resumo_geral["ok"] + resumo_geral["falha"]
    print("\n" + "=" * 65)
    print(f"  Relatórios com sucesso : {resumo_geral['ok']}/{total}")
    print(f"  Relatórios com falha   : {resumo_geral['falha']}/{total}")
    print(f"  Arquivos em            : {config.DOWNLOAD_DIR}")
    print("=" * 65)


if __name__ == "__main__":
    main()

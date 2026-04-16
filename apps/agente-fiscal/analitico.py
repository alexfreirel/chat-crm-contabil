"""
analitico.py  —  Analítico de Empresas
Lê os PDFs baixados e extrai resumo por empresa.
"""

import re
from pathlib import Path


def _texto_pdf(caminho: Path) -> str:
    """Extrai todo o texto de um PDF com pdfplumber."""
    try:
        import pdfplumber
        with pdfplumber.open(str(caminho)) as pdf:
            return "\n".join(pg.extract_text() or "" for pg in pdf.pages)
    except Exception as e:
        return f"__ERRO__: {e}"


# ── Parser: Notas Fiscais de Entrada ──────────────────────────────────────────

def analisar_notas_entrada(pdf: Path) -> dict:
    """
    Retorna:
      qtd         int | None
      valor_total str | None
      erro        str | None
    """
    texto = _texto_pdf(pdf)
    if texto.startswith("__ERRO__"):
        return {"qtd": None, "valor_total": None, "erro": texto}

    # "Quantidade de Notas: 3 11,987.31"
    m = re.search(r"Quantidade de Notas[:\s]+(\d+)\s+([\d,\.]+)", texto, re.IGNORECASE)
    if m:
        return {"qtd": int(m.group(1)), "valor_total": m.group(2), "erro": None}

    # Sem essa linha → sem notas
    return {"qtd": 0, "valor_total": "0,00", "erro": None}


# ── Parser: Extrato de Débito do Contribuinte ─────────────────────────────────

def analisar_extrato_debito(pdf: Path) -> dict:
    """
    Retorna:
      nada_consta        bool
      denuncia_espontanea list[dict]  cada dict: {tipo, numero, principal, multa, situacao}
      erro               str | None
    """
    texto = _texto_pdf(pdf)
    if texto.startswith("__ERRO__"):
        return {"nada_consta": False, "denuncia_espontanea": [], "erro": texto}

    if re.search(r"NADA CONSTA", texto, re.IGNORECASE):
        return {"nada_consta": True, "denuncia_espontanea": [], "erro": None}

    denuncias = []
    linhas = texto.splitlines()

    entrada_atual = None
    for linha in linhas:
        linha_strip = linha.strip()
        linha_lower = linha_strip.lower()

        # Início de bloco: "ICMS - Denuncia Espontanea: 1158664"
        # Pré-filtro evita backtracking catastrófico em linhas longas
        if "denuncia espontanea" in linha_lower:
            m_inicio = re.match(
                r"(\S+(?:\s+\S+){0,4}?)\s*-\s*Denuncia Espontanea[:\s]+(\d+)",
                linha_strip, re.IGNORECASE
            )
            if m_inicio:
                if entrada_atual:
                    denuncias.append(entrada_atual)
                entrada_atual = {
                    "tipo":      m_inicio.group(1).strip(),
                    "numero":    m_inicio.group(2).strip(),
                    "principal": None,
                    "multa":     None,
                    "situacao":  None,
                }
                continue

        if entrada_atual is None:
            continue

        # "Principal: 4,324.93 Multa: 173.03 Origem: ICMS"
        if entrada_atual["principal"] is None and "principal" in linha_lower:
            m_val = re.search(
                r"Principal[:\s]+([\d,\.]+)\s+Multa[:\s]+([\d,\.]+)",
                linha_strip, re.IGNORECASE
            )
            if m_val:
                entrada_atual["principal"] = m_val.group(1)
                entrada_atual["multa"]     = m_val.group(2)
                continue

        # "Situação: PARCELADO - REGULAR  Débito conferido: NÃO"
        # Linha tem "Situa" mas NÃO é cabeçalho de tabela ("Tipo Processo Situação")
        if (entrada_atual["situacao"] is None
                and "situa" in linha_lower
                and ":" in linha_strip
                and "principal" not in linha_lower):
            m_sit = re.search(r"Situa\S*\s*:\s*([A-Z][A-Z0-9 \-]{2,30})", linha_strip)
            if m_sit:
                situacao_raw = m_sit.group(1).strip()
                # Remove parte após duplo espaço
                situacao_raw = re.split(r"\s{2,}", situacao_raw)[0]
                # Remove letra solta no final ("D" de "Débito" truncado por char especial)
                situacao_raw = re.sub(r'\s+[A-Z]$', '', situacao_raw).strip()
                entrada_atual["situacao"] = situacao_raw
                continue

    if entrada_atual:
        denuncias.append(entrada_atual)

    return {"nada_consta": False, "denuncia_espontanea": denuncias, "erro": None}


# ── Parser: Malha Fiscal (MFIC) ───────────────────────────────────────────────

def analisar_mfic(pdf: Path) -> dict:
    """
    Lê qualquer PDF de Consolidação de Malhas Fiscais.
    Retorna dict com lista de secoes:
      [{"codigo": "MFIC07", "descricao": "...", "linhas": ["2025 ...", ...]}]
    """
    texto = _texto_pdf(pdf)
    if texto.startswith("__ERRO__"):
        return {"secoes": [], "erro": texto}

    secoes = []
    secao_atual = None
    cabecalho_visto = False   # pula a linha de colunas (Ano Qtd. Meses ...)

    for linha in texto.splitlines():
        ls = linha.strip()
        if not ls:
            continue

        # Linha de cabeçalho de seção: "MFIC07 - Impostos Declarados X Arrecação"
        m = re.match(r"(MFIC\d+)\s*-\s*(.+)", ls, re.IGNORECASE)
        if m:
            if secao_atual:
                secoes.append(secao_atual)
            secao_atual = {
                "codigo":    m.group(1).upper(),
                "descricao": m.group(2).strip(),
                "linhas":    [],
            }
            cabecalho_visto = False
            continue

        if secao_atual is None:
            continue

        # Pula linha de colunas (começa com "Ano " ou "Ano\t")
        if not cabecalho_visto and re.match(r"Ano\b", ls, re.IGNORECASE):
            cabecalho_visto = True
            continue

        # Linha de dados: começa com ano (4 dígitos) ou "$"
        if re.match(r"\d{4}\b|^\$", ls):
            secao_atual["linhas"].append(ls)

    if secao_atual:
        secoes.append(secao_atual)

    return {"secoes": secoes, "erro": None}


# ── Exibição do Analítico ─────────────────────────────────────────────────────

def _sep(char="-", n=65):
    print("  " + char * n)


def _fmt_valor(v: str) -> str:
    """Formata valor numérico para exibição."""
    return f"R$ {v}" if v else "-"


def _ultimo_valor_zero(linha: str) -> bool:
    """Retorna True se o último valor $ da linha for $ 0.00."""
    valores = re.findall(r"\$\s*([\d,]+\.\d+)", linha)
    if not valores:
        return False
    ultimo = valores[-1].replace(",", "")
    try:
        return float(ultimo) == 0.0
    except ValueError:
        return False


def _filtrar_linhas_mfic(linhas: list) -> list:
    """Remove linhas onde o último valor $ é zero."""
    return [l for l in linhas if not _ultimo_valor_zero(l)]


def exibir_parcelamentos(mes: str, download_dir: Path, destino=None):
    """
    Varre as pastas de empresa e exibe apenas as que possuem
    débitos parcelados no Extrato de Débito do Contribuinte.
    """
    import sys
    _out = destino if destino is not None else sys.stdout

    def _p(*args, **kwargs):
        kwargs.setdefault("file", _out)
        print(*args, **kwargs)

    def _sep(char="-", n=65):
        _p("  " + char * n)

    _p(f"\n  PARCELAMENTO SEFAZ/PROCURADORIA  -  Periodo: {mes}")
    _sep("=", 65)

    pastas = sorted(
        p for p in download_dir.iterdir()
        if p.is_dir() and (p / "relatorio").is_dir()
    )

    if not pastas:
        _p("\n  Nenhuma pasta de relatorio encontrada para este periodo.")
        return

    encontrou = False
    for pasta in pastas:
        nome_pasta = pasta.name
        rel = pasta / "relatorio"
        pdf_ext = rel / f"extrato-debito-contribuinte-{mes}.pdf"

        if not pdf_ext.exists():
            continue

        r = analisar_extrato_debito(pdf_ext)
        if r["erro"] or r["nada_consta"] or not r["denuncia_espontanea"]:
            continue

        # Filtra apenas entradas com situação de parcelamento
        parcelados = [
            d for d in r["denuncia_espontanea"]
            if d["situacao"] and "PARCELAD" in d["situacao"].upper()
        ]

        if not parcelados:
            continue

        encontrou = True
        _p(f"\n  >> {nome_pasta}")
        _sep()
        for d in parcelados:
            tipo_num  = f"{d['tipo']} n {d['numero']}"
            principal = _fmt_valor(d["principal"])
            multa     = _fmt_valor(d["multa"])
            situacao  = d["situacao"] or "-"
            _p(f"    * {tipo_num}")
            _p(f"      Principal : {principal}   Multa: {multa}")
            _p(f"      Situacao  : {situacao}")

    if not encontrou:
        _p("\n  Nenhuma empresa com parcelamento encontrada para este periodo.")

    _sep("=", 65)


def exibir_analitico(mes: str, download_dir: Path, destino=None, cnpj_filtro: str = ""):
    """
    Varre todas as pastas de empresa dentro de download_dir,
    lê os PDFs e exibe o analítico formatado.
    Se destino for um objeto file-like, escreve lá em vez do stdout.
    """
    import sys
    _out = destino if destino is not None else sys.stdout

    def _p(*args, **kwargs):
        kwargs.setdefault("file", _out)
        print(*args, **kwargs)

    def _sep2(char="-", n=65):
        _p("  " + char * n)

    _p(f"\n  ANALITICO EMPRESAS  -  Periodo: {mes}")
    _sep2("=", 65)

    # Localiza pastas de empresa (têm subpasta 'relatorio')
    pastas = sorted(
        p for p in download_dir.iterdir()
        if p.is_dir() and (p / "relatorio").is_dir()
        and (not cnpj_filtro or cnpj_filtro in p.name)
    )

    if not pastas:
        _p("\n  Nenhuma pasta de relatorio encontrada para este periodo.")
        _p(f"  Caminho verificado: {download_dir}")
        return

    for pasta in pastas:
        nome_pasta = pasta.name           # "JANIELY M DOS SANTOS - 36834654000168"
        rel = pasta / "relatorio"

        _p(f"\n  >> {nome_pasta}")
        _sep2()

        # ── Notas Fiscais de Entrada ──────────────────────────────────────────
        pdf_nfe = rel / f"notas-fiscais-entrada-{mes}.pdf"
        _p(f"  {'Notas Fiscais de Entrada':<45}", end=" ")

        if not pdf_nfe.exists():
            _p("PDF nao encontrado")
        else:
            r = analisar_notas_entrada(pdf_nfe)
            if r["erro"]:
                _p(f"ERRO: {r['erro']}")
            else:
                total = f"  |  Total: {_fmt_valor(r['valor_total'])}" if r["qtd"] else ""
                _p(f"{r['qtd']} nota(s){total}")

        # ── Extrato de Débito do Contribuinte ─────────────────────────────────
        pdf_ext = rel / f"extrato-debito-contribuinte-{mes}.pdf"
        _p(f"  {'Extrato de Debito do Contribuinte':<45}", end=" ")

        if not pdf_ext.exists():
            _p("PDF nao encontrado")
        else:
            r = analisar_extrato_debito(pdf_ext)
            if r["erro"]:
                _p(f"ERRO: {r['erro']}")
            elif r["nada_consta"]:
                _p("NADA CONSTA")
            else:
                qtd_den = len(r["denuncia_espontanea"])
                _p(f"{qtd_den} Denuncia(s) Espontanea(s)")
                for d in r["denuncia_espontanea"]:
                    tipo_num  = f"{d['tipo']} n {d['numero']}"
                    principal = _fmt_valor(d["principal"])
                    multa     = _fmt_valor(d["multa"])
                    situacao  = d["situacao"] or "-"
                    _p(f"      * {tipo_num:<32}  Principal: {principal:<14}  Multa: {multa:<10}  [{situacao}]")

        # ── Malhas Fiscais ────────────────────────────────────────────────────
        mfic_pdfs = [
            ("Consolidacao MFIC01/02/03/04/06", f"consolidacao-mfic01-02-03-04-06-{mes}.pdf"),
            ("Consolidacao MFIC05",              f"consolidacao-mfic05-{mes}.pdf"),
            ("Consolidacao MFIC07/11/13",        f"consolidacao-mfic07-11-13-{mes}.pdf"),
        ]
        for label, nome_pdf in mfic_pdfs:
            pdf_mfic = rel / nome_pdf
            _p(f"  {label:<45}", end=" ")

            if not pdf_mfic.exists():
                _p("PDF nao encontrado")
                continue

            r = analisar_mfic(pdf_mfic)
            if r["erro"]:
                _p(f"ERRO: {r['erro']}")
                continue

            # Aplica filtro: só exibe linhas onde último valor $ != 0.00
            secoes_filtradas = []
            for s in r["secoes"]:
                linhas_ok = _filtrar_linhas_mfic(s["linhas"])
                secoes_filtradas.append({**s, "linhas_ok": linhas_ok})

            com_dados = [s for s in secoes_filtradas if s["linhas_ok"]]

            if not com_dados:
                _p("NADA CONSTA")
            else:
                _p(f"{len(com_dados)} secao(oes) com ocorrencias")
                for s in secoes_filtradas:
                    cod  = s["codigo"]
                    desc = s["descricao"][:42]
                    if s["linhas_ok"]:
                        _p(f"      * {cod} - {desc}")
                        for linha in s["linhas_ok"]:
                            _p(f"            {linha}")
                    else:
                        _p(f"      - {cod:<8}  NADA CONSTA")

    _sep2("=", 65)

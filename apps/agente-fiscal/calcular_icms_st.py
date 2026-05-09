"""
Agente de Cálculo de ICMS Substituição Tributária - Alagoas
Base legal: Decreto Estadual nº 90.309, de 27/03/2023 (retificado 26/05/2023),
            com MVAs ajustadas atualizadas em 01/05/2026.
Uso: py calcular_icms_st.py <arquivo.xml> [<arquivo2.xml> ...]
     py calcular_icms_st.py --pasta <diretorio_com_xmls>
"""

import xml.etree.ElementTree as ET
import json
import sys
import os
import re
import glob
import io
import warnings
from pathlib import Path
from datetime import datetime


warnings.filterwarnings("ignore", category=DeprecationWarning)

# ─── Constantes fiscais de Alagoas ──────────────────────────────────────────

ALIQUOTA_INTERNA_AL = {
    # alíquota padrão 20,5% (atualizada conforme legislação vigente)
    "default": 20.5,
    # 25% – bebidas alcoólicas, fumo, perfumes, cosméticos, armas, veículos de luxo
    "25": ["22030000", "22041000", "22042100", "22042900", "22043000",
           "22051000", "22059000", "22060000", "22071010", "22071090",
           "24021000", "24022000", "24029000", "24031100", "24031900",
           "33030010", "33030020", "33030090", "33041000", "33042000",
           "87031000", "87032110", "87032190"],
    # 12% – alguns alimentos e produtos da cesta básica (check RICMS/AL art. 26)
    "12": [],
}

# Alíquotas interestaduais por UF de origem → AL (nordeste)
ALIQUOTA_INTERESTADUAL = {
    # Sul e Sudeste → Nordeste: 7%
    "SP": 7.0, "RJ": 7.0, "MG": 7.0, "ES": 7.0,
    "PR": 7.0, "SC": 7.0, "RS": 7.0,
    # Norte, Centro-Oeste → AL: 7% também
    "AC": 7.0, "AM": 7.0, "AP": 7.0, "PA": 7.0, "RO": 7.0, "RR": 7.0, "TO": 7.0,
    "GO": 7.0, "MT": 7.0, "MS": 7.0, "DF": 7.0,
    # Nordeste → AL: 12%
    "BA": 12.0, "CE": 12.0, "MA": 12.0, "PB": 12.0, "PE": 12.0,
    "PI": 12.0, "RN": 12.0, "SE": 12.0,
    # Operações internas (AL → AL): 0 ST pela substituição pelo substituto
    "AL": 0.0,
    # default
    "default": 7.0,
}

NAMESPACE = {"nfe": "http://www.portalfiscal.inf.br/nfe"}

# ─── Carrega base NCM/MVA ────────────────────────────────────────────────────

def carregar_base_ncm() -> dict:
    base_path = Path(__file__).parent / "ncm_mva_alagoas.json"
    if not base_path.exists():
        print(f"[ERRO] Base NCM não encontrada: {base_path}")
        print("Execute primeiro a extração do PDF.")
        sys.exit(1)

    with open(base_path, encoding="utf-8") as f:
        registros = json.load(f)

    # Base: Decreto 90.309/2023 — 1527 NCMs com MVAs ajustadas (atualizado 09/05/2026)
    # Índice: ncm → lista de registros (pode haver NCM em múltiplas categorias)
    idx: dict[str, list] = {}
    for r in registros:
        ncm = r.get("ncm", "").strip()
        if ncm:
            idx.setdefault(ncm, []).append(r)
    return idx


def buscar_ncm(idx: dict, ncm_raw: str) -> dict | None:
    """
    Busca o registro de ST para um NCM (com ou sem pontos).
    Estratégia:
      1. Correspondência exata (8 dígitos)
      2. NCM da NF-e começa com chave da base (chave é prefixo – ex.: '27101922' bate em '2710192')
      3. Chave da base começa com NCM (NCM da NF-e é prefixo genérico)
         – só aceito se o NCM da NF-e tiver < 6 dígitos para evitar falsos positivos
    """
    ncm = re.sub(r"[^0-9]", "", ncm_raw)
    if not ncm:
        return None
    # 1. Exata
    if ncm in idx:
        return idx[ncm][0]
    # 2. NCM da NF-e começa com uma chave mais curta da base (chave é prefixo parcial)
    #    Exige chave com pelo menos 4 dígitos para evitar matches genéricos de 2-3 dígitos
    best = None
    best_len = 0
    for key in idx:
        if len(key) >= 4 and ncm.startswith(key) and len(key) > best_len:
            best = idx[key][0]
            best_len = len(key)
    if best:
        return best
    # 3. Chave da base começa com NCM (NCM genérico da NF-e) – só aceita NCM curto (< 6 dígitos)
    if len(ncm) < 6:
        for key in idx:
            if key.startswith(ncm):
                return idx[key][0]
    return None


# ─── Helpers XML ────────────────────────────────────────────────────────────

def txt(elem, tag: str) -> str:
    ns = NAMESPACE["nfe"]
    child = elem.find(f"{{{ns}}}{tag}")
    return child.text.strip() if child is not None and child.text else ""


def num(elem, tag: str) -> float:
    v = txt(elem, tag)
    return float(v.replace(",", ".")) if v else 0.0


# ─── Cálculo de ICMS ST ─────────────────────────────────────────────────────

def aliquota_interna_al(ncm: str) -> float:
    ncm_clean = re.sub(r"[^0-9]", "", ncm)
    for pref in ALIQUOTA_INTERNA_AL["25"]:
        if ncm_clean.startswith(re.sub(r"[^0-9]", "", pref)):
            return 25.0
    for pref in ALIQUOTA_INTERNA_AL["12"]:
        if ncm_clean.startswith(re.sub(r"[^0-9]", "", pref)):
            return 12.0
    return ALIQUOTA_INTERNA_AL["default"]


def escolher_mva(registro: dict, aliq_interestadual: float, aliq_interna: float = None) -> float | None:
    """
    Calcula o MVA ajustado pela fórmula do Convênio ICMS 13/2006:
        MVA_aj = {[(1 + MVA_orig/100) × (1 - aliq_inter/100) / (1 - aliq_int/100)] - 1} × 100
    Usa aliq_interna padrão de AL quando não informada.
    Para operações internas (aliq_inter == 0) retorna o MVA original.
    """
    mva_orig = registro.get("mva_interno")
    if mva_orig is None:
        return None

    # Operação interna — sem ajuste
    if aliq_interestadual == 0:
        return mva_orig

    aliq_int = aliq_interna if aliq_interna is not None else ALIQUOTA_INTERNA_AL["default"]
    denominador = 1 - aliq_int / 100
    if denominador <= 0:
        return mva_orig

    mva_aj = ((1 + mva_orig / 100) * (1 - aliq_interestadual / 100) / denominador - 1) * 100
    return round(mva_aj, 2)


def calcular_st_item(item_data: dict, uf_emitente: str, idx_ncm: dict) -> dict:
    """
    Calcula ICMS ST para um item da NF-e.
    Fórmula:
        BC_ST = (v_prod + v_frete + v_seg + v_outros + v_IPI) × (1 + MVA/100)
        ICMS_ST = (BC_ST × aliq_interna) - ICMS_proprio
        ICMS_proprio = v_prod × aliq_interestadual
    """
    ncm         = item_data["ncm"]
    v_prod      = item_data["v_prod"]
    v_frete     = item_data["v_frete"]
    v_seg       = item_data["v_seg"]
    v_outros    = item_data["v_outros"]
    v_ipi       = item_data["v_ipi"]
    v_desc      = item_data["v_desc"]
    cst         = item_data.get("cst", "")

    registro = buscar_ncm(idx_ncm, ncm)

    aliq_int   = aliquota_interna_al(ncm)
    aliq_inter = ALIQUOTA_INTERESTADUAL.get(uf_emitente, ALIQUOTA_INTERESTADUAL["default"])

    # Base de cálculo do ICMS próprio (sem desconto, conforme regra geral)
    bc_proprio = v_prod - v_desc
    icms_proprio = round(bc_proprio * aliq_inter / 100, 2)

    resultado = {
        "ncm": ncm,
        "descricao_item": item_data["descricao"],
        "cest": item_data.get("cest", ""),
        "cst": cst,
        "v_prod": v_prod,
        "v_frete": v_frete,
        "v_ipi": v_ipi,
        "uf_emitente": uf_emitente,
        "aliq_interestadual": aliq_inter,
        "aliq_interna_al": aliq_int,
        "sujeito_st": False,
        "encontrado_base": registro is not None,
        "descricao_st": registro["descricao"] if registro else "",
        "cest_base": registro["cest"] if registro else "",
        "mva_utilizado": None,
        "bc_icms_proprio": round(bc_proprio, 2),
        "icms_proprio": icms_proprio,
        "bc_st": 0.0,
        "icms_st": 0.0,
        "icms_st_a_recolher": 0.0,
        "observacao": "",
    }

    # Verifica se é operação sujeita a ST (CST 10 ou 70 = com ST)
    nao_sujeito_cst = cst not in ("", None) and cst.lstrip("0") not in (
        "10", "70", "201", "202", "203"
    )

    if not registro:
        resultado["observacao"] = "NCM não encontrado na lista ST/AL – verificar manualmente"
        return resultado

    mva = escolher_mva(registro, aliq_inter, aliq_int)

    if mva is None:
        # Combustíveis e alguns produtos usam pauta ou cálculo especial
        resultado["observacao"] = (
            "MVA não disponível – produto pode usar pauta fiscal ou cálculo especial (ex.: combustíveis)"
        )
        resultado["sujeito_st"] = True
        return resultado

    resultado["sujeito_st"] = True
    resultado["mva_utilizado"] = mva

    # Base de cálculo ST
    base_entrada = v_prod - v_desc + v_frete + v_seg + v_outros + v_ipi
    bc_st = round(base_entrada * (1 + mva / 100), 2)

    # ICMS ST
    icms_st_bruto = round(bc_st * aliq_int / 100, 2)
    icms_st_recolher = round(max(icms_st_bruto - icms_proprio, 0), 2)

    resultado["bc_st"] = bc_st
    resultado["icms_st"] = icms_st_bruto
    resultado["icms_st_a_recolher"] = icms_st_recolher

    return resultado


# ─── Parser NF-e XML ────────────────────────────────────────────────────────

def parse_nfe(caminho_xml: str) -> dict:
    try:
        tree = ET.parse(caminho_xml)
        root = tree.getroot()
    except ET.ParseError as e:
        return {"erro": f"XML inválido: {e}", "arquivo": caminho_xml}

    ns = NAMESPACE["nfe"]

    # Suporte a envelope nfeProc ou NFe direto
    nfe = root.find(f"{{{ns}}}NFe")
    if nfe is None:
        nfe = root if root.tag == f"{{{ns}}}NFe" else root

    infnfe = nfe.find(f"{{{ns}}}infNFe")
    if infnfe is None:
        # Tenta sem namespace
        infnfe = nfe.find(".//infNFe")
        if infnfe is None:
            return {"erro": "Tag infNFe não encontrada", "arquivo": caminho_xml}

    emit  = infnfe.find(f"{{{ns}}}emit")
    dest  = infnfe.find(f"{{{ns}}}dest")
    total = infnfe.find(f"{{{ns}}}total/{{{ns}}}ICMSTot")

    chave = infnfe.get("Id", "").replace("NFe", "")
    uf_emit = ""
    if emit is not None:
        end_emit = emit.find(f"{{{ns}}}enderEmit")
        if end_emit is not None:
            uf_emit = txt(end_emit, "UF")

    uf_dest = ""
    if dest is not None:
        end_dest = dest.find(f"{{{ns}}}enderDest")
        if end_dest is not None:
            uf_dest = txt(end_dest, "UF")

    # Cabeçalho
    ide = infnfe.find(f"{{{ns}}}ide")
    numero_nf  = txt(ide, "nNF") if ide is not None else ""
    serie      = txt(ide, "serie") if ide is not None else ""
    dh_emissao = txt(ide, "dhEmi") if ide is not None else txt(ide, "dEmi") if ide is not None else ""

    # Itens
    itens = []
    for det in infnfe.findall(f"{{{ns}}}det"):
        prod  = det.find(f"{{{ns}}}prod")
        imposto = det.find(f"{{{ns}}}imposto")

        ncm   = txt(prod, "NCM") if prod is not None else ""
        cest  = txt(prod, "CEST") if prod is not None else ""
        xprod = txt(prod, "xProd") if prod is not None else ""
        cfop  = txt(prod, "CFOP") if prod is not None else ""
        v_prod   = num(prod, "vProd") if prod is not None else 0.0
        v_frete  = num(prod, "vFrete") if prod is not None else 0.0
        v_seg    = num(prod, "vSeg") if prod is not None else 0.0
        v_outros = num(prod, "vOutro") if prod is not None else 0.0
        v_desc   = num(prod, "vDesc") if prod is not None else 0.0

        # IPI
        v_ipi = 0.0
        if imposto is not None:
            ipi_el = imposto.find(f".//{{{ns}}}vIPI")
            if ipi_el is not None and ipi_el.text:
                v_ipi = float(ipi_el.text)

        # CST
        cst = ""
        if imposto is not None:
            for tag in ("orig", "CST", "CSOSN"):
                el = imposto.find(f".//{{{ns}}}{tag}")
                if el is not None and el.text and tag == "CST":
                    cst = el.text.strip()
                    break
                elif el is not None and el.text and tag == "CSOSN":
                    cst = el.text.strip()

        itens.append({
            "ncm": ncm, "cest": cest, "descricao": xprod, "cfop": cfop,
            "v_prod": v_prod, "v_frete": v_frete, "v_seg": v_seg,
            "v_outros": v_outros, "v_desc": v_desc, "v_ipi": v_ipi,
            "cst": cst,
        })

    return {
        "arquivo": caminho_xml,
        "chave": chave,
        "numero_nf": numero_nf,
        "serie": serie,
        "emissao": dh_emissao[:10] if dh_emissao else "",
        "uf_emitente": uf_emit,
        "uf_destinatario": uf_dest,
        "itens": itens,
        "erro": None,
    }


# ─── Processamento principal ────────────────────────────────────────────────

def processar_nfe(caminho_xml: str, idx_ncm: dict) -> dict:
    nfe = parse_nfe(caminho_xml)
    if nfe.get("erro"):
        return nfe

    uf_emit = nfe["uf_emitente"]
    resultados_itens = []

    for item in nfe["itens"]:
        res = calcular_st_item(item, uf_emit, idx_ncm)
        resultados_itens.append(res)

    total_st = round(sum(r["icms_st_a_recolher"] for r in resultados_itens), 2)
    total_bc_st = round(sum(r["bc_st"] for r in resultados_itens), 2)
    total_icms_proprio = round(sum(r["icms_proprio"] for r in resultados_itens), 2)

    return {
        **nfe,
        "itens_calculados": resultados_itens,
        "total_bc_st": total_bc_st,
        "total_icms_st": total_st,
        "total_icms_proprio": total_icms_proprio,
    }


# ─── Relatório texto ─────────────────────────────────────────────────────────

def imprimir_relatorio(resultado: dict):
    sep = "─" * 80
    print(f"\n{sep}")
    print(f"  NF-e: {resultado.get('numero_nf','?')}  |  Série: {resultado.get('serie','?')}"
          f"  |  Emissão: {resultado.get('emissao','?')}")
    print(f"  UF Emitente: {resultado.get('uf_emitente','?')}  →  "
          f"UF Destinatário: {resultado.get('uf_destinatario','?')}")
    print(f"  Chave: {resultado.get('chave','?')}")
    print(sep)

    if resultado.get("erro"):
        print(f"  [ERRO] {resultado['erro']}")
        return

    for i, item in enumerate(resultado.get("itens_calculados", []), 1):
        print(f"\n  Item {i:02d} | NCM: {item['ncm']} | {item['descricao_item'][:50]}")
        print(f"          CST: {item['cst']} | CFOP implícito da NF-e")
        if item["sujeito_st"]:
            print(f"          ✔ SUJEITO À ST — {item['descricao_st'][:60]}")
            if item["mva_utilizado"] is not None:
                print(f"          MVA ({item['aliq_interestadual']}% interest.): {item['mva_utilizado']}%"
                      f"  |  Alíq. Interna AL: {item['aliq_interna_al']}%")
                print(f"          BC ST:       R$ {item['bc_st']:>12,.2f}")
                print(f"          ICMS próprio:R$ {item['icms_proprio']:>12,.2f}")
                print(f"          ICMS ST:     R$ {item['icms_st_a_recolher']:>12,.2f}")
            else:
                print(f"          ⚠ {item['observacao']}")
        else:
            if not item["encontrado_base"]:
                print(f"          ✗ NCM não localizado na base ST/AL")
            else:
                print(f"          – Não sujeito a ST nesta operação")
        if item["observacao"] and item["sujeito_st"] and item["mva_utilizado"] is None:
            pass  # já impresso acima

    print(f"\n{sep}")
    print(f"  TOTAIS DA NF-e")
    print(f"  Base de Cálculo ST total:  R$ {resultado['total_bc_st']:>12,.2f}")
    print(f"  ICMS próprio total:        R$ {resultado['total_icms_proprio']:>12,.2f}")
    print(f"  ICMS ST a recolher total:  R$ {resultado['total_icms_st']:>12,.2f}")
    print(sep)


# ─── Exportação Excel ────────────────────────────────────────────────────────

def exportar_excel(todos_resultados: list[dict], arquivo_saida: str):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, numbers
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("\n[AVISO] openpyxl não instalado. Pulando exportação Excel.")
        print("        Instale com: py -m pip install openpyxl")
        return

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "ICMS ST Alagoas"

    cabecalho = [
        "Arquivo XML", "Chave NF-e", "NF", "Série", "Emissão",
        "UF Emitente", "UF Dest.", "Item",
        "NCM", "CEST", "Descrição Item", "CST",
        "Vl. Produto (R$)", "Vl. Frete (R$)", "Vl. IPI (R$)",
        "Sujeito ST?", "Encontrado Base?",
        "Descrição ST", "MVA (%)", "Alíq. Interestadual (%)", "Alíq. Interna AL (%)",
        "BC ICMS Próprio (R$)", "ICMS Próprio (R$)",
        "BC ST (R$)", "ICMS ST Bruto (R$)", "ICMS ST a Recolher (R$)",
        "Observação",
    ]

    # Cabeçalho
    hdr_fill = PatternFill("solid", fgColor="1F4E79")
    hdr_font = Font(bold=True, color="FFFFFF", size=10)
    for col, titulo in enumerate(cabecalho, 1):
        cell = ws.cell(row=1, column=col, value=titulo)
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    # Dados
    row = 2
    alt_fill = PatternFill("solid", fgColor="D6E4F0")
    for res in todos_resultados:
        arquivo = Path(res.get("arquivo", "")).name
        if res.get("erro"):
            ws.cell(row=row, column=1, value=arquivo)
            ws.cell(row=row, column=26, value=f"ERRO: {res['erro']}")
            row += 1
            continue

        for i, item in enumerate(res.get("itens_calculados", []), 1):
            fill = alt_fill if row % 2 == 0 else None
            valores = [
                arquivo,
                res.get("chave", ""),
                res.get("numero_nf", ""),
                res.get("serie", ""),
                res.get("emissao", ""),
                res.get("uf_emitente", ""),
                res.get("uf_destinatario", ""),
                i,
                item.get("ncm", ""),
                item.get("cest", ""),
                item.get("descricao_item", "")[:80],
                item.get("cst", ""),
                item.get("v_prod", 0),
                item.get("v_frete", 0),
                item.get("v_ipi", 0),
                "Sim" if item.get("sujeito_st") else "Não",
                "Sim" if item.get("encontrado_base") else "Não",
                item.get("descricao_st", "")[:80],
                item.get("mva_utilizado"),
                item.get("aliq_interestadual"),
                item.get("aliq_interna_al"),
                item.get("bc_icms_proprio", 0),
                item.get("icms_proprio", 0),
                item.get("bc_st", 0),
                item.get("icms_st", 0),
                item.get("icms_st_a_recolher", 0),
                item.get("observacao", ""),
            ]
            for col, val in enumerate(valores, 1):
                cell = ws.cell(row=row, column=col, value=val)
                if fill:
                    cell.fill = fill
                # Formata valores monetários
                if col in (13, 14, 15, 22, 23, 24, 25, 26):
                    cell.number_format = '#,##0.00'
                elif col in (19, 20, 21):
                    cell.number_format = '0.00'
            row += 1

    # Ajuste de largura
    larguras = {1: 22, 2: 48, 3: 8, 4: 7, 5: 12, 6: 10, 7: 8, 8: 6,
                9: 12, 10: 12, 11: 40, 12: 8, 13: 16, 14: 14, 15: 12,
                16: 10, 17: 14, 18: 40, 19: 10, 20: 18, 21: 16,
                22: 18, 23: 16, 24: 16, 25: 16, 26: 18, 27: 35}
    for col, larg in larguras.items():
        ws.column_dimensions[get_column_letter(col)].width = larg

    # Aba resumo por NF-e
    ws2 = wb.create_sheet("Resumo NF-e")
    ws2.append(["Arquivo", "NF", "Série", "Emissão", "UF Emit.",
                "BC ST Total (R$)", "ICMS Próprio Total (R$)", "ICMS ST a Recolher (R$)", "Erros"])
    for res in todos_resultados:
        ws2.append([
            Path(res.get("arquivo", "")).name,
            res.get("numero_nf", ""),
            res.get("serie", ""),
            res.get("emissao", ""),
            res.get("uf_emitente", ""),
            res.get("total_bc_st", 0),
            res.get("total_icms_proprio", 0),
            res.get("total_icms_st", 0),
            res.get("erro", ""),
        ])

    wb.save(arquivo_saida)
    print(f"\n✔ Relatório Excel salvo em: {arquivo_saida}")


# ─── Exportação JSON ─────────────────────────────────────────────────────────

def exportar_json(todos_resultados: list[dict], arquivo_saida: str):
    with open(arquivo_saida, "w", encoding="utf-8") as f:
        json.dump(todos_resultados, f, ensure_ascii=False, indent=2)
    print(f"✔ Relatório JSON salvo em: {arquivo_saida}")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)

    arquivos_xml = []

    if "--pasta" in args:
        idx = args.index("--pasta")
        pasta = args[idx + 1] if idx + 1 < len(args) else "."
        arquivos_xml = glob.glob(os.path.join(pasta, "*.xml"))
        if not arquivos_xml:
            print(f"Nenhum XML encontrado em: {pasta}")
            sys.exit(1)
    else:
        for a in args:
            if a.lower().endswith(".xml") and os.path.isfile(a):
                arquivos_xml.append(a)
            elif os.path.isdir(a):
                arquivos_xml.extend(glob.glob(os.path.join(a, "*.xml")))

    if not arquivos_xml:
        print("Nenhum arquivo XML fornecido.")
        sys.exit(1)

    print(f"\nCarregando base NCM/MVA de Alagoas...")
    idx_ncm = carregar_base_ncm()
    print(f"Base carregada: {len(idx_ncm)} NCMs indexados.\n")

    todos_resultados = []
    for xml in arquivos_xml:
        print(f"Processando: {Path(xml).name}")
        resultado = processar_nfe(xml, idx_ncm)
        todos_resultados.append(resultado)
        imprimir_relatorio(resultado)

    # Exportações
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    pasta_saida = Path(arquivos_xml[0]).parent

    xlsx = str(pasta_saida / f"ICMS_ST_AL_{ts}.xlsx")
    exportar_excel(todos_resultados, xlsx)

    json_out = str(pasta_saida / f"ICMS_ST_AL_{ts}.json")
    exportar_json(todos_resultados, json_out)

    # Resumo final
    total_geral = sum(r.get("total_icms_st", 0) for r in todos_resultados)
    print(f"\n{'═'*80}")
    print(f"  RESUMO GERAL — {len(todos_resultados)} NF-e(s) processada(s)")
    print(f"  ICMS ST TOTAL A RECOLHER:  R$ {total_geral:>14,.2f}")
    print(f"{'═'*80}\n")


if __name__ == "__main__":
    main()


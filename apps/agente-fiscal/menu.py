"""
menu.py  —  Agente NF-e SEFAZ Alagoas
Menu único: gerencia empresas e baixa relatórios.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

BASE_DIR_ANALITICO = Path(__file__).parent

BASE_DIR      = Path(__file__).parent
EMPRESAS_JSON = BASE_DIR / "empresas.json"


def limpar():
    os.system("cls")


def pausar():
    input("\n  Pressione ENTER para continuar...")


def cabecalho():
    print("=" * 60)
    print("  AGENTE LEXCON  |  SEFAZ ALAGOAS — Portal do Contribuinte")
    print("=" * 60)


def carregar() -> list[dict]:
    if EMPRESAS_JSON.exists():
        return json.loads(EMPRESAS_JSON.read_text(encoding="utf-8"))
    return []


def salvar(empresas: list[dict]):
    EMPRESAS_JSON.write_text(
        json.dumps(empresas, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def fmt_cnpj(cnpj: str) -> str:
    c = cnpj.replace(".", "").replace("/", "").replace("-", "")
    if len(c) == 14:
        return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"
    return cnpj


def listar(empresas: list[dict]):
    if not empresas:
        print("\n  Nenhuma empresa cadastrada ainda.")
    else:
        print(f"\n  {'Nº':<4} {'Nome':<28} {'CNPJ':<22} {'Usuário'}")
        print(f"  {'-'*65}")
        for i, e in enumerate(empresas, 1):
            print(f"  {i:<4} {e['nome']:<28} {fmt_cnpj(e['cnpj']):<22} {e['usuario']}")


# ── Ações ─────────────────────────────────────────────────────────────────────

def baixar(empresas: list[dict]):
    limpar()
    cabecalho()
    print("\n  BAIXAR RELATÓRIOS\n")

    if not empresas:
        print("  Nenhuma empresa cadastrada.")
        print("  Use a opção [2] para adicionar empresas.")
        pausar()
        return

    listar(empresas)

    # ── Seleção de empresa ─────────────────────────────────────────────────────
    print()
    print(f"  Empresa (0 = TODAS, 1-{len(empresas)} = selecionar uma):")
    sel = input("  Escolha: ").strip()

    try:
        n = int(sel)
    except ValueError:
        print("  Opção inválida.")
        pausar()
        return

    if n < 0 or n > len(empresas):
        print(f"  Número inválido. Informe 0 para todas ou 1 a {len(empresas)}.")
        pausar()
        return

    # ── Mês ────────────────────────────────────────────────────────────────────
    mes = input("\n  Mês (YYYY-MM, ex: 2026-03): ").strip()
    if not mes:
        print("  Mês não informado.")
        pausar()
        return

    # Aceita MM-YYYY ou YYYY-MM — normaliza para YYYY-MM
    partes = mes.replace("/", "-").split("-")
    if len(partes) == 2:
        a, b = int(partes[0]), int(partes[1])
        if a <= 12:          # digitou MM-YYYY
            a, b = b, a
        mes = f"{a}-{b:02d}"
    else:
        print("  Formato inválido. Use YYYY-MM, ex: 2026-03")
        pausar()
        return

    # ── Montar comando ─────────────────────────────────────────────────────────
    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--mes", mes]

    if n == 0:
        print(f"\n  Baixando relatórios de {len(empresas)} empresa(s) — mês {mes}...\n")
    else:
        cnpj_sel = empresas[n - 1]["cnpj"]
        nome_sel = empresas[n - 1]["nome"]
        cmd += ["--cnpj", cnpj_sel]
        print(f"\n  Baixando relatórios de '{nome_sel}' — mês {mes}...\n")

    print()
    resultado = subprocess.run(cmd, cwd=str(BASE_DIR))
    if resultado.returncode != 0:
        print(f"\n  Agente encerrou com erro (código {resultado.returncode}).")
    pausar()


def adicionar(empresas: list[dict]):
    limpar()
    cabecalho()
    print("\n  ADICIONAR EMPRESA\n")

    nome = input("  Nome da empresa  : ").strip()
    if not nome:
        print("  Nome não pode ser vazio.")
        pausar()
        return

    cnpj = input("  CNPJ (só números): ").strip().replace(".", "").replace("/", "").replace("-", "")
    if len(cnpj) != 14 or not cnpj.isdigit():
        print("  CNPJ inválido — informe os 14 dígitos.")
        pausar()
        return

    if any(e["cnpj"] == cnpj for e in empresas):
        print(f"  CNPJ {fmt_cnpj(cnpj)} já está cadastrado.")
        pausar()
        return

    usuario = input("  Usuário (login)  : ").strip()
    if not usuario:
        print("  Usuário não pode ser vazio.")
        pausar()
        return

    senha = input("  Senha            : ").strip()
    if not senha:
        print("  Senha não pode ser vazia.")
        pausar()
        return

    empresas.append({"nome": nome, "cnpj": cnpj, "usuario": usuario, "senha": senha})
    salvar(empresas)
    print(f"\n  Empresa {len(empresas)} — '{nome}' cadastrada com sucesso!")
    pausar()


def editar(empresas: list[dict]):
    limpar()
    cabecalho()
    print("\n  EDITAR EMPRESA\n")
    listar(empresas)

    if not empresas:
        pausar()
        return

    try:
        n = int(input("\n  Número da empresa (0 = cancelar): "))
    except ValueError:
        return

    if n == 0:
        return
    if n < 1 or n > len(empresas):
        print("  Número inválido.")
        pausar()
        return

    e = empresas[n - 1]
    print(f"\n  Empresa  : {e['nome']}")
    print(f"  CNPJ     : {fmt_cnpj(e['cnpj'])}")
    print(f"  Usuário  : {e['usuario']}")
    print()

    novo_nome    = input("  Novo nome    (ENTER = manter): ").strip()
    novo_usuario = input("  Novo usuário (ENTER = manter): ").strip()
    nova_senha   = input("  Nova senha   (ENTER = manter): ").strip()

    if novo_nome:
        e["nome"] = novo_nome
    if novo_usuario:
        e["usuario"] = novo_usuario
    if nova_senha:
        e["senha"] = nova_senha

    salvar(empresas)
    print(f"\n  Empresa {n} atualizada.")
    pausar()


def remover(empresas: list[dict]):
    limpar()
    cabecalho()
    print("\n  REMOVER EMPRESA\n")
    listar(empresas)

    if not empresas:
        pausar()
        return

    try:
        n = int(input("\n  Número da empresa a remover (0 = cancelar): "))
    except ValueError:
        return

    if n == 0:
        return
    if n < 1 or n > len(empresas):
        print("  Número inválido.")
        pausar()
        return

    removida = empresas.pop(n - 1)
    salvar(empresas)
    print(f"\n  Empresa '{removida['nome']}' removida.")
    print(f"  Restam {len(empresas)} empresa(s) cadastrada(s).")
    pausar()


def _imprimir_analitico(mes: str, download_dir: Path):
    """Imprime o analítico em paisagem via PowerShell."""
    import io
    from analitico import exibir_analitico as _exibir
    buf = io.StringIO()
    try:
        _exibir(mes, download_dir, destino=buf)
    except Exception as e:
        print(f"  ERRO ao gerar relatorio: {e}")
        return
    _imprimir_texto(buf.getvalue())


def _normalizar_mes(mes_raw: str) -> "str | None":
    """Converte MM-YYYY ou YYYY-MM para YYYY-MM. Retorna None se inválido."""
    partes = mes_raw.replace("/", "-").split("-")
    if len(partes) != 2:
        return None
    try:
        a, b = int(partes[0]), int(partes[1])
        if a <= 12:
            a, b = b, a
        return f"{a}-{b:02d}"
    except ValueError:
        return None


def _imprimir_texto(txt: str):
    """Envia texto para impressora em paisagem via .NET PrintDocument (PowerShell)."""
    import tempfile
    import subprocess as _sp

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(txt)
        txt_path = f.name

    ps = f"""
Add-Type -AssemblyName System.Drawing
$script:idx = 0
$lines = [System.IO.File]::ReadAllLines('{txt_path.replace(chr(92), "/")}', [System.Text.Encoding]::UTF8)
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.DefaultPageSettings.Landscape = $true
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(59, 59, 59, 59)
$pd.add_PrintPage({{
    param($s, $e)
    $font  = New-Object System.Drawing.Font('Courier New', 10)
    $brush = [System.Drawing.Brushes]::Black
    $y     = [float]$e.MarginBounds.Top
    $lh    = $e.Graphics.MeasureString('Ag', $font).Height
    while ($script:idx -lt $lines.Length) {{
        if ($y + $lh -gt $e.MarginBounds.Bottom) {{
            $e.HasMorePages = $true
            return
        }}
        $e.Graphics.DrawString($lines[$script:idx], $font, $brush, [float]$e.MarginBounds.Left, $y)
        $y += $lh
        $script:idx++
    }}
}})
$pd.Print()
"""
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as f:
        f.write(ps)
        ps_path = f.name

    try:
        res = _sp.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
             "-WindowStyle", "Hidden", "-File", ps_path],
            capture_output=True, text=True, timeout=30,
        )
        if res.returncode == 0:
            print("  Enviado para impressora (paisagem).")
        else:
            print(f"  ERRO PowerShell: {res.stderr.strip()[:200]}")
    except Exception as e:
        print(f"  ERRO ao imprimir: {e}")
    finally:
        for p in (txt_path, ps_path):
            try:
                os.unlink(p)
            except Exception:
                pass


def _analisar_parcelamentos():
    """Sub-opção: exibe análise de parcelamentos lida dos PDFs."""
    mes_raw = input("  Mês (YYYY-MM, ex: 2026-03): ").strip()
    if not mes_raw:
        print("  Mês não informado.")
        pausar()
        return

    mes = _normalizar_mes(mes_raw)
    if not mes:
        print("  Formato inválido.")
        pausar()
        return

    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        print(f"\n  Nenhum relatório encontrado para {mes}.")
        pausar()
        return

    try:
        from analitico import exibir_parcelamentos
        exibir_parcelamentos(mes, download_dir)
    except Exception as e:
        print(f"\n  ERRO: {e}")
        pausar()
        return

    imp = input("\n  Deseja imprimir? (S/N): ").strip().upper()
    if imp == "S":
        import io
        from analitico import exibir_parcelamentos as _exibir
        buf = io.StringIO()
        try:
            _exibir(mes, download_dir, destino=buf)
            _imprimir_texto(buf.getvalue())
        except Exception as e:
            print(f"  ERRO: {e}")

    pausar()


def _emitir_parcelas():
    """Sub-opção: emite DARs via portal para todas ou uma empresa."""
    empresas = carregar()
    if not empresas:
        print("\n  Nenhuma empresa cadastrada.")
        pausar()
        return

    listar(empresas)
    print()
    print(f"  Empresa (0 = TODAS, 1-{len(empresas)} = selecionar uma):")
    sel = input("  Escolha: ").strip()

    try:
        n = int(sel)
    except ValueError:
        print("  Opção inválida.")
        pausar()
        return

    if n < 0 or n > len(empresas):
        print("  Número inválido.")
        pausar()
        return

    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--modo", "emitir-parcelas"]
    if n == 0:
        print(f"\n  Emitindo DARs de {len(empresas)} empresa(s)...\n")
    else:
        cnpj_sel = empresas[n - 1]["cnpj"]
        nome_sel = empresas[n - 1]["nome"]
        cmd += ["--cnpj", cnpj_sel]
        print(f"\n  Emitindo DARs de '{nome_sel}'...\n")

    resultado = subprocess.run(cmd, cwd=str(BASE_DIR))
    if resultado.returncode != 0:
        print(f"\n  Agente encerrou com erro (código {resultado.returncode}).")
    pausar()


def _impostos_sefaz(empresas: list[dict]):
    """Baixa impostos (Cobrança DF-e) do portal SEFAZ."""
    limpar()
    cabecalho()
    print("\n  IMPOSTOS SEFAZ — Cobrança DF-e\n")

    if not empresas:
        print("  Nenhuma empresa cadastrada.")
        print("  Use a opção de adicionar empresas.")
        pausar()
        return

    listar(empresas)

    print()
    print(f"  Empresa (0 = TODAS, 1-{len(empresas)} = selecionar uma):")
    sel = input("  Escolha: ").strip()

    try:
        n = int(sel)
    except ValueError:
        print("  Opção inválida.")
        pausar()
        return

    if n < 0 or n > len(empresas):
        print(f"  Número inválido. Informe 0 para todas ou 1 a {len(empresas)}.")
        pausar()
        return

    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--modo", "impostos"]

    if n == 0:
        print(f"\n  Baixando impostos de {len(empresas)} empresa(s)...\n")
    else:
        cnpj_sel = empresas[n - 1]["cnpj"]
        nome_sel = empresas[n - 1]["nome"]
        cmd += ["--cnpj", cnpj_sel]
        print(f"\n  Baixando impostos de '{nome_sel}'...\n")

    resultado = subprocess.run(cmd, cwd=str(BASE_DIR))
    if resultado.returncode != 0:
        print(f"\n  Agente encerrou com erro (código {resultado.returncode}).")
    pausar()


def _baixar_ecac(empresas: list[dict]):
    """Abre browser para autenticacao e-CAC e baixa relatorios."""
    limpar()
    cabecalho()
    print("\n  BAIXAR RELATORIOS RECEITA ECAC\n")

    if not empresas:
        print("  Nenhuma empresa cadastrada.")
        pausar()
        return

    print(f"  Empresas : {len(empresas)}")
    print()
    print("  O Edge sera aberto para autenticacao no e-CAC.")
    print("  Faca login com gov.br e selecione seu certificado digital.")
    print()

    cmd = [sys.executable, str(BASE_DIR / "ecac_agent.py")]
    resultado = subprocess.run(cmd, cwd=str(BASE_DIR))
    if resultado.returncode != 0:
        print(f"\n  Agente encerrou com erro (codigo {resultado.returncode}).")
    pausar()


def parcelamentos():
    while True:
        limpar()
        cabecalho()
        print("\n  PARCELAMENTO SEFAZ/PROCURADORIA\n")
        print("  [1] Analisar parcelamentos")
        print("  [2] Emitir parcelas")
        print("  [0] Voltar")
        print()

        opcao = input("  Escolha: ").strip()

        if opcao == "1":
            limpar()
            cabecalho()
            print("\n  ANALISAR PARCELAMENTOS\n")
            _analisar_parcelamentos()
        elif opcao == "2":
            limpar()
            cabecalho()
            print("\n  EMITIR PARCELAS\n")
            _emitir_parcelas()
        elif opcao == "0":
            break


def analitico():
    limpar()
    cabecalho()
    print("\n  ANALÍTICO EMPRESAS\n")

    mes = input("  Mês (YYYY-MM, ex: 2026-03): ").strip()
    if not mes:
        print("  Mês não informado.")
        pausar()
        return

    partes = mes.replace("/", "-").split("-")
    if len(partes) == 2:
        a, b = int(partes[0]), int(partes[1])
        if a <= 12:
            a, b = b, a
        mes = f"{a}-{b:02d}"
    else:
        print("  Formato inválido. Use YYYY-MM, ex: 2026-03")
        pausar()
        return

    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        print(f"\n  Nenhum relatório encontrado para {mes}.")
        print(f"  Pasta verificada: {download_dir}")
        pausar()
        return

    try:
        from analitico import exibir_analitico
        exibir_analitico(mes, download_dir)
    except ImportError:
        print("\n  ERRO: módulo analitico.py não encontrado.")
        pausar()
        return
    except Exception as e:
        print(f"\n  ERRO ao analisar: {e}")
        pausar()
        return

    imp = input("\n  Deseja imprimir? (S/N): ").strip().upper()
    if imp == "S":
        _imprimir_analitico(mes, download_dir)

    pausar()


# ── Menu principal ─────────────────────────────────────────────────────────────

def main():
    while True:
        limpar()
        cabecalho()

        empresas = carregar()

        print(f"\n  EMPRESAS CADASTRADAS: {len(empresas)}")
        listar(empresas)

        print("\n  ─────────────────────────────────────────────────────")
        print("  [1] Baixar Relatorios Sefaz")
        print("  [2] Analitico Empresas Sefaz")
        print("  [3] Impostos Sefaz")
        print("  [4] Parcelamento Sefaz/Procuradoria")
        print("  [5] Baixar Relatorios Receita ECAC")
        print("  [6] Adicionar empresa")
        print("  [7] Editar empresa")
        print("  [8] Remover empresa")
        print("  [0] Sair")
        print()

        opcao = input("  Escolha: ").strip()

        if opcao == "1":
            baixar(empresas)
        elif opcao == "2":
            analitico()
        elif opcao == "3":
            _impostos_sefaz(empresas)
        elif opcao == "4":
            parcelamentos()
        elif opcao == "5":
            _baixar_ecac(empresas)
        elif opcao == "6":
            adicionar(empresas)
        elif opcao == "7":
            editar(empresas)
        elif opcao == "8":
            remover(empresas)
        elif opcao == "0":
            limpar()
            break


if __name__ == "__main__":
    import webbrowser
    import threading

    # Tenta abrir a interface web primeiro
    try:
        from app import app as _flask_app
        port = 5000
        print()
        print("  ╔══════════════════════════════════════╗")
        print("  ║     Agente Lexcon — Interface Web    ║")
        print(f"  ║   Acesse: http://localhost:{port}      ║")
        print("  ║   Pressione Ctrl+C para encerrar     ║")
        print("  ╚══════════════════════════════════════╝")
        print()
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{port}")).start()
        _flask_app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
    except ImportError:
        # Fallback para menu de terminal se Flask não estiver instalado
        try:
            main()
        except KeyboardInterrupt:
            print("\n\n  Encerrado.")

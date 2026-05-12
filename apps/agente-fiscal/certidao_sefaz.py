#!/usr/bin/env python3
"""
certidao_sefaz.py
─────────────────
Baixa a Certidão Estadual (CND Estadual) do Portal do Contribuinte SEFAZ-AL.
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

BASE_DIR = Path(__file__).parent
PORTAL_URL = "https://contribuinte.sefaz.al.gov.br"

# Respeita EMPRESAS_DATA_DIR igual ao app.py (volume Docker)
_DATA_DIR = Path(os.environ.get("EMPRESAS_DATA_DIR", str(BASE_DIR)))
EMPRESAS_JSON = _DATA_DIR / "empresas.json"


def _build_chrome_options(destino: Path):
    from selenium.webdriver.chrome.options import Options
    options = Options()

    # Headless obrigatório em servidor/Docker
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("prefs", {
        "download.default_directory": str(destino),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True,
    })

    # Binário do Chromium (configurado via ENV no Docker)
    chrome_bin = os.environ.get("CHROME_BIN", "")
    if chrome_bin and Path(chrome_bin).exists():
        options.binary_location = chrome_bin

    return options


def _carregar_empresa(cnpj: str) -> dict | None:
    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    json_path = EMPRESAS_JSON
    if not json_path.exists():
        return None
    dados = json.loads(json_path.read_text(encoding="utf-8"))
    for e in dados:
        c = e.get("cnpj", "").replace(".", "").replace("/", "").replace("-", "")
        if c == cnpj_limpo:
            return e
    return None


def baixar_certidao(cnpj: str, destino: Path | None = None) -> int:
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.service import Service
    except ImportError:
        print("ERRO: Selenium não instalado. Execute: pip install selenium")
        return 1

    cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "")
    empresa = _carregar_empresa(cnpj_limpo)

    if not empresa:
        print(f"ERRO: Empresa com CNPJ {cnpj_limpo} não encontrada no cadastro.")
        return 1

    nome = empresa["nome"]
    usuario = empresa["usuario"]
    senha = empresa["senha"]

    mes_str = date.today().strftime("%Y-%m")
    if destino is None:
        destino = BASE_DIR / "downloads" / mes_str / nome / "certidoes"
    destino.mkdir(parents=True, exist_ok=True)

    print(f"→ Empresa  : {nome}")
    print(f"→ CNPJ     : {cnpj_limpo}")
    print(f"→ Destino  : {destino}")
    print()

    options = _build_chrome_options(destino)

    # Usa chromedriver do sistema (Docker) ou deixa o Selenium encontrar
    chromedriver_path = os.environ.get("CHROMEDRIVER_PATH", "")
    if chromedriver_path and Path(chromedriver_path).exists():
        service = Service(executable_path=chromedriver_path)
        driver = webdriver.Chrome(service=service, options=options)
    else:
        driver = webdriver.Chrome(options=options)

    wait = WebDriverWait(driver, 30)

    try:
        # ── Login ──────────────────────────────────────────────────────────
        print("→ Abrindo Portal do Contribuinte SEFAZ-AL...")
        driver.get(PORTAL_URL)
        time.sleep(2)

        print("→ Realizando login...")

        selectors_user = [
            ("name", "login"),
            ("name", "username"),
            ("id", "username"),
            ("css selector", "input[placeholder*='usuário' i]"),
            ("css selector", "input[placeholder*='usuario' i]"),
            ("css selector", "input[placeholder*='CPF' i]"),
            ("css selector", "input[type='text']"),
        ]

        username_field = None
        for by, sel in selectors_user:
            try:
                username_field = wait.until(EC.element_to_be_clickable((by, sel)))
                break
            except Exception:
                continue

        if not username_field:
            print("ERRO: Campo de usuário não encontrado.")
            return 1

        username_field.clear()
        username_field.send_keys(usuario)

        password_field = None
        for by, sel in [("name", "password"), ("id", "password"), ("css selector", "input[type='password']")]:
            try:
                password_field = driver.find_element(by, sel)
                break
            except Exception:
                continue

        if not password_field:
            print("ERRO: Campo de senha não encontrado.")
            return 1

        password_field.clear()
        password_field.send_keys(senha)

        submit = None
        for by, sel in [
            ("css selector", "button[type='submit']"),
            ("css selector", "input[type='submit']"),
            ("xpath", "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'entrar')]"),
            ("xpath", "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'acessar')]"),
            ("xpath", "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'login')]"),
            ("css selector", "button.btn-primary"),
        ]:
            try:
                submit = driver.find_element(by, sel)
                break
            except Exception:
                continue

        if not submit:
            print("ERRO: Botão de login não encontrado.")
            return 1

        submit.click()
        print("→ Login enviado. Aguardando autenticação...")
        time.sleep(4)

        current_url = driver.current_url.lower()
        if "login" in current_url and PORTAL_URL.lower() not in current_url.replace("/login", ""):
            page_text = driver.find_element("tag name", "body").text.lower()
            if "senha" in page_text and ("inválid" in page_text or "incorret" in page_text or "invalid" in page_text):
                print("ERRO: Falha no login — credenciais inválidas.")
                return 1

        print("→ Login realizado com sucesso.")

        # ── Navegar para Certidão ──────────────────────────────────────────
        print("→ Navegando para a seção de Certidões...")

        nav_xpaths = [
            "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'certid')]",
            "//span[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'certid')]/ancestor::a",
            "//a[contains(@href, 'certid')]",
            "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'situaç')]",
            "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'situac')]",
            "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'certid')]",
        ]

        nav_found = False
        for xpath in nav_xpaths:
            try:
                elem = WebDriverWait(driver, 5).until(EC.element_to_be_clickable(("xpath", xpath)))
                elem.click()
                nav_found = True
                print("→ Menu de certidão encontrado e clicado.")
                time.sleep(2)
                break
            except Exception:
                continue

        if not nav_found:
            urls_tentativas = [
                f"{PORTAL_URL}/#/certidao",
                f"{PORTAL_URL}/#/certidao-negativa",
                f"{PORTAL_URL}/#/situacao-fiscal",
                f"{PORTAL_URL}/certidao",
                f"{PORTAL_URL}/situacao-fiscal",
            ]
            for url in urls_tentativas:
                try:
                    driver.get(url)
                    time.sleep(2)
                    body = driver.find_element("tag name", "body").text.lower()
                    if "certid" in body or "situaç" in body or "situac" in body:
                        nav_found = True
                        print(f"→ Acessou via URL direta: {url}")
                        break
                except Exception:
                    continue

        if not nav_found:
            print("AVISO: Não foi possível navegar automaticamente para certidões.")
            print("AVISO: Verifique a estrutura do portal manualmente.")
            return 1

        # ── Emitir / Baixar Certidão ───────────────────────────────────────
        print("→ Procurando botão para emitir certidão...")

        emitir_xpaths = [
            "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'emitir')]",
            "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'gerar')]",
            "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'baixar')]",
            "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'emitir')]",
            "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'gerar certid')]",
            "//input[@type='submit']",
            "//button[@type='submit']",
        ]

        emitir_found = False
        for xpath in emitir_xpaths:
            try:
                btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable(("xpath", xpath)))
                btn.click()
                emitir_found = True
                print("→ Emissão de certidão iniciada.")
                time.sleep(3)
                break
            except Exception:
                continue

        if not emitir_found:
            print("AVISO: Botão de emissão não encontrado — o portal pode abrir a certidão automaticamente.")

        # Aguarda o download ou carregamento
        print("→ Aguardando geração da certidão...")
        time.sleep(5)

        # ── Verificar status da certidão ───────────────────────────────────
        status_certidao = "desconhecido"
        try:
            body_text = driver.find_element("tag name", "body").text.upper()

            if "POSITIVA COM EFEITO DE NEGATIVA" in body_text:
                status_certidao = "positiva_com_efeito_negativa"
                print("✔  Certidão POSITIVA COM EFEITO DE NEGATIVA — empresa regular com ressalvas.")
            elif "NEGATIVA" in body_text:
                status_certidao = "negativa"
                print("✔  Certidão NEGATIVA — empresa em situação regular.")
            elif "POSITIVA" in body_text:
                status_certidao = "positiva"
                print("⚠  Certidão POSITIVA — há débitos pendentes.")
        except Exception as e:
            print(f"AVISO: Não foi possível verificar o status da certidão: {e}")

        # ── Salvar PDF ─────────────────────────────────────────────────────
        # Verifica se houve download automático; caso contrário, tenta imprimir como PDF
        arquivos_antes = set(destino.glob("*.*"))
        time.sleep(3)
        arquivos_depois = set(destino.glob("*.*"))
        novos = arquivos_depois - arquivos_antes

        if not novos:
            # Tenta capturar a certidão como PDF via print
            try:
                nome_arquivo = f"certidao-estadual-{cnpj_limpo[:8]}-{mes_str}.pdf"
                destino_pdf = destino / nome_arquivo
                import base64
                pdf_data = driver.execute_cdp_cmd("Page.printToPDF", {
                    "printBackground": True,
                    "format": "A4",
                })
                with open(destino_pdf, "wb") as f:
                    f.write(base64.b64decode(pdf_data["data"]))
                print(f"→ Certidão salva como PDF: {nome_arquivo}")
                novos = {destino_pdf}
            except Exception as e:
                print(f"AVISO: Não foi possível salvar PDF automaticamente: {e}")
                print("AVISO: Faça o download manualmente no navegador aberto.")

        # ── Extrato de Pendências (se Positiva) ────────────────────────────
        if status_certidao == "positiva":
            print()
            print("→ Certidão POSITIVA — buscando Extrato de Pendência de Débitos...")

            extrato_xpaths = [
                "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'extrato')]",
                "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'extrato')]",
                "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'pend')]",
                "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'pend')]",
                "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'débito')]",
                "//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'debito')]",
                "//a[contains(@href, 'extrato')]",
                "//a[contains(@href, 'pend')]",
            ]

            extrato_found = False
            for xpath in extrato_xpaths:
                try:
                    elem = WebDriverWait(driver, 8).until(EC.element_to_be_clickable(("xpath", xpath)))
                    elem.click()
                    extrato_found = True
                    print("→ Acessando Extrato de Pendências...")
                    time.sleep(4)
                    break
                except Exception:
                    continue

            if not extrato_found:
                # Tenta URL direta do extrato
                urls_extrato = [
                    f"{PORTAL_URL}/#/extrato-pendencias",
                    f"{PORTAL_URL}/#/debitos",
                    f"{PORTAL_URL}/extrato-pendencias",
                ]
                for url in urls_extrato:
                    try:
                        driver.get(url)
                        time.sleep(2)
                        body = driver.find_element("tag name", "body").text.lower()
                        if "extrato" in body or "pend" in body or "débito" in body or "debito" in body:
                            extrato_found = True
                            print(f"→ Extrato acessado via URL: {url}")
                            break
                    except Exception:
                        continue

            if extrato_found:
                # Tenta baixar extrato
                time.sleep(3)
                arquivos_extrato_antes = set(destino.glob("*.*"))
                time.sleep(4)
                arquivos_extrato_depois = set(destino.glob("*.*"))
                novos_extrato = arquivos_extrato_depois - arquivos_extrato_antes

                if not novos_extrato:
                    try:
                        nome_extrato = f"extrato-pendencias-{cnpj_limpo[:8]}-{mes_str}.pdf"
                        destino_extrato = destino / nome_extrato
                        import base64
                        pdf_data = driver.execute_cdp_cmd("Page.printToPDF", {
                            "printBackground": True,
                            "format": "A4",
                        })
                        with open(destino_extrato, "wb") as f:
                            f.write(base64.b64decode(pdf_data["data"]))
                        print(f"→ Extrato salvo como PDF: {nome_extrato}")
                    except Exception as e:
                        print(f"AVISO: Não foi possível salvar extrato automaticamente: {e}")
            else:
                print("AVISO: Extrato de Pendências não encontrado automaticamente.")
                print("AVISO: Acesse manualmente: Certidões → Extrato de Pendências no portal.")

        # ── Resumo final ───────────────────────────────────────────────────
        print()
        arquivos_final = list(destino.glob("*.*"))
        if arquivos_final:
            print(f"→ {len(arquivos_final)} arquivo(s) salvo(s) em: {destino}")
            for arq in arquivos_final:
                print(f"   • {arq.name} ({arq.stat().st_size:,} bytes)")
        else:
            print("AVISO: Nenhum arquivo foi salvo automaticamente.")
            print(f"AVISO: Pasta de destino: {destino}")

        print()
        if status_certidao == "positiva":
            print("⚠  STATUS: POSITIVA — empresa com débitos pendentes na SEFAZ-AL.")
        elif status_certidao in ("negativa", "positiva_com_efeito_negativa"):
            print("✔  STATUS: empresa em situação regular na SEFAZ-AL.")
        else:
            print(f"→  STATUS: {status_certidao}")

        return 0

    except Exception as e:
        print(f"ERRO: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Baixa certidão estadual SEFAZ-AL")
    parser.add_argument("--cnpj", required=True, help="CNPJ da empresa (14 dígitos)")
    parser.add_argument("--destino", default=None, help="Pasta de destino (opcional)")
    args = parser.parse_args()

    destino = Path(args.destino) if args.destino else None
    sys.exit(baixar_certidao(args.cnpj, destino))


if __name__ == "__main__":
    main()

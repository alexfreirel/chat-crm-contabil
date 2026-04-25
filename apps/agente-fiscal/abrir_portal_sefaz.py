#!/usr/bin/env python3
"""
Abre o Portal do Contribuinte SEFAZ AL com login automático.
Usa Selenium com detach=True para manter o browser aberto após o script sair.
Fallback: abre o portal sem login se Selenium não estiver disponível.

Uso: python abrir_portal_sefaz.py <usuario> <senha>
"""
import sys
import time

PORTAL_URL = "https://contribuinte.sefaz.al.gov.br"


def main(usuario: str, senha: str):
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        options = webdriver.ChromeOptions()
        options.add_experimental_option("detach", True)  # browser fica aberto após o script sair
        options.add_argument("--start-maximized")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])

        print(f"Abrindo Chrome para usuário {usuario}...")
        driver = webdriver.Chrome(options=options)
        driver.get(PORTAL_URL)

        wait = WebDriverWait(driver, 20)

        # Aguarda campo de usuário — tenta múltiplos seletores (JHipster Angular)
        selectors_user = [
            (By.NAME, "login"),
            (By.NAME, "username"),
            (By.ID, "username"),
            (By.CSS_SELECTOR, "input[placeholder*='usuário' i]"),
            (By.CSS_SELECTOR, "input[placeholder*='usuario' i]"),
            (By.CSS_SELECTOR, "input[placeholder*='CPF' i]"),
            (By.CSS_SELECTOR, "input[type='text']:first-of-type"),
        ]

        username_field = None
        for by, selector in selectors_user:
            try:
                username_field = wait.until(EC.element_to_be_clickable((by, selector)))
                print(f"Campo usuário encontrado: [{by}] {selector}")
                break
            except Exception:
                continue

        if not username_field:
            print("AVISO: Campo de usuário não encontrado. Portal aberto sem login automático.")
            return

        username_field.clear()
        username_field.send_keys(usuario)

        # Campo de senha
        password_field = None
        for by, selector in [
            (By.NAME, "password"),
            (By.ID, "password"),
            (By.CSS_SELECTOR, "input[type='password']"),
        ]:
            try:
                password_field = driver.find_element(by, selector)
                break
            except Exception:
                continue

        if not password_field:
            print("AVISO: Campo de senha não encontrado.")
            return

        password_field.clear()
        password_field.send_keys(senha)

        # Botão de login
        submit = None
        for by, selector in [
            (By.CSS_SELECTOR, "button[type='submit']"),
            (By.CSS_SELECTOR, "input[type='submit']"),
            (By.XPATH, "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'entrar') or contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'login') or contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'acessar')]"),
            (By.CSS_SELECTOR, "button.btn-primary"),
            (By.CSS_SELECTOR, "button.btn-login"),
        ]:
            try:
                submit = driver.find_element(by, selector)
                break
            except Exception:
                continue

        if submit:
            submit.click()
            time.sleep(2)
            print(f"Login realizado para usuário {usuario}. Navegador mantido aberto.")
        else:
            print("AVISO: Botão de login não encontrado. Credenciais preenchidas — submeta manualmente.")

    except ImportError:
        print("Selenium não instalado. Abrindo portal sem login automático...")
        import webbrowser
        webbrowser.open(PORTAL_URL)
    except Exception as e:
        print(f"ERRO ao abrir portal: {e}")
        import webbrowser
        webbrowser.open(PORTAL_URL)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python abrir_portal_sefaz.py <usuario> <senha>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])

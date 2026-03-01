@echo off
setlocal enabledelayedexpansion

echo =========================================================
echo  INICIANDO AMBIENTE LOCAL FRONTAL E API - LEXCRM
echo =========================================================

:: Mata processos node anteriores de forma mais agressiva
echo [0/3] Limpando processos antigos...
taskkill /F /IM node.exe /T /FI "WINDOWTITLE eq LexCRM*" 2>nul
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo [1/3] Verificando dependencias e preparando...
:: Verifica se o dist existe, se nao existir builda
if not exist "apps\api\dist\main.js" (
    echo [!] Build da API nao encontrado. Gerando...
    cmd /c "npm run build --workspace=apps/api"
)

echo.

:: Tenta iniciar a API em uma nova janela
echo [2/3] Iniciando API (Porta 3005) em segundo plano...
start "LexCRM - API" cmd /c "echo === LOG DA API LEXCRM === & :loop & node apps/api/dist/main.js & echo. & echo [!] API caiu em %time%. Reiniciando em 5 segundos... & timeout /t 5 & goto loop"

:: Espera um pouco para a API subir antes do Web
timeout /t 5 /nobreak >nul

:: Inicia o Web no terminal atual
echo [3/3] Iniciando Painel Web (Porta 3000)...
echo.
echo =========================================================
echo  Painel CRM: http://localhost:3000
echo  API Back: http://localhost:3005
echo =========================================================
echo.

npm run dev --workspace=apps/web

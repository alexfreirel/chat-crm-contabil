#!/bin/bash
# Script de Instalação Rápida para VPS (Ubuntu/Debian)

echo "🚀 Iniciando setup do LexCRM na VPS..."

# 1. Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# 2. Instalar Docker e Docker Compose (se não existirem)
if ! command -v docker &> /dev/null
then
    echo "🐳 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

if ! command -v docker-compose &> /dev/null
then
    echo "🐙 Instalando Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 3. Preparar variáveis
if [ ! -f .env ]; then
    echo "⚙️ Criando arquivo .env padrão..."
    cp infra/.env.example .env
    echo "⚠️ ATENÇÃO: Edite o arquivo .env com suas chaves da Evolution API e Google Gemini antes de continuar!"
    exit 1
fi

# 4. Iniciar tudo
echo "📦 Buildando e subindo os containers..."
docker-compose -f docker-compose.prod.yml up -d --build

echo "✅ Sucesso! O LexCRM está rodando."
echo "   - Web UI: http://SEU_IP_AQUI:3000"
echo "   - API: http://SEU_IP_AQUI:3001"
echo "   - SeaweedFS S3 Console: http://SEU_IP_AQUI:8333"

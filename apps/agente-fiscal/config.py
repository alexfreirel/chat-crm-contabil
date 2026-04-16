"""
config.py  –  Centraliza todas as configurações do agente.
"""
import calendar
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

log = logging.getLogger("config")

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

# ── Período ──────────────────────────────────────────────────────────────────
_mes_raw = os.getenv("MES", "").strip()
if not _mes_raw:
    from datetime import date
    _hoje = date.today()
    _mes_raw = f"{_hoje.year}-{_hoje.month:02d}"

_p               = [int(x) for x in _mes_raw.split("-")]
# Aceita YYYY-MM ou MM-YYYY — detecta pelo tamanho da primeira parte
if _p[0] <= 12:          # ex: 03-2026 → inverte para 2026-03
    _p = [_p[1], _p[0]]
ANO, MES_NUM     = _p[0], _p[1]
_mes_raw         = f"{ANO}-{MES_NUM:02d}"   # normaliza sempre para YYYY-MM
_ultimo_dia      = calendar.monthrange(ANO, MES_NUM)[1]
DATA_INICIAL     = f"01/{MES_NUM:02d}/{ANO}"
DATA_FINAL       = f"{_ultimo_dia:02d}/{MES_NUM:02d}/{ANO}"
DATA_INICIAL_ISO = f"{ANO}-{MES_NUM:02d}-01"
DATA_FINAL_ISO   = f"{ANO}-{MES_NUM:02d}-{_ultimo_dia:02d}"
MES_STR          = _mes_raw  # ex: "2026-03"

# ── URLs ──────────────────────────────────────────────────────────────────────
URL_SEFAZ = "https://contribuinte.sefaz.al.gov.br"

# ── Pasta base de downloads ───────────────────────────────────────────────────
_destino_env = os.getenv("DOWNLOAD_DESTINO", "").strip()
if _destino_env:
    DOWNLOAD_DIR = Path(_destino_env) / _mes_raw
else:
    DOWNLOAD_DIR = BASE_DIR / "downloads" / _mes_raw
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Empresas ─────────────────────────────────────────────────────────────────
@dataclass
class Empresa:
    nome: str
    cnpj: str
    usuario: str
    senha: str

    @property
    def pasta(self) -> Path:
        """Pasta de saída exclusiva desta empresa para o período atual."""
        # Ex: "JANIELY M DOS SANTOS - 36834654000168"
        nome_limpo = self.nome.replace("/", "-").replace("\\", "-").strip()
        pasta_empresa = f"{nome_limpo} - {self.cnpj}"
        return DOWNLOAD_DIR / pasta_empresa / "relatorio"


def carregar_empresas() -> list[Empresa]:
    """
    Carrega a lista de empresas de empresas.json.
    Se o arquivo não existir, usa as variáveis de ambiente do .env como fallback.
    """
    _data_dir = Path(os.environ.get("EMPRESAS_DATA_DIR", str(BASE_DIR)))
    caminho = _data_dir / "empresas.json"
    if not caminho.exists():
        caminho = BASE_DIR / "empresas.json"
    if caminho.exists():
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        empresas = [Empresa(**d) for d in dados]
        log.info(f"{len(empresas)} empresa(s) carregada(s) de empresas.json")
        return empresas

    # Fallback: variáveis de ambiente
    usuario = os.getenv("SEFAZ_USUARIO", "")
    senha   = os.getenv("SEFAZ_SENHA", "")
    cnpj    = os.getenv("SEFAZ_CNPJ", "")
    if usuario and senha and cnpj:
        log.info("Usando credenciais do .env (fallback)")
        return [Empresa(nome="Empresa", cnpj=cnpj, usuario=usuario, senha=senha)]

    raise RuntimeError(
        "Nenhuma empresa configurada. "
        "Crie o arquivo empresas.json ou defina SEFAZ_USUARIO, SEFAZ_SENHA e SEFAZ_CNPJ no .env"
    )

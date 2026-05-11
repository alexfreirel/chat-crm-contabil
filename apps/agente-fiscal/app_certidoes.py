"""
app_certidoes.py — Servidor Flask do Agente Certidões.

Expõe os endpoints consumidos pela página /atendimento/agente-certidoes do
frontend. A lista de CNPJs vem do frontend (fonte: tabela ClienteContabil),
NÃO é mais persistida aqui.

Monitoramento automático cobre apenas Receita Federal (situação cadastral)
e FGTS/CRF — Simples Nacional foi removido do fluxo automático.

Endpoints:
  GET  /api/status                          → estado da última consulta + logs
  GET  /api/config                          → email/alertas (sem CNPJs)
  POST /api/config/email                    → salvar config de e-mail
  POST /api/consultar                       → inicia consulta (body: {cnpjs: [{cnpj,nome}]})
  GET  /api/historico                       → últimas execuções
  GET  /api/certidoes                       → arquivos PDF salvos
  GET  /api/certidoes/arquivo/<nome>        → download do PDF
  POST /api/baixar/cnd/<cnpj>               → abre o portal RFB para o CNPJ
  GET  /api/baixar/status/<cnpj>            → status do download disparado

Porta padrão: 5001 (use PORT=… para mudar).
"""

import json
import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from certidoes_agent import consultar_cnpj_receita

# ── Setup ─────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("app_certidoes")

BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("CERTIDOES_DATA_DIR", str(BASE_DIR / "data_certidoes")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_PATH = DATA_DIR / "config.json"
HISTORICO_PATH = DATA_DIR / "historico.json"
CERTIDOES_DIR = DATA_DIR / "certidoes"
CERTIDOES_DIR.mkdir(parents=True, exist_ok=True)

# Estado em memória da consulta em andamento
_state: dict = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "logs": [],
    "results": [],
}
_state_lock = threading.Lock()

# Estado por CNPJ de download de CND
_dl_state: dict[str, dict] = {}
_dl_lock = threading.Lock()

app = Flask(__name__)


# ── CORS ──────────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    allowed = os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://lexconassessoriacontabil.com.br",
    )
    for o in [s.strip() for s in allowed.split(",") if s.strip()]:
        if origin.startswith(o):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            break
    return response


# ── Helpers ───────────────────────────────────────────────────────────────────

def _limpar_cnpj(c: str) -> str:
    return "".join(ch for ch in (c or "") if ch.isdigit())


def _fmt_cnpj(c: str) -> str:
    c = _limpar_cnpj(c)
    if len(c) != 14:
        return c
    return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"


def _carregar_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning(f"config.json inválido: {e}")
    return {
        "cnpjs": [],  # mantido por compatibilidade — fonte é o frontend
        "email": {
            "remetente": "",
            "senha_app": "",
            "destinatarios": [],
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
        },
        "alertas": {"enviar_resumo_diario": True, "horario_verificacao": "08:00"},
    }


def _salvar_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _carregar_historico() -> list[dict]:
    if HISTORICO_PATH.exists():
        try:
            return json.loads(HISTORICO_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning(f"historico.json inválido: {e}")
    return []


def _salvar_historico(hist: list[dict]) -> None:
    # Mantém apenas as últimas 30 execuções
    HISTORICO_PATH.write_text(
        json.dumps(hist[-30:], ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _links_uteis(cnpj: str) -> dict:
    return {
        "qsa_receita": (
            "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/"
            f"Cnpjreva_Solicitacao.asp?cnpj={cnpj}"
        ),
        "cnd_federal": (
            "https://solucoes.receita.fazenda.gov.br/servicos/certidao/"
            "CNDConjuntaInter/InformaNICertidao.asp?Tipo=2"
        ),
        "crf_fgts": "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf",
    }


def _consultar_um_cnpj(cnpj: str, nome: str) -> dict:
    """Consulta as certidões públicas de UM CNPJ (sem autenticação eCAC).

    Monitora apenas Receita Federal (situação cadastral) e FGTS/CRF.
    """
    cnpj_limpo = _limpar_cnpj(cnpj)
    cadastral: dict | None = None
    alertas: list[str] = []
    status_geral = "OK"

    # ── Situação cadastral via API pública (BrasilAPI / ReceitaWS)
    try:
        rec = consultar_cnpj_receita(cnpj_limpo)
        if rec.get("ok"):
            sit = (rec.get("situacao_cadastral") or "").upper()
            ativa = "ATIV" in sit
            cadastral = {
                "ok": ativa,
                "status": rec.get("situacao_cadastral") or "—",
                "descricao": rec.get("nome") or "",
                "fonte": rec.get("fonte"),
            }
            if not ativa:
                alertas.append(f"Cadastro: {sit or 'não-ativa'}")
                status_geral = "CRITICO"
        else:
            cadastral = {
                "ok": False,
                "status": "INDISPONIVEL",
                "descricao": "Não foi possível consultar a Receita.",
                "fonte": "—",
            }
            alertas.append("Receita indisponível")
            if status_geral == "OK":
                status_geral = "ALERTA"
    except Exception as e:
        log.warning(f"Erro consultando CNPJ na Receita: {e}")
        cadastral = {"ok": False, "status": "ERRO", "descricao": str(e), "fonte": "—"}
        if status_geral == "OK":
            status_geral = "ALERTA"

    # ── CND Federal e FGTS — só link (consulta direta requer autenticação/captcha)
    cnd_federal = {
        "ok": True,
        "status": "CONSULTAR_MANUALMENTE",
        "descricao": "Acesse o portal da RFB/PGFN para emitir a Certidão Conjunta.",
        "fonte": "Receita Federal / PGFN",
    }
    fgts_crf = {
        "ok": True,
        "status": "CONSULTAR_MANUALMENTE",
        "descricao": "Acesse o portal da Caixa para emitir o CRF.",
        "fonte": "Caixa Econômica Federal",
    }

    return {
        "cnpj": cnpj_limpo,
        "nome_empresa": (cadastral and cadastral.get("descricao")) or nome,
        "nome_config": nome,
        "certidoes": {
            "cadastral": cadastral,
            "cnd_federal": cnd_federal,
            "fgts_crf": fgts_crf,
        },
        "links_uteis": _links_uteis(cnpj_limpo),
        "alertas": alertas,
        "status_geral": status_geral,
        "consultado_em": datetime.now().isoformat(timespec="seconds"),
    }


def _executar_consulta_async(cnpjs: list[dict]) -> None:
    with _state_lock:
        _state["running"] = True
        _state["started_at"] = datetime.now().isoformat(timespec="seconds")
        _state["finished_at"] = None
        _state["logs"] = [f"▶ Iniciando consulta de {len(cnpjs)} CNPJ(s)…"]
        _state["results"] = []

    resultados: list[dict] = []
    for i, e in enumerate(cnpjs, 1):
        cnpj = _limpar_cnpj(e.get("cnpj", ""))
        nome = e.get("nome") or cnpj
        if len(cnpj) != 14:
            with _state_lock:
                _state["logs"].append(f"⚠️ CNPJ inválido ignorado: {cnpj}")
            continue

        with _state_lock:
            _state["logs"].append(f"[{i}/{len(cnpjs)}] {nome} — {_fmt_cnpj(cnpj)}…")

        try:
            res = _consultar_um_cnpj(cnpj, nome)
            resultados.append(res)
            with _state_lock:
                emoji = "✅" if res["status_geral"] == "OK" else (
                    "⚠️" if res["status_geral"] == "ALERTA" else "🚨"
                )
                _state["logs"].append(f"  {emoji} {res['status_geral']}")
        except Exception as ex:
            log.exception("Erro consultando CNPJ")
            with _state_lock:
                _state["logs"].append(f"  ❌ ERRO: {ex}")

        time.sleep(0.5)

    finished_at = datetime.now().isoformat(timespec="seconds")
    with _state_lock:
        _state["running"] = False
        _state["finished_at"] = finished_at
        _state["results"] = resultados
        _state["logs"].append(f"✅ Concluído — {len(resultados)} CNPJ(s) consultados.")

    hist = _carregar_historico()
    hist.append({"executado_em": finished_at, "resultados": resultados})
    _salvar_historico(hist)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.route("/", methods=["GET"])
def root():
    return jsonify({"app": "agente-certidoes", "status": "online"})


@app.route("/api/status", methods=["GET", "OPTIONS"])
def api_status():
    if request.method == "OPTIONS":
        return ("", 204)
    with _state_lock:
        return jsonify({
            "running": _state["running"],
            "started_at": _state["started_at"],
            "finished_at": _state["finished_at"],
            "logs": list(_state["logs"]),
            "results": list(_state["results"]),
        })


@app.route("/api/config", methods=["GET", "OPTIONS"])
def api_get_config():
    if request.method == "OPTIONS":
        return ("", 204)
    cfg = _carregar_config()
    cfg["cnpjs"] = []  # fonte agora é o frontend
    return jsonify(cfg)


@app.route("/api/config/email", methods=["POST", "OPTIONS"])
def api_config_email():
    if request.method == "OPTIONS":
        return ("", 204)
    body = request.get_json(silent=True) or {}
    cfg = _carregar_config()
    cfg["email"] = {
        "remetente": body.get("remetente", ""),
        "senha_app": body.get("senha_app", ""),
        "destinatarios": body.get("destinatarios", []) or [],
        "smtp_host": body.get("smtp_host", "smtp.gmail.com"),
        "smtp_port": int(body.get("smtp_port") or 587),
    }
    _salvar_config(cfg)
    return jsonify({"ok": True})


@app.route("/api/consultar", methods=["POST", "OPTIONS"])
def api_consultar():
    if request.method == "OPTIONS":
        return ("", 204)
    if _state["running"]:
        return jsonify({"error": "Já existe uma consulta em andamento."}), 409
    body = request.get_json(silent=True) or {}
    cnpjs = body.get("cnpjs") or []
    if not isinstance(cnpjs, list) or not cnpjs:
        return jsonify({"error": "Envie 'cnpjs': [{cnpj, nome}, …]."}), 400

    threading.Thread(
        target=_executar_consulta_async, args=(cnpjs,), daemon=True
    ).start()
    return jsonify({"ok": True, "total": len(cnpjs)})


@app.route("/api/historico", methods=["GET", "OPTIONS"])
def api_historico():
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify(_carregar_historico())


@app.route("/api/certidoes", methods=["GET", "OPTIONS"])
def api_listar_certidoes():
    if request.method == "OPTIONS":
        return ("", 204)
    arquivos = []
    for f in sorted(
        CERTIDOES_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True
    ):
        # Tenta extrair o CNPJ do nome do arquivo
        digitos = "".join(ch for ch in f.stem if ch.isdigit())
        cnpj = digitos[:14] if len(digitos) >= 14 else ""
        arquivos.append({
            "nome": f.name,
            "cnpj": cnpj,
            "cnpj_fmt": _fmt_cnpj(cnpj) if cnpj else "—",
            "tamanho_kb": round(f.stat().st_size / 1024, 1),
            "data": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m/%Y %H:%M"),
        })
    return jsonify(arquivos)


@app.route("/api/certidoes/arquivo/<path:nome>", methods=["GET"])
def api_baixar_arquivo(nome: str):
    return send_from_directory(CERTIDOES_DIR, nome, as_attachment=True)


@app.route("/api/baixar/cnd/<cnpj>", methods=["POST", "OPTIONS"])
def api_baixar_cnd(cnpj: str):
    if request.method == "OPTIONS":
        return ("", 204)
    cnpj_limpo = _limpar_cnpj(cnpj)
    if len(cnpj_limpo) != 14:
        return jsonify({"error": "CNPJ inválido"}), 400

    with _dl_lock:
        _dl_state[cnpj_limpo] = {"running": True, "resultado": None}

    def _abrir_portal():
        # Abre o portal da Receita Federal para o usuário emitir a certidão.
        # (A consulta direta exige captcha/autenticação — abrir o portal é o caminho seguro.)
        import webbrowser
        url = (
            "https://solucoes.receita.fazenda.gov.br/servicos/certidao/"
            f"CNDConjuntaInter/consultarCertidao.asp?cpfcnpj={cnpj_limpo}"
        )
        try:
            webbrowser.open(url)
            with _dl_lock:
                _dl_state[cnpj_limpo] = {
                    "running": False,
                    "resultado": {
                        "ok": True,
                        "mensagem": "Portal aberto no navegador. Emita a certidão e salve o PDF.",
                        "cnpj_fmt": _fmt_cnpj(cnpj_limpo),
                    },
                }
        except Exception as e:
            with _dl_lock:
                _dl_state[cnpj_limpo] = {
                    "running": False,
                    "resultado": {"ok": False, "mensagem": str(e)},
                }

    threading.Thread(target=_abrir_portal, daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/baixar/status/<cnpj>", methods=["GET", "OPTIONS"])
def api_baixar_status(cnpj: str):
    if request.method == "OPTIONS":
        return ("", 204)
    cnpj_limpo = _limpar_cnpj(cnpj)
    with _dl_lock:
        st = _dl_state.get(cnpj_limpo) or {"running": False, "resultado": None}
    return jsonify(st)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    log.info(f"Agente Certidões iniciado em http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

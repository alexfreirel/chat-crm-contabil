"""
app.py — Interface Web moderna para o Agente Lexcon
Acesse http://localhost:5000 após iniciar.
"""

import json
import os
import sys
import subprocess
import threading
import uuid
import webbrowser
from pathlib import Path
from flask import Flask, render_template, jsonify, request, Response, stream_with_context

BASE_DIR = Path(__file__).parent

# Em producao (Docker), persiste empresas.json num volume montado
_DATA_DIR = Path(os.environ.get("EMPRESAS_DATA_DIR", str(BASE_DIR)))
EMPRESAS_JSON = _DATA_DIR / "empresas.json"

app = Flask(__name__)


# ── CORS para integrar com o frontend Next.js ─────────────────────────────────
@app.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    allowed = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,https://lexconassessoriacontabil.com.br")
    for o in allowed.split(","):
        if o.strip() and origin.startswith(o.strip()):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            break
    return response

# Tarefas em execução: {task_id: {lines, done, returncode}}
_tasks: dict = {}

# Último texto do analítico gerado (para impressão)
_ultimo_analitico: str = ""


# ── Helpers ────────────────────────────────────────────────────────────────────

def fmt_cnpj(cnpj: str) -> str:
    c = cnpj.replace(".", "").replace("/", "").replace("-", "")
    if len(c) == 14:
        return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"
    return cnpj


def carregar() -> list[dict]:
    if EMPRESAS_JSON.exists():
        dados = json.loads(EMPRESAS_JSON.read_text(encoding="utf-8"))
        for i, e in enumerate(dados):
            e["idx"] = i
            e["cnpj_fmt"] = fmt_cnpj(e["cnpj"])
        return dados
    return []


def salvar(empresas: list[dict]):
    campos = ["nome", "cnpj", "usuario", "senha", "inscricao_estadual"]
    clean = [{k: e[k] for k in campos if k in e} for e in empresas]
    EMPRESAS_JSON.write_text(
        json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _rodar_cmd(cmd: list, task_id: str):
    """Executa comando em thread e armazena saída linha a linha."""
    _tasks[task_id] = {"lines": [], "done": False, "returncode": None}
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=str(BASE_DIR),
        )
        for line in proc.stdout:
            _tasks[task_id]["lines"].append(line.rstrip())
        proc.wait()
        _tasks[task_id]["returncode"] = proc.returncode
    except Exception as e:
        _tasks[task_id]["lines"].append(f"ERRO: {e}")
        _tasks[task_id]["returncode"] = 1
    finally:
        _tasks[task_id]["done"] = True


def _iniciar_tarefa(cmd: list) -> str:
    task_id = str(uuid.uuid4())
    threading.Thread(target=_rodar_cmd, args=(cmd, task_id), daemon=True).start()
    return task_id


# ── Rotas principais ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── API: Empresas ──────────────────────────────────────────────────────────────

@app.route("/api/empresas", methods=["GET"])
def get_empresas():
    return jsonify(carregar())


@app.route("/api/empresas", methods=["POST"])
def add_empresa():
    d = request.json or {}
    nome = d.get("nome", "").strip()
    cnpj = d.get("cnpj", "").strip().replace(".", "").replace("/", "").replace("-", "")
    usuario = d.get("usuario", "").strip()
    senha = d.get("senha", "").strip()

    if not all([nome, cnpj, usuario, senha]):
        return jsonify({"error": "Todos os campos são obrigatórios"}), 400
    if len(cnpj) != 14 or not cnpj.isdigit():
        return jsonify({"error": "CNPJ inválido — informe 14 dígitos"}), 400

    empresas = carregar()
    if any(e["cnpj"] == cnpj for e in empresas):
        return jsonify({"error": "CNPJ já cadastrado"}), 400

    inscricao = d.get("inscricao_estadual", "").strip()
    entry: dict = {"nome": nome, "cnpj": cnpj, "usuario": usuario, "senha": senha}
    if inscricao:
        entry["inscricao_estadual"] = inscricao
    empresas.append(entry)
    salvar(empresas)
    return jsonify({"ok": True, "total": len(empresas)})


@app.route("/api/empresas/<int:idx>", methods=["PUT"])
def update_empresa(idx):
    empresas = carregar()
    if idx < 0 or idx >= len(empresas):
        return jsonify({"error": "Empresa não encontrada"}), 404

    d = request.json or {}
    e = empresas[idx]
    if d.get("nome"):
        e["nome"] = d["nome"].strip()
    if d.get("usuario"):
        e["usuario"] = d["usuario"].strip()
    if d.get("senha"):
        e["senha"] = d["senha"].strip()
    if "inscricao_estadual" in d:
        val = d["inscricao_estadual"].strip()
        if val:
            e["inscricao_estadual"] = val
        else:
            e.pop("inscricao_estadual", None)

    salvar(empresas)
    return jsonify({"ok": True})


@app.route("/api/empresas/todas", methods=["DELETE"])
def delete_todas():
    salvar([])
    return jsonify({"ok": True})


@app.route("/api/empresas/<int:idx>", methods=["DELETE"])
def delete_empresa(idx):
    empresas = carregar()
    if idx < 0 or idx >= len(empresas):
        return jsonify({"error": "Empresa não encontrada"}), 404
    removida = empresas.pop(idx)
    salvar(empresas)
    return jsonify({"ok": True, "nome": removida["nome"]})


@app.route("/api/empresas/<int:idx>/abrir-portal", methods=["POST"])
def abrir_portal(idx):
    """Abre o Portal do Contribuinte SEFAZ AL com login automático para a empresa."""
    empresas = carregar()
    if idx < 0 or idx >= len(empresas):
        return jsonify({"error": "Empresa não encontrada"}), 404
    e = empresas[idx]
    cmd = [sys.executable, str(BASE_DIR / "abrir_portal_sefaz.py"), e["usuario"], e["senha"]]
    task_id = _iniciar_tarefa(cmd)
    return jsonify({"ok": True, "task_id": task_id, "nome": e["nome"]})


# ── API: Streaming de tarefas (SSE) ────────────────────────────────────────────

@app.route("/api/tarefa/<task_id>/stream")
def stream_tarefa(task_id):
    def generate():
        import time
        sent = 0
        while True:
            if task_id not in _tasks:
                time.sleep(0.15)
                continue

            t = _tasks[task_id]
            lines = t["lines"]
            while sent < len(lines):
                yield f"data: {lines[sent]}\n\n"
                sent += 1

            if t["done"]:
                rc = t.get("returncode", 0)
                if rc == 0:
                    yield "data: ✔  Concluído com sucesso.\n\n"
                else:
                    yield f"data: ✖  Encerrado com erro (código {rc}).\n\n"
                yield "event: done\ndata: done\n\n"
                break

            time.sleep(0.1)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── API: Certidões ────────────────────────────────────────────────────────────

@app.route("/api/certidoes", methods=["POST"])
def baixar_certidoes():
    """
    Baixa certidões CND para um CNPJ (sessão e-CAC já autenticada via cookies salvos).
    Body: { cnpj, tipos?, destino? }
    """
    d = request.json or {}
    cnpj   = d.get("cnpj", "").strip().replace(".", "").replace("/", "").replace("-", "")
    tipos  = d.get("tipos", None)  # None = todos
    destino = d.get("destino", "").strip()

    if not cnpj or len(cnpj) != 14:
        return jsonify({"error": "CNPJ inválido"}), 400

    empresas = carregar()
    empresa  = next((e for e in empresas if e["cnpj"].replace(".", "").replace("/", "").replace("-", "") == cnpj), None)

    # Pasta de destino
    mes_str = __import__("datetime").date.today().strftime("%Y-%m")
    pasta   = Path(destino) if destino else (BASE_DIR / "downloads" / mes_str / (empresa["nome"] if empresa else cnpj))

    # Consulta pública — sem precisar de sessão e-CAC para dados básicos
    sys.path.insert(0, str(BASE_DIR))
    try:
        from certidoes_agent import consultar_cnpj_receita, consultar_simples_nacional
        cnpj_info   = consultar_cnpj_receita(cnpj)
        simples_info = consultar_simples_nacional(cnpj)
        return jsonify({
            "ok": True,
            "cnpj": cnpj,
            "dados_receita": cnpj_info,
            "simples_nacional": simples_info,
            "nota": "Para download das CNDs completas, autentique-se via e-CAC no menu principal.",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/certidoes/task", methods=["POST"])
def baixar_certidoes_task():
    """
    Inicia tarefa de download de certidões via sessão e-CAC autenticada.
    Body: { cnpj, tipos? }
    """
    d      = request.json or {}
    cnpj   = d.get("cnpj", "").strip()
    tipos  = d.get("tipos", ["CND_FEDERAL"])

    if not cnpj:
        return jsonify({"error": "CNPJ é obrigatório"}), 400

    cmd = [sys.executable, str(BASE_DIR / "certidoes_agent.py"), "--cnpj", cnpj]
    return jsonify({"task_id": _iniciar_tarefa(cmd)})


@app.route("/api/certidao-estadual", methods=["POST"])
def certidao_estadual():
    """
    Baixa certidão estadual do Portal do Contribuinte SEFAZ-AL.
    Se a certidão for POSITIVA, baixa também o extrato de pendência de débitos.
    Body: { cnpj }
    """
    d = request.json or {}
    cnpj = d.get("cnpj", "").strip().replace(".", "").replace("/", "").replace("-", "")

    if not cnpj:
        return jsonify({"error": "CNPJ é obrigatório"}), 400

    empresas = carregar()
    empresa = next((e for e in empresas if e["cnpj"].replace(".", "").replace("/", "").replace("-", "") == cnpj), None)

    if not empresa:
        return jsonify({"error": "Empresa não encontrada no cadastro"}), 404

    cmd = [sys.executable, str(BASE_DIR / "certidao_sefaz.py"), "--cnpj", cnpj]
    return jsonify({"task_id": _iniciar_tarefa(cmd), "nome": empresa["nome"]})


@app.route("/api/das", methods=["POST"])
def baixar_das():
    """
    Baixa guia DAS para o CNPJ / competência.
    Body: { cnpj, regime?, competencia?, destino? }
    """
    d          = request.json or {}
    cnpj       = d.get("cnpj", "").strip()
    regime     = d.get("regime", "SIMPLES_NACIONAL").upper()
    competencia = d.get("competencia", "").strip()  # AAAA-MM
    destino    = d.get("destino", "").strip()

    if not cnpj:
        return jsonify({"error": "CNPJ é obrigatório"}), 400

    cmd = [sys.executable, str(BASE_DIR / "das_agent.py"),
           "--cnpj", cnpj, "--regime", regime]
    if competencia:
        cmd += ["--comp", competencia]
    if destino:
        cmd += ["--destino", destino]

    return jsonify({"task_id": _iniciar_tarefa(cmd)})


@app.route("/api/consultar-cnpj", methods=["POST"])
def consultar_cnpj():
    """Consulta dados públicos de um CNPJ. Body: { cnpj }"""
    d    = request.json or {}
    cnpj = d.get("cnpj", "").strip().replace(".", "").replace("/", "").replace("-", "")
    if not cnpj or len(cnpj) != 14:
        return jsonify({"error": "CNPJ inválido"}), 400

    sys.path.insert(0, str(BASE_DIR))
    try:
        from certidoes_agent import consultar_cnpj_receita, consultar_simples_nacional
        return jsonify({
            "receita": consultar_cnpj_receita(cnpj),
            "simples": consultar_simples_nacional(cnpj),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── API: Ações ─────────────────────────────────────────────────────────────────

@app.route("/api/selecionar-pasta", methods=["POST"])
def selecionar_pasta():
    """Abre diálogo nativo do Windows para selecionar pasta de destino."""
    d = request.json or {}
    pasta_inicial = d.get("pastaInicial", str(BASE_DIR / "downloads"))

    ps = f"""
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Selecione a pasta de destino'
$dlg.SelectedPath = '{pasta_inicial.replace(chr(39), "")}'
$dlg.ShowNewFolderButton = $true
if ($dlg.ShowDialog() -eq 'OK') {{
    Write-Output $dlg.SelectedPath
}} else {{
    Write-Output ''
}}
"""
    import tempfile
    import subprocess as _sp
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as f:
            f.write(ps)
            ps_path = f.name
        res = _sp.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
             "-WindowStyle", "Normal", "-File", ps_path],
            capture_output=True, text=True, timeout=60,
        )
        os.unlink(ps_path)
        pasta = res.stdout.strip()
        if pasta:
            return jsonify({"pasta": pasta})
        return jsonify({"pasta": ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/baixar-sefaz", methods=["POST"])
def baixar_sefaz():
    d = request.json or {}
    mes = d.get("mes", "").strip()
    cnpj = d.get("cnpj", "").strip()
    destino = d.get("destino", "").strip()
    if not mes:
        return jsonify({"error": "Mês é obrigatório"}), 400

    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--mes", mes]
    if cnpj:
        cmd += ["--cnpj", cnpj]
    if destino:
        cmd += ["--destino", destino]

    return jsonify({"task_id": _iniciar_tarefa(cmd)})


@app.route("/api/analitico", methods=["POST"])
def run_analitico():
    global _ultimo_analitico
    d = request.json or {}
    mes  = d.get("mes", "").strip()
    cnpj = d.get("cnpj", "").strip()
    if not mes:
        return jsonify({"error": "Mês é obrigatório"}), 400

    task_id = str(uuid.uuid4())

    def _run():
        global _ultimo_analitico
        _tasks[task_id] = {"lines": [], "done": False, "returncode": 0}
        try:
            import io
            sys.path.insert(0, str(BASE_DIR))
            from analitico import exibir_analitico
            buf = io.StringIO()
            exibir_analitico(mes, BASE_DIR / "downloads" / mes, destino=buf, cnpj_filtro=cnpj)
            txt = buf.getvalue()
            _ultimo_analitico = txt
            for line in txt.splitlines():
                _tasks[task_id]["lines"].append(line)
        except Exception as e:
            _tasks[task_id]["lines"].append(f"ERRO: {e}")
            _tasks[task_id]["returncode"] = 1
        finally:
            _tasks[task_id]["done"] = True

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"task_id": task_id})


@app.route("/api/analitico/imprimir", methods=["POST", "GET"])
def imprimir_analitico():
    """Retorna o relatório analítico como HTML para impressão no navegador."""
    global _ultimo_analitico
    if not _ultimo_analitico:
        return jsonify({"error": "Nenhum relatório gerado ainda"}), 400

    from flask import Response
    txt = _ultimo_analitico
    # Escapar HTML e converter para <pre> com estilo de impressão
    import html as _html
    escaped = _html.escape(txt)
    page = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Relatório Analítico</title>
<style>
  @media print {{ @page {{ size: landscape; margin: 15mm; }} body {{ margin: 0; }} }}
  body {{ font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4; background: #fff; color: #000; padding: 20px; }}
  pre {{ white-space: pre-wrap; word-wrap: break-word; }}
</style></head><body><pre>{escaped}</pre>
<script>window.print();</script></body></html>"""
    return Response(page, mimetype="text/html")


@app.route("/api/parcelamentos/analisar", methods=["POST"])
def analisar_parcelamentos():
    d = request.json or {}
    mes = d.get("mes", "").strip()
    if not mes:
        return jsonify({"error": "Mês é obrigatório"}), 400

    task_id = str(uuid.uuid4())

    def _run():
        _tasks[task_id] = {"lines": [], "done": False, "returncode": 0}
        try:
            import io
            sys.path.insert(0, str(BASE_DIR))
            from analitico import exibir_parcelamentos
            buf = io.StringIO()
            exibir_parcelamentos(mes, BASE_DIR / "downloads" / mes, destino=buf)
            for line in buf.getvalue().splitlines():
                _tasks[task_id]["lines"].append(line)
        except Exception as e:
            _tasks[task_id]["lines"].append(f"ERRO: {e}")
            _tasks[task_id]["returncode"] = 1
        finally:
            _tasks[task_id]["done"] = True

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"task_id": task_id})


@app.route("/api/parcelamentos/emitir", methods=["POST"])
def emitir_parcelas():
    d = request.json or {}
    cnpj = d.get("cnpj", "").strip()
    destino = d.get("destino", "").strip()

    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--modo", "emitir-parcelas"]
    if cnpj:
        cmd += ["--cnpj", cnpj]
    if destino:
        cmd += ["--destino", destino]

    return jsonify({"task_id": _iniciar_tarefa(cmd)})


@app.route("/api/impostos-sefaz", methods=["POST"])
def impostos_sefaz():
    d = request.json or {}
    cnpj = d.get("cnpj", "").strip()
    destino = d.get("destino", "").strip()
    mes = d.get("mes", "").strip()

    cmd = [sys.executable, str(BASE_DIR / "agente_nfe_claude.py"), "--modo", "impostos"]
    if cnpj:
        cmd += ["--cnpj", cnpj]
    if destino:
        cmd += ["--destino", destino]
    if mes:
        cmd += ["--mes", mes]

    return jsonify({"task_id": _iniciar_tarefa(cmd)})


# ── API: Arquivos (listar / baixar / ZIP) ─────────────────────────────────────

@app.route("/api/arquivos/<mes>")
def listar_arquivos(mes):
    """Lista todos os PDFs baixados para um mês."""
    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        return jsonify({"files": [], "total": 0})

    files = []
    for f in sorted(download_dir.rglob("*.pdf")):
        rel = f.relative_to(download_dir)
        files.append({
            "nome": f.name,
            "caminho": str(rel).replace("\\", "/"),
            "empresa": str(rel.parts[0]) if len(rel.parts) > 1 else "",
            "tamanho": f.stat().st_size,
        })
    return jsonify({"files": files, "total": len(files)})


@app.route("/api/arquivos/<mes>/download")
def baixar_arquivo(mes):
    """Baixa um arquivo individual. Query param: path=empresa/relatorio/file.pdf"""
    from flask import send_file
    rel_path = request.args.get("path", "")
    if not rel_path:
        return jsonify({"error": "path é obrigatório"}), 400

    arquivo = (BASE_DIR / "downloads" / mes / rel_path).resolve()
    download_dir = (BASE_DIR / "downloads" / mes).resolve()

    # Segurança: impedir path traversal
    if not str(arquivo).startswith(str(download_dir)):
        return jsonify({"error": "Caminho inválido"}), 403

    if not arquivo.exists():
        return jsonify({"error": "Arquivo não encontrado"}), 404

    return send_file(str(arquivo), as_attachment=True, download_name=arquivo.name)


@app.route("/api/arquivos/<mes>/zip")
def baixar_zip(mes):
    """Baixa todos os PDFs do mês como ZIP."""
    import zipfile
    import tempfile
    from flask import send_file

    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        return jsonify({"error": "Nenhum arquivo encontrado"}), 404

    pdfs = list(download_dir.rglob("*.pdf"))
    if not pdfs:
        return jsonify({"error": "Nenhum PDF encontrado"}), 404

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
        for pdf in pdfs:
            arcname = str(pdf.relative_to(download_dir))
            zf.write(pdf, arcname)
    tmp.close()

    return send_file(
        tmp.name,
        as_attachment=True,
        download_name=f"relatorios-sefaz-{mes}.zip",
        mimetype="application/zip",
    )


@app.route("/api/arquivos/<mes>/zip/impostos")
def baixar_zip_impostos(mes):
    """Baixa apenas os DARs (dar-*.pdf) do mês como ZIP, organizados por empresa."""
    import zipfile
    import tempfile
    from flask import send_file

    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        return jsonify({"error": "Nenhum arquivo encontrado"}), 404

    # Inclui: DARs (PDF) e relatórios PDF por grupo — sem arquivos .txt
    arquivos = [
        p for p in download_dir.rglob("*")
        if p.is_file() and p.suffix == ".pdf" and (
            p.name.startswith("dar-") or p.name.startswith("relatorio-")
        )
    ]
    if not arquivos:
        return jsonify({"error": "Nenhum arquivo de impostos encontrado para este mês"}), 404

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in arquivos:
            arcname = str(p.relative_to(download_dir))
            zf.write(p, arcname)
    tmp.close()

    return send_file(
        tmp.name,
        as_attachment=True,
        download_name=f"impostos-sefaz-{mes}.zip",
        mimetype="application/zip",
    )


@app.route("/api/arquivos/<mes>/arquivo", methods=["DELETE"])
def deletar_arquivo(mes):
    """Exclui um arquivo individual. Query param: path=empresa/relatorio/file.pdf"""
    rel_path = request.args.get("path", "")
    if not rel_path:
        return jsonify({"error": "path é obrigatório"}), 400

    arquivo = (BASE_DIR / "downloads" / mes / rel_path).resolve()
    download_dir = (BASE_DIR / "downloads" / mes).resolve()

    if not str(arquivo).startswith(str(download_dir)):
        return jsonify({"error": "Caminho inválido"}), 403

    if not arquivo.exists():
        return jsonify({"error": "Arquivo não encontrado"}), 404

    arquivo.unlink()
    return jsonify({"ok": True, "removido": rel_path})


@app.route("/api/arquivos/<mes>", methods=["DELETE"])
def deletar_todos_arquivos(mes):
    """Exclui todos os arquivos PDFs do mês."""
    import shutil
    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        return jsonify({"ok": True, "removidos": 0})

    pdfs = list(download_dir.rglob("*.pdf"))
    count = len(pdfs)
    for pdf in pdfs:
        pdf.unlink()

    # Remove subpastas vazias
    for subdir in sorted(download_dir.rglob("*"), reverse=True):
        if subdir.is_dir():
            try:
                subdir.rmdir()
            except OSError:
                pass

    return jsonify({"ok": True, "removidos": count})


# ── API: Gerenciar períodos (listar / apagar) ─────────────────────────────────

@app.route("/api/periodos")
def listar_periodos():
    """Lista todos os períodos (meses) que têm relatórios baixados."""
    downloads = BASE_DIR / "downloads"
    if not downloads.exists():
        return jsonify({"periodos": []})

    periodos = []
    for pasta in sorted(downloads.iterdir(), reverse=True):
        if pasta.is_dir() and len(pasta.name) >= 7:
            pdfs = list(pasta.rglob("*.pdf"))
            total_bytes = sum(f.stat().st_size for f in pdfs)
            empresas = set()
            for f in pdfs:
                rel = f.relative_to(pasta)
                if len(rel.parts) > 1:
                    empresas.add(rel.parts[0])
            periodos.append({
                "mes": pasta.name,
                "arquivos": len(pdfs),
                "empresas": len(empresas),
                "tamanho_mb": round(total_bytes / (1024 * 1024), 1),
            })
    return jsonify({"periodos": periodos})


@app.route("/api/periodos/<mes>", methods=["DELETE"])
def apagar_periodo(mes):
    """Apaga todos os relatórios de um período (mês)."""
    import shutil
    download_dir = BASE_DIR / "downloads" / mes
    if not download_dir.exists():
        return jsonify({"error": f"Período {mes} não encontrado"}), 404

    # Conta antes de apagar
    pdfs = list(download_dir.rglob("*.pdf"))
    total = len(pdfs)

    shutil.rmtree(download_dir)
    return jsonify({"ok": True, "mes": mes, "arquivos_removidos": total})


# ── API: Cálculo ICMS ST ───────────────────────────────────────────────────────

CUSTOM_NCM_JSON = BASE_DIR / "ncm_mva_custom.json"
_BASE_IDX_NCM = None  # índice base carregado uma vez


def _carregar_custom() -> list:
    if CUSTOM_NCM_JSON.exists():
        return json.loads(CUSTOM_NCM_JSON.read_text(encoding="utf-8"))
    return []


def _salvar_custom(entries: list):
    CUSTOM_NCM_JSON.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def _get_idx_ncm_st() -> dict:
    global _BASE_IDX_NCM
    if _BASE_IDX_NCM is None:
        sys.path.insert(0, str(BASE_DIR))
        from calcular_icms_st import carregar_base_ncm
        _BASE_IDX_NCM = carregar_base_ncm()
    # Mescla entradas customizadas (têm prioridade sobre a base)
    idx = dict(_BASE_IDX_NCM)
    for entry in _carregar_custom():
        ncm = entry.get("ncm", "")
        if ncm:
            idx[ncm] = [entry]
    return idx


@app.route("/api/icms-st/ncm-custom", methods=["GET"])
def listar_ncm_custom():
    return jsonify(_carregar_custom())


@app.route("/api/icms-st/ncm-custom", methods=["POST"])
def add_ncm_custom():
    d = request.json or {}
    ncm = "".join(c for c in d.get("ncm", "") if c.isdigit())
    if not ncm:
        return jsonify({"error": "NCM é obrigatório"}), 400

    mva_interno = d.get("mva_interno")
    if mva_interno is None or str(mva_interno).strip() == "":
        return jsonify({"error": "MVA Interno é obrigatório"}), 400

    def _opt_float(val):
        try:
            return float(val) if val not in (None, "", "null") else None
        except (ValueError, TypeError):
            return None

    entry = {
        "ncm": ncm,
        "cest": d.get("cest", "").strip(),
        "descricao": d.get("descricao", "Cadastro manual").strip(),
        "mva_interno": float(mva_interno),
        "mva_ajustada_12": _opt_float(d.get("mva_ajustada_12")),
        "mva_ajustada_7": _opt_float(d.get("mva_ajustada_7")),
        "mva_ajustada_4": _opt_float(d.get("mva_ajustada_4")),
        "custom": True,
    }

    entries = _carregar_custom()
    idx_exist = next((i for i, e in enumerate(entries) if e.get("ncm") == ncm), None)
    if idx_exist is not None:
        entries[idx_exist] = entry
    else:
        entries.append(entry)
    _salvar_custom(entries)
    return jsonify({"ok": True, "ncm": ncm})


@app.route("/api/icms-st/ncm-info/<ncm_param>", methods=["GET"])
def info_ncm(ncm_param):
    """Verifica se um NCM existe na base oficial ou no cadastro manual."""
    ncm = "".join(c for c in ncm_param if c.isdigit())
    if not ncm:
        return jsonify({"encontrado": False}), 200

    # Verifica custom primeiro
    for entry in _carregar_custom():
        if entry.get("ncm") == ncm:
            return jsonify({"encontrado": True, "fonte": "custom", "registro": entry})

    # Verifica base oficial (sem merge — busca direta no índice base)
    global _BASE_IDX_NCM
    if _BASE_IDX_NCM is None:
        sys.path.insert(0, str(BASE_DIR))
        from calcular_icms_st import carregar_base_ncm
        _BASE_IDX_NCM = carregar_base_ncm()

    if ncm in _BASE_IDX_NCM:
        return jsonify({"encontrado": True, "fonte": "base", "registro": _BASE_IDX_NCM[ncm][0]})

    return jsonify({"encontrado": False})


@app.route("/api/icms-st/ncm-custom/<ncm_param>", methods=["DELETE"])
def delete_ncm_custom(ncm_param):
    ncm = "".join(c for c in ncm_param if c.isdigit())
    entries = [e for e in _carregar_custom() if e.get("ncm") != ncm]
    _salvar_custom(entries)
    return jsonify({"ok": True})


@app.route("/api/icms-st/calcular", methods=["POST", "OPTIONS"])
def calcular_icms_st_endpoint():
    if request.method == "OPTIONS":
        return "", 204

    import tempfile as _tmp
    import uuid as _uuid
    from datetime import datetime as _dt

    arquivos = request.files.getlist("xmls")
    if not arquivos or all(f.filename == "" for f in arquivos):
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    sessao = _uuid.uuid4().hex[:8]
    tmp_dir = Path(_tmp.mkdtemp())

    salvos = []
    for f in arquivos:
        if not f.filename.lower().endswith(".xml"):
            continue
        dest = tmp_dir / Path(f.filename).name
        f.save(str(dest))
        salvos.append(str(dest))

    if not salvos:
        return jsonify({"erro": "Envie arquivos .xml válidos."}), 400

    sys.path.insert(0, str(BASE_DIR))
    from calcular_icms_st import processar_nfe, exportar_excel

    idx_ncm = _get_idx_ncm_st()
    resultados_raw = [processar_nfe(xml, idx_ncm) for xml in salvos]

    def _serial(res):
        out = {}
        for k, v in res.items():
            if k == "itens":
                continue
            if isinstance(v, float):
                out[k] = round(v, 2)
            else:
                out[k] = v
        return out

    resultados = [_serial(r) for r in resultados_raw]

    relat_dir = BASE_DIR / "relatorios-st"
    relat_dir.mkdir(exist_ok=True)
    ts = _dt.now().strftime("%Y%m%d_%H%M%S")
    nome_xlsx = f"ICMS_ST_AL_{ts}_{sessao}.xlsx"
    exportar_excel(resultados_raw, str(relat_dir / nome_xlsx))

    return jsonify({
        "resultados": resultados,
        "sessao": sessao,
        "arquivo_excel": nome_xlsx,
        "total_nfes": len(resultados),
        "total_st": round(sum(r.get("total_icms_st", 0) for r in resultados), 2),
        "total_bc_st": round(sum(r.get("total_bc_st", 0) for r in resultados), 2),
        "total_icms_proprio": round(sum(r.get("total_icms_proprio", 0) for r in resultados), 2),
    })


@app.route("/api/icms-st/download/<nome_arquivo>")
def download_icms_st(nome_arquivo):
    from flask import send_file as _sf
    caminho = BASE_DIR / "relatorios-st" / nome_arquivo
    if not caminho.exists() or not caminho.name.endswith(".xlsx"):
        return jsonify({"error": "Arquivo não encontrado"}), 404
    return _sf(
        str(caminho),
        as_attachment=True,
        download_name=nome_arquivo,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ── Entrada ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = 5000
    print()
    print("  ╔══════════════════════════════════════╗")
    print("  ║     Agente Lexcon — Interface Web    ║")
    print(f"  ║   Acesse: http://localhost:{port}      ║")
    print("  ║   Pressione Ctrl+C para encerrar     ║")
    print("  ╚══════════════════════════════════════╝")
    print()
    webbrowser.open(f"http://localhost:{port}")
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)

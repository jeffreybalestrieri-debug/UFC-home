#!/usr/bin/env python3
"""UFC Homebase — local dev server. Proxies OpticOdds API requests so the
browser can call /api/odds-proxy without CORS issues. Not needed in production
(Netlify Function handles it there)."""

import json
from pathlib import Path
from urllib import request as urllib_request
from urllib.parse import urlencode

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).parent.resolve()
KEY = "e69544ed-dadf-4260-9024-e83adfad1491"

app = Flask(__name__, static_folder=str(BASE_DIR))


@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/api/status")
def status():
    return jsonify({"ok": True})


@app.route("/api/odds-proxy")
def odds_proxy():
    path   = request.args.get("_path", "")
    params = {k: v for k, v in request.args.items() if k != "_path"}

    url = f"https://api.opticodds.com/api/v3/{path}"
    if params:
        url += "?" + urlencode(params)

    req = urllib_request.Request(url, headers={"X-Api-Key": KEY, "Accept": "application/json"})
    try:
        with urllib_request.urlopen(req, timeout=30) as resp:
            return resp.read(), 200, {"Content-Type": "application/json"}
    except Exception as e:
        return json.dumps({"error": str(e)}), 500, {"Content-Type": "application/json"}


if __name__ == "__main__":
    print(f"\nUFC Homebase → http://localhost:3001\n")
    app.run(port=3001, debug=False)

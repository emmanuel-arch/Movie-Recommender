"""
One-shot sanity check — verifies that the Supabase project reachable at
$SUPABASE_URL contains every table, view, and RPC the app depends on.

Usage:
    python infra/supabase/_verify_schema.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Load src/api/.env if python-dotenv is available so we don't require shell exports.
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(Path(__file__).resolve().parents[2] / "src" / "api" / ".env")
except Exception:
    pass

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

if not URL or not KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
    sys.exit(2)

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Accept": "application/json",
}

TABLES = [
    "profiles",
    "watch_sessions",
    "monthly_usage",
    "ratings",
    "kenyan_movies",
    "notifications",
]
VIEWS = ["continue_watching"]
RPCS = ["update_monthly_usage"]


def _get(path: str, extra_headers: dict | None = None) -> tuple[int, str]:
    req = urllib.request.Request(f"{URL}{path}", headers={**HEADERS, **(extra_headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def _post(path: str, body: dict) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{URL}{path}",
        data=data,
        headers={**HEADERS, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def check_table(name: str) -> tuple[bool, str]:
    status, body = _get(f"/rest/v1/{name}?select=*&limit=0", {"Prefer": "count=exact"})
    if status in (200, 206):
        # 206 = PostgREST's partial-content response when count=exact + a LIMIT.
        return True, "ok"
    if status == 404:
        return False, "404 not found"
    if status == 401:
        return False, "401 unauthorized (bad key?)"
    return False, f"HTTP {status}: {body[:200]}"


def check_rpc(name: str) -> tuple[bool, str]:
    # POST with empty body; update_monthly_usage returns void.
    status, body = _post(f"/rest/v1/rpc/{name}", {})
    if status in (200, 204):
        return True, "ok"
    if status == 404:
        return False, "404 not found (RPC missing)"
    return False, f"HTTP {status}: {body[:200]}"


def main() -> int:
    print(f"Project: {URL}")
    print("=" * 60)

    all_ok = True

    print("Tables:")
    for t in TABLES:
        ok, msg = check_table(t)
        mark = "OK  " if ok else "FAIL"
        print(f"  [{mark}] public.{t:<18} {msg}")
        all_ok &= ok

    print("\nViews:")
    for v in VIEWS:
        ok, msg = check_table(v)
        mark = "OK  " if ok else "FAIL"
        print(f"  [{mark}] public.{v:<18} {msg}")
        all_ok &= ok

    print("\nRPCs:")
    for r in RPCS:
        ok, msg = check_rpc(r)
        mark = "OK  " if ok else "FAIL"
        print(f"  [{mark}] public.{r:<18} {msg}")
        all_ok &= ok

    print("=" * 60)
    if all_ok:
        print("All required schema objects are present. Platform ready.")
        return 0
    print("Some objects are missing. Run infra/supabase/schema.sql in the Supabase SQL editor.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

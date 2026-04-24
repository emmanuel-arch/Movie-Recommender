"""
End-to-end exercise of the BirgenAI auth + profile stack against the live
Supabase project. This mirrors exactly what the /signup → /profiles flow
does from the browser, so if this passes the UI works.

Run:
    python infra/supabase/_e2e_auth_test.py

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from src/api/.env.
Creates a throw-away confirmed user via the admin endpoint, walks it
through BIR-ID lookup → password sign-in → watching_profile create/read/
delete → teardown.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).resolve().parents[2] / "src" / "api" / ".env")
except Exception:
    pass

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

if not (URL and SERVICE):
    print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.", file=sys.stderr)
    sys.exit(2)

# Anon/publishable key (for the "browser" half of the test). Using the
# service key also works since PostgREST just checks the JWT, but the
# browser side of the flow uses the publishable key — so do the same here
# to catch any RLS/role surprises. Falls back to the service key if the
# anon key isn't set in the env, which is fine for this script (server-side).
ANON = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or SERVICE
)


def _req(method: str, path: str, *, headers: dict, body: dict | None = None) -> tuple[int, dict | str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{URL}{path}",
        data=data,
        headers={"Content-Type": "application/json", **headers},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, raw


def _admin(headers_extra: dict | None = None) -> dict:
    return {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", **(headers_extra or {})}


def _anon(token: str | None = None) -> dict:
    return {"apikey": ANON, "Authorization": f"Bearer {token or ANON}"}


def step(msg: str) -> None:
    print(f"\n-> {msg}")


def check(cond: bool, msg: str) -> None:
    if cond:
        print(f"  [OK ] {msg}")
    else:
        print(f"  [FAIL] {msg}")
        raise SystemExit(1)


def main() -> int:
    # Unique throw-away identity.
    test_id = uuid.uuid4().hex[:10]
    email = f"e2e-{test_id}@birgenai.test"
    password = f"Pw-{test_id}-{uuid.uuid4().hex[:6]}"

    print(f"Project  : {URL}")
    print(f"Test user: {email}")

    # ── 1. Admin-create a confirmed user (skips email confirmation) ─────────
    step("admin create user (email_confirm=true)")
    status, body = _req(
        "POST",
        "/auth/v1/admin/users",
        headers=_admin(),
        body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": "E2E Tester"},
        },
    )
    check(status in (200, 201), f"admin create user returned {status}: {body}")
    user_id = body.get("id") if isinstance(body, dict) else None
    check(bool(user_id), f"got user id: {user_id}")

    try:
        # Supabase trigger runs after auth.users insert; give it a breath.
        time.sleep(1.0)

        # ── 2. Profile row exists with birgenai_id ─────────────────────────
        step("profiles row has birgenai_id (BIR-XXXXXXXX)")
        status, body = _req(
            "GET",
            f"/rest/v1/profiles?id=eq.{user_id}&select=id,display_name,birgenai_id",
            headers=_admin(),
        )
        check(status == 200 and isinstance(body, list) and len(body) == 1, f"profile lookup {status}: {body}")
        row = body[0]
        birgenai_id = row.get("birgenai_id")
        check(bool(birgenai_id) and birgenai_id.startswith("BIR-"), f"birgenai_id is {birgenai_id}")

        # ── 3. email_for_birgenai_id RPC returns the right email ───────────
        step("email_for_birgenai_id RPC resolves to the signup email")
        status, body = _req(
            "POST",
            "/rest/v1/rpc/email_for_birgenai_id",
            headers=_anon(),
            body={"p_birgenai_id": birgenai_id},
        )
        check(status == 200, f"rpc returned {status}: {body}")
        check(body == email, f"rpc returned email: {body}")

        # ── 4. Password sign-in works (via /auth/v1/token?grant_type=password)
        step("password sign-in returns an access_token")
        status, body = _req(
            "POST",
            "/auth/v1/token?grant_type=password",
            headers={"apikey": ANON},
            body={"email": email, "password": password},
        )
        check(status == 200 and isinstance(body, dict) and "access_token" in body, f"sign-in {status}: {body}")
        access_token = body["access_token"]

        # ── 5. As the authenticated user, create a watching_profile ────────
        step("create watching_profile as the authed user")
        status, body = _req(
            "POST",
            "/rest/v1/watching_profiles",
            headers={**_anon(access_token), "Prefer": "return=representation"},
            body={
                "user_id": user_id,
                "name": "Faith",
                "avatar_key": "ember",
                "is_kids": False,
                "is_default": True,
            },
        )
        check(status in (200, 201), f"insert watching_profile {status}: {body}")
        wp_id = body[0]["id"] if isinstance(body, list) else body.get("id")
        check(bool(wp_id), f"watching_profile id: {wp_id}")

        # ── 6. Read back through RLS (should see exactly our one profile) ─
        step("authed user lists their own watching_profiles (RLS scoped)")
        status, body = _req(
            "GET",
            "/rest/v1/watching_profiles?select=*",
            headers=_anon(access_token),
        )
        check(status == 200 and isinstance(body, list), f"select {status}: {body}")
        check(len(body) == 1 and body[0]["id"] == wp_id, f"saw exactly our row: {body}")

        # ── 7. Anon (no session) must NOT see anyone else's watching_profiles
        step("anon (no session) sees zero rows (RLS denies)")
        status, body = _req(
            "GET",
            "/rest/v1/watching_profiles?select=id",
            headers=_anon(),
        )
        check(status == 200 and isinstance(body, list) and body == [], f"anon saw: {body}")

        print("\nAll flow checks passed -- login + profiles wiring is live.")
        return 0
    finally:
        # ── Teardown ───────────────────────────────────────────────────────
        step("cleanup: delete test auth user (cascades to profile + watching_profiles)")
        status, _ = _req("DELETE", f"/auth/v1/admin/users/{user_id}", headers=_admin())
        print(f"  cleanup status: {status}")


if __name__ == "__main__":
    sys.exit(main())

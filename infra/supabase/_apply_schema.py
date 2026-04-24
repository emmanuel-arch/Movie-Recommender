"""
Apply infra/supabase/schema.sql (and optionally seed_kenyan_movies.sql) to a
Supabase project using the direct Postgres connection.

Usage:
    set SUPABASE_DB_URL=postgres://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
    python infra/supabase/_apply_schema.py [--seed]

If SUPABASE_DB_URL isn't set, falls back to building the URL from:
    SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
SCHEMA = HERE / "schema.sql"
SEED = HERE / "seed_kenyan_movies.sql"


def build_dsn() -> str:
    dsn = os.environ.get("SUPABASE_DB_URL")
    if dsn:
        return dsn
    ref = os.environ.get("SUPABASE_PROJECT_REF")
    pwd = os.environ.get("SUPABASE_DB_PASSWORD")
    if not (ref and pwd):
        print("ERROR: set SUPABASE_DB_URL or (SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD).", file=sys.stderr)
        sys.exit(2)
    return f"postgresql://postgres:{pwd}@db.{ref}.supabase.co:5432/postgres"


def run_sql(path: Path, dsn: str) -> None:
    sql = path.read_text(encoding="utf-8")
    print(f"-> applying {path.name} ({len(sql):,} chars)")
    with psycopg.connect(dsn, connect_timeout=30, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print(f"  done.")


def main() -> int:
    dsn = build_dsn()
    run_sql(SCHEMA, dsn)
    if "--seed" in sys.argv:
        run_sql(SEED, dsn)
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

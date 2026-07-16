import os
from datetime import datetime, timezone

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ComposeShip Compose Fixture API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def database_url() -> str:
    return os.getenv("DATABASE_URL", "postgresql://composeship:composeship@db:5432/composeship_fixture")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/db-check")
def db_check():
    with psycopg.connect(database_url()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS visits (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute("INSERT INTO visits DEFAULT VALUES")
        count = conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0]
        conn.commit()
    return {"database": "ok", "host": "db", "visits": count}


@app.get("/")
def root():
    return {
        "message": "ComposeShip Compose fixture API is running",
        "try": ["/health", "/db-check"],
    }

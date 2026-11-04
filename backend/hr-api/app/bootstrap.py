"""Run before the API starts: apply migrations as the owner, then make sure
the runtime role `hr_app` can log in with HR_APP_DB_PASSWORD.

The API itself connects as hr_app, which owns nothing and is not a superuser,
so the tenant RLS policies bind it. Re-runnable."""

import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import settings


def main() -> int:
    if not settings.owner_database_url or not settings.app_db_password:
        print("HR_DATABASE_OWNER_URL and HR_APP_DB_PASSWORD are required", file=sys.stderr)
        return 1
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.owner_database_url)
    command.upgrade(cfg, "head")

    engine = create_engine(settings.owner_database_url)
    with engine.begin() as conn:
        # Parameters cannot bind in DDL; the password is quoted by PostgreSQL itself.
        quoted = conn.execute(text("SELECT quote_literal(:p)"), {"p": settings.app_db_password}).scalar_one()
        conn.execute(text(f"ALTER ROLE hr_app WITH LOGIN PASSWORD {quoted}"))
    engine.dispose()
    print("hr-api bootstrap complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())

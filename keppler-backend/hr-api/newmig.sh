#!/bin/sh
# Usage: ./newmig.sh <rev-id> "<message>"  -- autogenerates against hr-postgres,
# then appends enable_tenant_rls() for every table the revision creates.
set -e
cd "$(dirname "$0")/.."
. ./.env
docker run --rm --network keppler-backend_default -v "$PWD/hr-api:/app" -w /app --user 1000 \
  -e HR_DATABASE_OWNER_URL="postgresql+psycopg://hr_owner:${HR_OWNER_DB_PASSWORD}@hr-postgres:5432/hospai_hr" \
  --entrypoint alembic keppler-backend-hr-api:dev revision --autogenerate --rev-id "$1" -m "$2" >/dev/null
f=$(ls hr-api/alembic/versions/"$1"_*.py)
python3 - "$f" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
tables = re.findall(r"op\.create_table\('([a-z_]+)'", s)
s = s.replace("from sqlalchemy.dialects import postgresql\n",
              "from sqlalchemy.dialects import postgresql\n\nfrom app.migration_helpers import enable_tenant_rls\n", 1)
marker = "    # ### end Alembic commands ###\n\n\ndef downgrade"
s = s.replace(marker, f"    # ### end Alembic commands ###\n    enable_tenant_rls({tables!r})\n\n\ndef downgrade", 1)
open(p, "w").write(s)
print(p, len(tables), "tables")
PY

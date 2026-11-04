#!/bin/sh
# Runs the suite against a throwaway PostgreSQL -- never hr-postgres: the
# runtime role hr_app is cluster-wide and the bootstrap resets its password.
set -e
cd "$(dirname "$0")"
docker build -q -t keppler-backend-hr-api:dev . >/dev/null
docker rm -f hr-pg-test >/dev/null 2>&1 || true
docker run -d --rm --name hr-pg-test --network keppler-backend_default \
  -e POSTGRES_USER=hr_owner -e POSTGRES_PASSWORD=testpw postgres:16-alpine >/dev/null
trap 'docker rm -f hr-pg-test >/dev/null 2>&1' EXIT
until docker exec hr-pg-test pg_isready -U hr_owner >/dev/null 2>&1; do sleep 1; done
sleep 2
docker run --rm --network keppler-backend_default -v "$PWD:/app" -w /app --user 1000 -e HOME=/tmp \
  -e HR_TEST_ADMIN_URL=postgresql+psycopg://hr_owner:testpw@hr-pg-test:5432/postgres \
  keppler-backend-hr-api:dev python -m pytest -q -p no:cacheprovider "$@"

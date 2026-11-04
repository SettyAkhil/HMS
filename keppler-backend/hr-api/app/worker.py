"""Celery worker + beat: biometric polling, outbox relay, device health.

Outbox events are relayed to the Redis stream `hr:events`. Each entry carries
the outbox row id as `event_id`, which consumers use as their idempotency key
(a relay that crashes after XADD but before marking the row re-sends it)."""

import json
import logging
from datetime import datetime, timezone

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import select

from app.config import settings
from app.db import system_session, tenant_session
from app.models import AttendanceIntegration, OutboxEvent, Tenant
from app.services import attendance

log = logging.getLogger("hr.worker")
celery = Celery("hr", broker=settings.redis_url)
celery.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    timezone=settings.timezone,
    beat_schedule={
        "poll-integrations": {"task": "app.worker.poll_due_integrations", "schedule": 30.0},
        "relay-outbox": {"task": "app.worker.relay_outbox", "schedule": 5.0},
        "device-health": {"task": "app.worker.device_health", "schedule": 60.0},
        "approval-escalation": {"task": "app.worker.escalate_approvals", "schedule": 900.0},
        "nightly-attendance": {"task": "app.worker.nightly_attendance", "schedule": crontab(hour=2, minute=15)},
        "monthly-accrual": {"task": "app.worker.monthly_accrual", "schedule": crontab(day_of_month=1, hour=3, minute=0)},
        "scheduled-reports": {"task": "app.worker.scheduled_reports", "schedule": 600.0},
        "data-retention": {"task": "app.worker.data_retention", "schedule": crontab(hour=3, minute=30)},
        "compliance-scan": {"task": "app.worker.compliance_scan", "schedule": crontab(hour=1, minute=30)},
        "staffing-shortages": {"task": "app.worker.staffing_shortages", "schedule": crontab(minute=0, hour="*/4")},
    },
)
STREAM = "hr:events"
MAX_ATTEMPTS = 10


def _tenants() -> list:
    with system_session() as db:
        return [t.id for t in db.scalars(select(Tenant).where(Tenant.status == "active"))]


@celery.task
def poll_due_integrations() -> int:
    now = datetime.now(timezone.utc)
    started = 0
    for tenant_id in _tenants():
        with tenant_session(tenant_id) as db:
            due = [i.id for i in db.scalars(select(AttendanceIntegration).where(
                AttendanceIntegration.deleted_at.is_(None), AttendanceIntegration.enabled
            )) if attendance.integration_due(i, now)]
        for integration_id in due:
            sync_integration.delay(str(tenant_id), str(integration_id))
            started += 1
    return started


@celery.task
def sync_integration(tenant_id: str, integration_id: str) -> dict:
    import uuid

    try:
        result = attendance.run_sync(uuid.UUID(tenant_id), uuid.UUID(integration_id), "poll", "system:poller")
    except Exception as exc:  # Conflict (already running) and the like are expected
        log.info("sync %s skipped: %s", integration_id, exc)
        return {"status": "skipped", "reason": str(exc)}
    return {k: str(v) for k, v in result.items() if k != "devices"}


@celery.task
def relay_outbox(batch: int = 200) -> int:
    import redis

    client = redis.Redis.from_url(settings.redis_url)
    sent = 0
    for tenant_id in _tenants():
        with tenant_session(tenant_id) as db:
            rows = db.scalars(
                select(OutboxEvent)
                .where(OutboxEvent.published_at.is_(None), OutboxEvent.attempts < MAX_ATTEMPTS)
                .order_by(OutboxEvent.created_at)
                .limit(batch)
                .with_for_update(skip_locked=True)
            ).all()
            for row in rows:
                try:
                    client.xadd(STREAM, {
                        "event_id": str(row.id), "event_type": row.event_type, "tenant_id": str(row.tenant_id),
                        "aggregate_id": row.aggregate_id, "correlation_id": row.correlation_id or "",
                        "occurred_at": row.created_at.isoformat(), "payload": json.dumps(row.payload),
                    }, maxlen=100_000, approximate=True)
                    row.published_at = datetime.now(timezone.utc)
                    sent += 1
                except Exception as exc:
                    row.attempts += 1
                    row.last_error = str(exc)[:500]
                    log.warning("outbox relay failed for %s: %s", row.id, exc)
                    break  # keep order: retry this event before later ones
    return sent


@celery.task
def device_health() -> int:
    total = 0
    for tenant_id in _tenants():
        with tenant_session(tenant_id) as db:
            db.info["actor"] = "system:health"
            total += len(attendance.refresh_device_health(db))
    return total


def _each_tenant(fn, actor: str) -> int:
    total = 0
    for tenant_id in _tenants():
        with tenant_session(tenant_id) as db:
            db.info["actor"] = actor
            total += fn(db) or 0
    return total


@celery.task
def escalate_approvals() -> int:
    from app.services import workflow

    return _each_tenant(workflow.escalate_overdue, "system:escalation")


@celery.task
def nightly_attendance() -> int:
    """Re-run the last three days so yesterday's absences and missing
    check-outs are final once every shift window has closed."""
    from datetime import timedelta

    from app.models import Employee
    from app.services import attendance_engine as engine

    def run(db):
        today = datetime.now(engine.tz()).date()
        ids = list(db.scalars(select(Employee.id).where(Employee.status == "active")))
        return engine.recalculate(db, ids, today - timedelta(days=3), today, "nightly") if ids else 0

    return _each_tenant(run, "system:nightly")


@celery.task
def monthly_accrual() -> int:
    from app.services import leave

    now = datetime.now(timezone.utc)
    return _each_tenant(lambda db: leave.run_monthly_accrual(db, now.year, now.month), "system:accrual")


@celery.task
def staffing_shortages() -> int:
    from app.services import staffing

    return _each_tenant(staffing.shortage_alerts, "system:staffing")


@celery.task
def compliance_scan() -> int:
    from app.services import talent

    return _each_tenant(lambda db: talent.compliance_scan(db)["new_alerts"], "system:compliance")


@celery.task
def scheduled_reports() -> int:
    from app.services import reports

    return _each_tenant(reports.run_due, "system:reports")


@celery.task
def data_retention() -> int:
    from app.services import retention

    return _each_tenant(lambda db: sum(retention.purge(db).values()), "system:retention")

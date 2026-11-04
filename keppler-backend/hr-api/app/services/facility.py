"""Facility & Administration: service requests with priority SLAs, the asset
register (with custody history), vendors and contracts. Administration is
its own domain under facility.* permissions; it shares the employee master
with HR instead of keeping a second staff list."""

import uuid
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import Department, Employee
from app.models.strategy import Asset, AssetAssignment, FacilityRequest, FacilityRequestUpdate, Vendor
from app.services.common import actor_of, audit, emit, next_code, notify_live, paginate, tenant_of
from app.services.employees import full_name

SLA_HOURS = {"critical": 2, "high": 8, "normal": 24, "low": 72}
OPEN = ("open", "assigned", "in_progress", "on_hold")
TRANSITIONS = {
    "open": {"assigned", "in_progress", "cancelled"},
    "assigned": {"in_progress", "on_hold", "resolved", "cancelled", "assigned"},
    "in_progress": {"on_hold", "resolved", "assigned"},
    "on_hold": {"in_progress", "assigned", "cancelled"},
    "resolved": {"closed", "in_progress"},  # the requester can reopen
    "closed": set(),
    "cancelled": set(),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


def _get(db: Session, model, obj_id, label):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None):
        raise NotFound(f"{label} not found")
    return obj


def _name(db: Session, emp_id) -> str | None:
    return full_name(db.get(Employee, emp_id)) if emp_id else None


# ── requests ───────────────────────────────────────────────────────────────


def request_out(db: Session, r: FacilityRequest, detail: bool = False) -> dict:
    now = _now()
    open_ = r.status in OPEN
    out = {c: getattr(r, c) for c in ("id", "number", "category", "priority", "title", "description", "location",
                                      "department_id", "asset_id", "requested_by", "requester_employee_id",
                                      "assigned_to_employee_id", "vendor_id", "status", "due_at", "resolved_at",
                                      "resolution", "cost", "satisfaction", "created_at")}
    dept = db.get(Department, r.department_id) if r.department_id else None
    vendor = db.get(Vendor, r.vendor_id) if r.vendor_id else None
    out.update(department=dept.name if dept else None, assignee=_name(db, r.assigned_to_employee_id),
               vendor=vendor.name if vendor else None,
               overdue=open_ and r.due_at < now,
               breached=(r.resolved_at or now) > r.due_at,
               minutes_to_due=int((r.due_at - now).total_seconds() // 60) if open_ else None)
    if detail:
        out["updates"] = [{"at": u.created_at, "author": u.author, "status": u.status, "note": u.note}
                          for u in db.scalars(select(FacilityRequestUpdate).where(FacilityRequestUpdate.request_id == r.id)
                                              .order_by(FacilityRequestUpdate.created_at))]
        asset = db.get(Asset, r.asset_id) if r.asset_id else None
        out["asset"] = {"id": asset.id, "tag": asset.tag, "name": asset.name} if asset else None
    return out


def list_requests(db: Session, filters: dict, page: int, page_size: int):
    stmt = select(FacilityRequest)
    if filters.get("status") == "open":
        stmt = stmt.where(FacilityRequest.status.in_(OPEN))
    elif filters.get("status") == "overdue":
        stmt = stmt.where(FacilityRequest.status.in_(OPEN), FacilityRequest.due_at < _now())
    elif filters.get("status"):
        stmt = stmt.where(FacilityRequest.status == filters["status"])
    for col in ("category", "priority", "department_id", "assigned_to_employee_id", "requester_employee_id", "vendor_id"):
        if filters.get(col):
            stmt = stmt.where(getattr(FacilityRequest, col) == filters[col])
    if filters.get("q"):
        like = f"%{filters['q']}%"
        stmt = stmt.where(or_(FacilityRequest.title.ilike(like), FacilityRequest.number.ilike(like),
                              FacilityRequest.location.ilike(like)))
    prio = func.array_position(["critical", "high", "normal", "low"], FacilityRequest.priority)
    stmt = stmt.order_by(FacilityRequest.status.in_(OPEN).desc(), prio, FacilityRequest.due_at)
    return paginate(db, stmt, page, page_size, lambda r: request_out(db, r))


def _log(db: Session, r: FacilityRequest, note: str, status: str | None = None) -> None:
    _new(db, FacilityRequestUpdate, request_id=r.id, author=actor_of(db), status=status, note=note)


def create_request(db: Session, data: dict, requester: Employee | None) -> FacilityRequest:
    if data.get("asset_id"):
        _get(db, Asset, data["asset_id"], "Asset")
    created = _now()
    r = _new(db, FacilityRequest, number=next_code(db, "facility_request", "FR-", 5),
             requested_by=full_name(requester) if requester else actor_of(db),
             requester_employee_id=requester.id if requester else None,
             due_at=created + timedelta(hours=SLA_HOURS[data.get("priority", "normal")]), **data)
    _log(db, r, "Request raised", "open")
    emit(db, "facility.request.created", r.id, {"number": r.number, "priority": r.priority, "category": r.category})
    if r.priority == "critical":
        notify_live(db, "facility.critical", {"number": r.number, "title": r.title, "location": r.location})
    audit(db, "facility_request", r.id, "created", data)
    return r


def _move(db: Session, r: FacilityRequest, to: str, note: str) -> None:
    if to not in TRANSITIONS[r.status]:
        raise Conflict(f"A {r.status.replace('_', ' ')} request cannot move to {to.replace('_', ' ')}")
    r.status = to
    _log(db, r, note, to)
    audit(db, "facility_request", r.id, to, {"note": note})


def assign(db: Session, rid: uuid.UUID, data: dict) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    if not data.get("assigned_to_employee_id") and not data.get("vendor_id"):
        raise AppError("Assign the request to a staff member or a vendor")
    if data.get("assigned_to_employee_id"):
        _get(db, Employee, data["assigned_to_employee_id"], "Staff member")
    if data.get("vendor_id"):
        _get(db, Vendor, data["vendor_id"], "Vendor")
    r.assigned_to_employee_id = data.get("assigned_to_employee_id")
    r.vendor_id = data.get("vendor_id")
    who = _name(db, r.assigned_to_employee_id) or db.get(Vendor, r.vendor_id).name
    _move(db, r, "assigned", data.get("note") or f"Assigned to {who}")
    return r


def progress(db: Session, rid: uuid.UUID, status: str, note: str) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    if status in ("resolved", "closed"):
        raise AppError("Use resolve or close")
    _move(db, r, status, note)
    return r


def comment(db: Session, rid: uuid.UUID, note: str) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    _log(db, r, note)
    return r


def resolve(db: Session, rid: uuid.UUID, resolution: str, cost: Decimal | None) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    _move(db, r, "resolved", resolution)
    r.resolution, r.cost, r.resolved_at = resolution, cost, _now()
    emit(db, "facility.request.resolved", r.id, {"number": r.number, "breached": r.resolved_at > r.due_at})
    return r


def close(db: Session, rid: uuid.UUID, satisfaction: int | None, note: str | None, requester: Employee | None,
          is_desk: bool) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    if not is_desk and (requester is None or requester.id != r.requester_employee_id):
        raise Conflict("Only the requester or the facility desk can close this request")
    _move(db, r, "closed", note or "Closed")
    r.satisfaction = satisfaction
    return r


def reopen(db: Session, rid: uuid.UUID, note: str, requester: Employee | None, is_desk: bool) -> FacilityRequest:
    r = _get(db, FacilityRequest, rid, "Request")
    if not is_desk and (requester is None or requester.id != r.requester_employee_id):
        raise Conflict("Only the requester or the facility desk can reopen this request")
    _move(db, r, "in_progress", f"Reopened: {note}")
    r.resolved_at = None
    return r


# ── assets ─────────────────────────────────────────────────────────────────


def _holder(db: Session, asset_id) -> AssetAssignment | None:
    return db.scalar(select(AssetAssignment).where(AssetAssignment.asset_id == asset_id,
                                                   AssetAssignment.returned_on.is_(None)))


def asset_out(db: Session, a: Asset, detail: bool = False) -> dict:
    h = _holder(db, a.id)
    dept = db.get(Department, a.department_id) if a.department_id else None
    out = {**{c: getattr(a, c) for c in ("id", "tag", "name", "category", "serial_number", "location", "department_id",
                                         "status", "condition", "purchase_date", "cost", "warranty_until", "vendor_id")},
           "department": dept.name if dept else None,
           "holder_employee_id": h.employee_id if h else None, "holder": _name(db, h.employee_id) if h else None,
           "assigned_on": h.assigned_on if h else None, "expected_return": h.expected_return if h else None,
           "warranty_expiring": bool(a.warranty_until and date.today() <= a.warranty_until <= date.today() + timedelta(days=60))}
    if detail:
        out["history"] = [{"employee_id": x.employee_id, "employee": _name(db, x.employee_id), "assigned_on": x.assigned_on,
                           "returned_on": x.returned_on, "condition_out": x.condition_out, "condition_in": x.condition_in,
                           "notes": x.notes}
                          for x in db.scalars(select(AssetAssignment).where(AssetAssignment.asset_id == a.id)
                                              .order_by(AssetAssignment.assigned_on.desc()))]
        out["requests"] = [request_out(db, r) for r in db.scalars(select(FacilityRequest).where(
            FacilityRequest.asset_id == a.id).order_by(FacilityRequest.created_at.desc()).limit(20))]
    return out


def list_assets(db: Session, filters: dict, page: int, page_size: int):
    stmt = select(Asset).where(Asset.deleted_at.is_(None))
    for col in ("category", "status", "department_id"):
        if filters.get(col):
            stmt = stmt.where(getattr(Asset, col) == filters[col])
    if filters.get("q"):
        like = f"%{filters['q']}%"
        stmt = stmt.where(or_(Asset.tag.ilike(like), Asset.name.ilike(like), Asset.serial_number.ilike(like)))
    if filters.get("employee_id"):
        stmt = stmt.where(Asset.id.in_(select(AssetAssignment.asset_id).where(
            AssetAssignment.employee_id == filters["employee_id"], AssetAssignment.returned_on.is_(None))))
    return paginate(db, stmt.order_by(Asset.tag), page, page_size, lambda a: asset_out(db, a))


def create_asset(db: Session, data: dict) -> Asset:
    if db.scalar(select(Asset.id).where(Asset.tag == data["tag"], Asset.deleted_at.is_(None))):
        raise Conflict(f"Asset tag {data['tag']} is already in use")
    a = _new(db, Asset, **data)
    audit(db, "asset", a.id, "registered", data)
    return a


def update_asset(db: Session, aid: uuid.UUID, data: dict) -> Asset:
    a = _get(db, Asset, aid, "Asset")
    if data.get("status") == "assigned" and not _holder(db, a.id):
        raise AppError("Assign the asset to someone instead of setting the status")
    if data.get("status") in ("retired", "lost", "in_stock") and _holder(db, a.id):
        raise Conflict("Record the return from the current holder first")
    for k, v in data.items():
        setattr(a, k, v)
    audit(db, "asset", a.id, "updated", data)
    return a


def assign_asset(db: Session, aid: uuid.UUID, data: dict) -> AssetAssignment:
    a = _get(db, Asset, aid, "Asset")
    emp = _get(db, Employee, data["employee_id"], "Staff member")
    if a.status in ("retired", "lost", "maintenance"):
        raise Conflict(f"An asset in {a.status} cannot be issued")
    if _holder(db, a.id):
        raise Conflict("This asset is already issued; record its return first")
    if emp.status not in ("active", "draft"):
        raise Conflict(f"{full_name(emp)} is {emp.status}")
    x = _new(db, AssetAssignment, asset_id=a.id, condition_out=a.condition, **data)
    a.status = "assigned"
    emit(db, "facility.asset.assigned", a.id, {"tag": a.tag, "employee_id": emp.id})
    audit(db, "asset", a.id, "assigned", {"employee_id": emp.id})
    return x


def return_asset(db: Session, aid: uuid.UUID, data: dict) -> Asset:
    a = _get(db, Asset, aid, "Asset")
    h = _holder(db, a.id)
    if h is None:
        raise Conflict("This asset is not issued to anyone")
    h.returned_on = data.get("returned_on") or date.today()
    h.condition_in, h.notes = data["condition"], data.get("notes") or h.notes
    a.condition = data["condition"]
    a.status = "maintenance" if data["condition"] == "poor" else "in_stock"
    audit(db, "asset", a.id, "returned", {"employee_id": h.employee_id, "condition": data["condition"]})
    return a


def assets_held_by(db: Session, employee_id: uuid.UUID) -> list[dict]:
    return [asset_out(db, a) for a in db.scalars(select(Asset).join(AssetAssignment, AssetAssignment.asset_id == Asset.id)
                                                  .where(AssetAssignment.employee_id == employee_id,
                                                         AssetAssignment.returned_on.is_(None)))]


def unreturned_for_exit(db: Session, employee_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(AssetAssignment).where(
        AssetAssignment.employee_id == employee_id, AssetAssignment.returned_on.is_(None))) or 0


# ── vendors ────────────────────────────────────────────────────────────────


def vendor_out(db: Session, v: Vendor) -> dict:
    today = date.today()
    reqs = db.scalars(select(FacilityRequest).where(FacilityRequest.vendor_id == v.id)).all()
    done = [r for r in reqs if r.resolved_at]
    return {**{c: getattr(v, c) for c in ("id", "name", "service", "contact_name", "phone", "email", "contract_start",
                                          "contract_end", "monthly_value", "sla_hours", "rating")},
            "contract_status": ("none" if not v.contract_end else "expired" if v.contract_end < today
                                else "expiring" if v.contract_end <= today + timedelta(days=60) else "active"),
            "open_requests": sum(1 for r in reqs if r.status in OPEN),
            "resolved_requests": len(done),
            "sla_met_rate": round(sum(1 for r in done if r.resolved_at <= r.due_at) * 100 / len(done)) if done else None}


def list_vendors(db: Session, service: str | None = None):
    stmt = select(Vendor).where(Vendor.deleted_at.is_(None)).order_by(Vendor.name)
    if service:
        stmt = stmt.where(Vendor.service == service)
    return [vendor_out(db, v) for v in db.scalars(stmt)]


def save_vendor(db: Session, data: dict, vid: uuid.UUID | None = None) -> Vendor:
    if data.get("contract_start") and data.get("contract_end") and data["contract_end"] < data["contract_start"]:
        raise AppError("Contract end is before its start")
    if vid is None:
        v = _new(db, Vendor, **data)
    else:
        v = _get(db, Vendor, vid, "Vendor")
        for k, val in data.items():
            setattr(v, k, val)
    audit(db, "vendor", v.id, "saved", data)
    return v


# ── dashboard ──────────────────────────────────────────────────────────────


def dashboard(db: Session) -> dict:
    now = _now()
    since = now - timedelta(days=30)
    open_reqs = db.scalars(select(FacilityRequest).where(FacilityRequest.status.in_(OPEN))).all()
    resolved = db.scalars(select(FacilityRequest).where(FacilityRequest.resolved_at >= since)).all()
    assets = db.scalars(select(Asset).where(Asset.deleted_at.is_(None))).all()
    vendors = [vendor_out(db, v) for v in db.scalars(select(Vendor).where(Vendor.deleted_at.is_(None)))]
    rated = [r.satisfaction for r in resolved if r.satisfaction]
    hours = [(r.resolved_at - r.created_at).total_seconds() / 3600 for r in resolved]
    trend = []
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).date()
        trend.append({"date": d, "raised": 0, "resolved": 0})
    idx = {t["date"]: t for t in trend}
    for r in db.scalars(select(FacilityRequest).where(FacilityRequest.created_at >= now - timedelta(days=14))):
        if r.created_at.date() in idx:
            idx[r.created_at.date()]["raised"] += 1
    for r in db.scalars(select(FacilityRequest).where(FacilityRequest.resolved_at >= now - timedelta(days=14))):
        if r.resolved_at.date() in idx:
            idx[r.resolved_at.date()]["resolved"] += 1
    return {
        "open": len(open_reqs),
        "overdue": sum(1 for r in open_reqs if r.due_at < now),
        "critical_open": sum(1 for r in open_reqs if r.priority == "critical"),
        "unassigned": sum(1 for r in open_reqs if r.status == "open"),
        "resolved_30d": len(resolved),
        "sla_met_rate_30d": round(sum(1 for r in resolved if r.resolved_at <= r.due_at) * 100 / len(resolved)) if resolved else None,
        "avg_resolution_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "satisfaction": round(sum(rated) / len(rated), 1) if rated else None,
        "by_category": dict(Counter(r.category for r in open_reqs)),
        "by_priority": dict(Counter(r.priority for r in open_reqs)),
        "trend": trend,
        "assets": {"total": len(assets), "by_status": dict(Counter(a.status for a in assets)),
                   "warranty_expiring": sum(1 for a in assets if a.warranty_until and now.date() <= a.warranty_until <= now.date() + timedelta(days=60)),
                   "value": sum((a.cost or Decimal(0) for a in assets if a.status != "retired"), Decimal(0))},
        "vendors": {"total": len(vendors), "contracts_expiring": sum(1 for v in vendors if v["contract_status"] == "expiring"),
                    "contracts_expired": sum(1 for v in vendors if v["contract_status"] == "expired"),
                    "monthly_value": sum((v["monthly_value"] or Decimal(0) for v in vendors if v["contract_status"] in ("active", "expiring")), Decimal(0))},
        "attention": [request_out(db, r) for r in sorted(open_reqs, key=lambda r: r.due_at)[:8]],
    }

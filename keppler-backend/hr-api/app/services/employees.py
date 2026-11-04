"""Employee master: create, edit, transfer and lifecycle.

Every placement or status change writes three things in one transaction: the
new current state on `employees`, an effective-dated history row
(employment_records / employee_departments), and an outbox event."""

import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.errors import AppError, Conflict, Forbidden, NotFound
from app.models import (
    AuditLog,
    BiometricMapping,
    Branch,
    Department,
    Designation,
    Employee,
    EmployeeContact,
    EmployeeCredential,
    EmployeeDepartment,
    EmployeeHistory,
    EmployeeProfile,
    EmploymentRecord,
    OrganizationUnit,
)
from app.services import hms
from app.services.common import _jsonable, actor_of, audit, diff, emit, next_code, paginate, tenant_of

# Allowed lifecycle moves: action -> (from statuses, to status, event).
TRANSITIONS = {
    "activate": ({"draft", "suspended"}, "active", "hr.employee.activated"),
    "suspend": ({"active"}, "suspended", "hr.employee.updated"),
    "terminate": ({"active", "suspended", "draft"}, "terminated", "hr.employee.terminated"),
    "archive": ({"terminated"}, "archived", "hr.employee.updated"),
}


def full_name(e: Employee) -> str:
    return " ".join(p for p in (e.first_name, e.middle_name, e.last_name) if p)


def get_employee(db: Session, employee_id: uuid.UUID) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None or emp.deleted_at is not None:
        raise NotFound("Employee not found")
    return emp


def _stamp(db: Session, obj) -> None:
    obj.tenant_id = tenant_of(db)
    obj.created_by = obj.updated_by = actor_of(db)


def _history(db: Session, emp: Employee, event_type: str, summary: str, details: dict | None = None) -> None:
    row = EmployeeHistory(employee_id=emp.id, event_type=event_type, summary=summary,
                          details=_jsonable(details) if details else None)
    _stamp(db, row)
    db.add(row)


def _check_placement(db: Session, emp_id: uuid.UUID | None, branch_id, designation_id, manager_id) -> None:
    if branch_id:
        branch = db.get(Branch, branch_id)
        if branch is None or branch.deleted_at:
            raise AppError("Branch not found")
    if designation_id:
        des = db.get(Designation, designation_id)
        if des is None or des.deleted_at:
            raise AppError("Designation not found")
    if manager_id:
        if manager_id == emp_id:
            raise AppError("An employee cannot report to themselves")
        manager = db.get(Employee, manager_id)
        if manager is None or manager.deleted_at or manager.status not in ("active", "suspended"):
            raise AppError("Reporting manager must be a current employee")
        # Walk up the chain: the new manager must not report (indirectly) to this employee.
        seen, cursor = set(), manager
        while cursor and cursor.reporting_manager_id and cursor.id not in seen:
            seen.add(cursor.id)
            if cursor.reporting_manager_id == emp_id:
                raise AppError("That reporting line would create a loop")
            cursor = db.get(Employee, cursor.reporting_manager_id)


def _check_departments(db: Session, assignments: list[dict]) -> None:
    for a in assignments:
        dept = db.get(Department, a["department_id"])
        if dept is None or dept.deleted_at or dept.status != "active":
            raise AppError("Department not found or inactive", {"department_id": str(a["department_id"])})
        if a.get("unit_id"):
            unit = db.get(OrganizationUnit, a["unit_id"])
            if unit is None or unit.department_id != dept.id:
                raise AppError("Unit does not belong to that department", {"unit_id": str(a["unit_id"])})


def _open_assignments(db: Session, assignments: list[dict], emp: Employee, start: date) -> None:
    if assignments and not any(a.get("is_primary") for a in assignments):
        assignments[0]["is_primary"] = True
    for a in assignments:
        row = EmployeeDepartment(employee_id=emp.id, effective_from=start, **a)
        _stamp(db, row)
        db.add(row)


def _employment_record(db: Session, emp: Employee, change_type: str, start: date, reason: str | None) -> None:
    previous = db.scalar(
        select(EmploymentRecord).where(EmploymentRecord.employee_id == emp.id, EmploymentRecord.effective_to.is_(None))
    )
    if previous:
        if start < previous.effective_from:
            raise AppError("Effective date is before the current employment record starts")
        previous.effective_to = max(previous.effective_from, start - timedelta(days=1))
    row = EmploymentRecord(
        employee_id=emp.id, change_type=change_type, effective_from=start, employment_type=emp.employment_type,
        status=emp.status, branch_id=emp.branch_id, designation_id=emp.designation_id,
        reporting_manager_id=emp.reporting_manager_id, reason=reason,
    )
    _stamp(db, row)
    db.add(row)


def _check_username(db: Session, username: str | None, emp_id: uuid.UUID | None) -> None:
    if not username:
        return
    clash = db.scalar(select(Employee.id).where(Employee.hms_username == username, Employee.id != emp_id))
    if clash:
        raise Conflict("That HMS account is already linked to another employee")


def create_employee(db: Session, data: dict) -> Employee:
    departments = data.pop("departments", [])
    contacts = data.pop("contacts", [])
    credentials = data.pop("credentials", [])
    profile = data.pop("profile", {}) or {}
    activate = data.pop("activate", False)

    _check_placement(db, None, data.get("branch_id"), data.get("designation_id"), data.get("reporting_manager_id"))
    _check_departments(db, departments)
    _check_username(db, data.get("hms_username"), None)
    if data.get("designation_id"):
        des = db.get(Designation, data["designation_id"])
        if activate and des.requires_registration and not credentials:
            raise AppError(f"{des.title} requires a professional registration before activation")

    emp = Employee(employee_code=next_code(db, "employee", "EMP-"), status="active" if activate else "draft", **data)
    _stamp(db, emp)
    db.add(emp)
    db.flush()

    prof = EmployeeProfile(employee_id=emp.id, **profile)
    _stamp(db, prof)
    db.add(prof)
    for c in contacts:
        row = EmployeeContact(employee_id=emp.id, **c)
        _stamp(db, row)
        db.add(row)
    for c in credentials:
        row = EmployeeCredential(employee_id=emp.id, **c)
        _stamp(db, row)
        db.add(row)
    _open_assignments(db, departments, emp, emp.joining_date)
    _employment_record(db, emp, "joined", emp.joining_date, None)
    _history(db, emp, "joined", f"Joined as {emp.employee_category.replace('_', ' ')}",
             {"status": emp.status, "joining_date": emp.joining_date})
    audit(db, "employee", emp.id, "created", {"employee_code": emp.employee_code, "status": emp.status})
    emit(db, "hr.employee.created", emp.id, _event_payload(db, emp))
    if activate:
        emit(db, "hr.employee.activated", emp.id, _event_payload(db, emp))
    db.flush()
    return emp


def _event_payload(db: Session, emp: Employee) -> dict:
    primary = db.scalar(
        select(EmployeeDepartment.department_id).where(
            EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.is_primary,
            EmployeeDepartment.effective_to.is_(None),
        )
    )
    return {
        "employee_id": emp.id, "employee_code": emp.employee_code, "full_name": full_name(emp),
        "category": emp.employee_category, "status": emp.status, "branch_id": emp.branch_id,
        "designation_id": emp.designation_id, "primary_department_id": primary,
        "hms_username": emp.hms_username,
    }


def update_employee(db: Session, employee_id: uuid.UUID, data: dict) -> Employee:
    emp = get_employee(db, employee_id)
    if emp.status == "archived":
        raise Conflict("Archived employees are read-only")
    profile = data.pop("profile", None)
    if "hms_username" in data:
        _check_username(db, data["hms_username"], emp.id)
    if data.get("employment_type") == "contract" and not (data.get("contract_end_date") or emp.contract_end_date):
        raise AppError("contract employees need a contract_end_date")
    changes = diff(emp, data)
    if profile is not None:
        prof = db.scalar(select(EmployeeProfile).where(EmployeeProfile.employee_id == emp.id))
        if prof is None:
            prof = EmployeeProfile(employee_id=emp.id)
            _stamp(db, prof)
            db.add(prof)
        changes.update({f"profile.{k}": v for k, v in diff(prof, profile).items()})
    if changes:
        emp.updated_by = actor_of(db)
        # Personal values are audited by field name only, not their contents.
        safe = {k: ("changed" if k in {"date_of_birth", "address_line", "postal_code"} else v)
                for k, v in changes.items()}
        audit(db, "employee", emp.id, "updated", safe)
        _history(db, emp, "updated", "Updated " + ", ".join(sorted(k.replace("_", " ") for k in changes)))
        emit(db, "hr.employee.updated", emp.id, {**_event_payload(db, emp), "fields": sorted(changes)})
    db.flush()
    return emp


def transfer_employee(db: Session, employee_id: uuid.UUID, data: dict) -> Employee:
    emp = get_employee(db, employee_id)
    if emp.status not in ("active", "suspended"):
        raise Conflict("Only current employees can be transferred")
    start: date = data["effective_from"]
    departments = data["departments"]
    _check_placement(db, emp.id, data.get("branch_id"), data.get("designation_id"), data.get("reporting_manager_id"))
    _check_departments(db, departments)

    open_rows = db.scalars(
        select(EmployeeDepartment).where(EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.effective_to.is_(None))
    ).all()
    if any(r.effective_from > start for r in open_rows):
        raise AppError("Transfer date is before a current department assignment starts")
    before = {"branch_id": emp.branch_id, "designation_id": emp.designation_id,
              "departments": sorted(str(r.department_id) for r in open_rows)}
    # Closing a row frees the partial unique index on the open primary
    # assignment; the old row keeps is_primary as history of what it was.
    for r in open_rows:
        r.effective_to = max(r.effective_from, start - timedelta(days=1))
    db.flush()
    _open_assignments(db, [dict(d) for d in departments], emp, start)

    for key in ("branch_id", "designation_id", "reporting_manager_id"):
        if data.get(key) is not None:
            setattr(emp, key, data[key])
    emp.updated_by = actor_of(db)
    _employment_record(db, emp, "transfer", start, data["reason"])
    after = {"branch_id": emp.branch_id, "designation_id": emp.designation_id,
             "departments": sorted(str(d["department_id"]) for d in departments)}
    dept_names = [db.get(Department, d["department_id"]).name for d in departments]
    _history(db, emp, "transferred", f"Transferred to {', '.join(dept_names)} from {start.isoformat()}",
             {"before": before, "after": after, "reason": data["reason"]})
    audit(db, "employee", emp.id, "transferred", {"before": before, "after": after})
    emit(db, "hr.employee.transferred", emp.id, {**_event_payload(db, emp), "effective_from": start, "before": before})
    db.flush()
    return emp


def change_status(db: Session, employee_id: uuid.UUID, action: str, reason: str, effective: date | None) -> Employee:
    if action not in TRANSITIONS:
        raise NotFound("Unknown action")
    allowed_from, to_status, event_type = TRANSITIONS[action]
    emp = get_employee(db, employee_id)
    if emp.status not in allowed_from:
        raise Conflict(f"Cannot {action} an employee who is {emp.status}")
    when = effective or date.today()
    if action == "activate" and emp.designation_id:
        des = db.get(Designation, emp.designation_id)
        if des.requires_registration:
            has_reg = db.scalar(select(exists().where(
                EmployeeCredential.employee_id == emp.id, EmployeeCredential.deleted_at.is_(None),
                or_(EmployeeCredential.expires_on.is_(None), EmployeeCredential.expires_on >= when),
            )))
            if not has_reg:
                raise AppError(f"{des.title} requires a current professional registration before activation")
    previous = emp.status
    emp.status = to_status
    emp.updated_by = actor_of(db)
    if action == "terminate":
        if emp.joining_date and when < emp.joining_date:
            raise AppError("Exit date is before the joining date")
        emp.exit_date = when
        # A departed employee's PIN must stop attributing punches to them.
        for m in db.scalars(select(BiometricMapping).where(
            BiometricMapping.employee_id == emp.id, BiometricMapping.effective_to.is_(None)
        )):
            m.effective_to = when
        for r in db.scalars(select(EmployeeDepartment).where(
            EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.effective_to.is_(None)
        )):
            r.effective_to = when
    _employment_record(db, emp, action, when, reason)
    _history(db, emp, action, f"Status changed from {previous} to {to_status}", {"reason": reason, "effective": when})
    audit(db, "employee", emp.id, action, {"status": [previous, to_status], "reason": reason})
    emit(db, event_type, emp.id, {**_event_payload(db, emp), "previous_status": previous, "reason": reason,
                                  "effective": when})
    db.flush()
    return emp


# --- reads -------------------------------------------------------------------


def _list_stmt(filters: dict):
    primary = aliased(EmployeeDepartment)
    dept = aliased(Department)
    mapped = exists().where(BiometricMapping.employee_id == Employee.id, BiometricMapping.effective_to.is_(None))
    stmt = (
        select(Employee, Designation.title, dept.name, Branch.name, mapped.label("mapped"))
        .outerjoin(Designation, Designation.id == Employee.designation_id)
        .outerjoin(Branch, Branch.id == Employee.branch_id)
        .outerjoin(primary, (primary.employee_id == Employee.id) & primary.is_primary & primary.effective_to.is_(None))
        .outerjoin(dept, dept.id == primary.department_id)
        .where(Employee.deleted_at.is_(None))
    )
    if q := (filters.get("search") or "").strip().lower():
        like = f"%{q}%"
        stmt = stmt.where(or_(
            func.lower(Employee.first_name + " " + func.coalesce(Employee.last_name, "")).like(like),
            func.lower(Employee.employee_code).like(like),
            func.lower(func.coalesce(Employee.email, "")).like(like),
            Employee.phone.like(like),
        ))
    for key, col in (("status", Employee.status), ("employee_category", Employee.employee_category),
                     ("employment_type", Employee.employment_type), ("branch_id", Employee.branch_id),
                     ("designation_id", Employee.designation_id)):
        if filters.get(key):
            stmt = stmt.where(col == filters[key])
    if filters.get("department_id"):
        stmt = stmt.where(exists().where(
            EmployeeDepartment.employee_id == Employee.id,
            EmployeeDepartment.department_id == filters["department_id"],
            EmployeeDepartment.effective_to.is_(None),
        ))
    if filters.get("unmapped"):
        stmt = stmt.where(~mapped)
    sort = filters.get("sort") or "name"
    order = {
        "name": (Employee.first_name, Employee.last_name),
        "code": (Employee.employee_code,),
        "joining_date": (Employee.joining_date.desc().nulls_last(),),
        "recent": (Employee.created_at.desc(),),
    }.get(sort, (Employee.first_name,))
    return stmt.order_by(*order, Employee.id)


def _list_row(row) -> dict:
    emp, designation, department, branch, mapped = row
    return {
        "id": emp.id, "employee_code": emp.employee_code, "full_name": full_name(emp),
        "employee_category": emp.employee_category, "employment_type": emp.employment_type,
        "status": emp.status, "designation": designation, "department": department, "branch": branch,
        "phone": emp.phone, "joining_date": emp.joining_date, "biometric_mapped": bool(mapped),
    }


def facets(db: Session, filters: dict) -> dict:
    """Counts per category and per status for the directory's filter chips;
    each facet ignores its own filter so the chips show what picking it gives."""
    def counts(drop: str, col):
        stmt = _list_stmt({**filters, drop: None}).order_by(None).subquery()
        return dict(db.execute(select(getattr(stmt.c, col), func.count()).group_by(getattr(stmt.c, col))).all())
    return {"employee_category": counts("employee_category", "employee_category"), "status": counts("status", "status")}


def list_employees(db: Session, filters: dict, page: int, page_size: int) -> dict:
    return paginate(db, _list_stmt(filters), page, page_size, _list_row)


def employee_detail(db: Session, employee_id: uuid.UUID, show_personal: bool) -> dict:
    emp = get_employee(db, employee_id)
    profile = db.scalar(select(EmployeeProfile).where(EmployeeProfile.employee_id == emp.id))
    assignments = db.execute(
        select(EmployeeDepartment, Department.name)
        .join(Department, Department.id == EmployeeDepartment.department_id)
        .where(EmployeeDepartment.employee_id == emp.id)
        .order_by(EmployeeDepartment.effective_to.desc().nulls_first(), EmployeeDepartment.effective_from.desc())
    ).all()
    today = date.today()
    creds = db.scalars(select(EmployeeCredential).where(
        EmployeeCredential.employee_id == emp.id, EmployeeCredential.deleted_at.is_(None)
    ).order_by(EmployeeCredential.expires_on.nulls_last())).all()
    manager = db.get(Employee, emp.reporting_manager_id) if emp.reporting_manager_id else None
    branch = db.get(Branch, emp.branch_id) if emp.branch_id else None
    des = db.get(Designation, emp.designation_id) if emp.designation_id else None
    pins = db.scalars(select(BiometricMapping.device_user_id).where(
        BiometricMapping.employee_id == emp.id, BiometricMapping.effective_to.is_(None)
    )).all()
    out = {
        **{c: getattr(emp, c) for c in (
            "id", "employee_code", "first_name", "middle_name", "last_name", "gender", "email", "phone",
            "employee_category", "employment_type", "status", "joining_date", "exit_date", "contract_end_date",
            "branch_id", "designation_id", "reporting_manager_id", "hms_username", "created_at", "updated_at",
        )},
        "full_name": full_name(emp),
        "branch": branch.name if branch else None,
        "designation": des.title if des else None,
        "reporting_manager": full_name(manager) if manager else None,
        "profile": {
            "qualification": profile.qualification if profile else None,
            "specialization": profile.specialization if profile else None,
            "blood_group": profile.blood_group if profile else None,
            "clinical_competencies": profile.clinical_competencies if profile else [],
            "languages": profile.languages if profile else [],
        },
        "departments": [
            {**{c: getattr(a, c) for c in ("id", "department_id", "unit_id", "is_primary", "allocation_percent",
                                            "effective_from", "effective_to")}, "department_name": name}
            for a, name in assignments
        ],
        "credentials": [
            {**{c: getattr(c_, c) for c in ("id", "credential_type", "number", "issuing_authority", "issued_on",
                                             "expires_on", "verification_status", "verified_by", "verified_at")},
             "days_to_expiry": (c_.expires_on - today).days if c_.expires_on else None}
            for c_ in creds
        ],
        "biometric_ids": list(pins),
        "personal_restricted": not show_personal,
    }
    if show_personal:
        out.update({c: getattr(emp, c) for c in ("date_of_birth", "address_line", "city", "state", "postal_code",
                                                  "salary_structure_ref")})
        out["contacts"] = db.scalars(select(EmployeeContact).where(EmployeeContact.employee_id == emp.id)).all()
    return out


def employment_records(db: Session, employee_id: uuid.UUID):
    get_employee(db, employee_id)
    return db.scalars(select(EmploymentRecord).where(EmploymentRecord.employee_id == employee_id)
                      .order_by(EmploymentRecord.effective_from.desc(), EmploymentRecord.created_at.desc())).all()


def history(db: Session, employee_id: uuid.UUID):
    get_employee(db, employee_id)
    return db.scalars(select(EmployeeHistory).where(EmployeeHistory.employee_id == employee_id)
                      .order_by(EmployeeHistory.occurred_at.desc())).all()


def audit_trail(db: Session, employee_id: uuid.UUID):
    get_employee(db, employee_id)
    return db.scalars(select(AuditLog).where(AuditLog.entity_id == str(employee_id))
                      .order_by(AuditLog.created_at.desc()).limit(500)).all()


# --- contacts & credentials --------------------------------------------------


def replace_contacts(db: Session, employee_id: uuid.UUID, contacts: list[dict]):
    emp = get_employee(db, employee_id)
    for row in db.scalars(select(EmployeeContact).where(EmployeeContact.employee_id == emp.id)):
        db.delete(row)
    rows = []
    for c in contacts:
        row = EmployeeContact(employee_id=emp.id, **c)
        _stamp(db, row)
        db.add(row)
        rows.append(row)
    audit(db, "employee", emp.id, "contacts_replaced", {"count": len(rows)})
    db.flush()
    return rows


def add_credential(db: Session, employee_id: uuid.UUID, data: dict) -> EmployeeCredential:
    emp = get_employee(db, employee_id)
    row = EmployeeCredential(employee_id=emp.id, **data)
    _stamp(db, row)
    db.add(row)
    db.flush()
    _history(db, emp, "credential_added", f"Added {data['credential_type'].replace('_', ' ')} {data['number']}")
    audit(db, "employee_credential", row.id, "created", {"employee_id": emp.id, **data})
    return row


def verify_credential(db: Session, employee_id: uuid.UUID, credential_id: uuid.UUID, verdict: str) -> EmployeeCredential:
    row = db.get(EmployeeCredential, credential_id)
    if row is None or row.employee_id != employee_id or row.deleted_at:
        raise NotFound("Credential not found")
    if verdict not in ("verified", "rejected"):
        raise AppError("verdict must be verified or rejected")
    row.verification_status = verdict
    row.verified_by = actor_of(db)
    row.verified_at = datetime.now(timezone.utc)
    audit(db, "employee_credential", row.id, verdict)
    db.flush()
    return row


# --- import / export ---------------------------------------------------------

IMPORT_COLUMNS = ["first_name", "last_name", "employee_category", "employment_type", "joining_date",
                  "email", "phone", "gender", "department_code", "designation_code", "contract_end_date"]
EXPORT_COLUMNS = ["employee_code", "full_name", "employee_category", "employment_type", "status",
                  "designation", "department", "branch", "phone", "joining_date"]


def import_csv(db: Session, content: str, dry_run: bool, validator) -> dict:
    reader = csv.DictReader(io.StringIO(content))
    missing = [c for c in ("first_name", "employee_category", "joining_date") if c not in (reader.fieldnames or [])]
    if missing:
        raise AppError("CSV is missing required columns", {"missing": missing, "expected": IMPORT_COLUMNS})
    depts = {d.code.lower(): d.id for d in db.scalars(select(Department).where(Department.deleted_at.is_(None)))}
    desigs = {d.code.lower(): d.id for d in db.scalars(select(Designation).where(Designation.deleted_at.is_(None)))}
    errors, payloads = [], []
    rows = list(reader)
    if len(rows) > 2000:
        raise AppError("Import at most 2000 rows at a time")
    for n, row in enumerate(rows, start=2):
        row = {k: (v or "").strip() for k, v in row.items() if k}
        body = {k: row.get(k) or None for k in ("first_name", "last_name", "employee_category", "joining_date",
                                                 "email", "phone", "gender", "contract_end_date")}
        body["employment_type"] = row.get("employment_type") or "permanent"
        if body.get("gender"):
            body["gender"] = body["gender"].lower()
        if code := row.get("department_code"):
            if code.lower() not in depts:
                errors.append({"row": n, "error": f"Unknown department code {code}"})
                continue
            body["departments"] = [{"department_id": depts[code.lower()], "is_primary": True}]
        if code := row.get("designation_code"):
            if code.lower() not in desigs:
                errors.append({"row": n, "error": f"Unknown designation code {code}"})
                continue
            body["designation_id"] = desigs[code.lower()]
        try:
            payloads.append((n, validator(body).model_dump()))
        except Exception as exc:  # pydantic ValidationError, reported per row
            errors.append({"row": n, "error": str(exc).splitlines()[0] if str(exc) else "invalid row",
                           "details": getattr(exc, "errors", lambda: [])()[:3]})
    created = 0
    if not dry_run and not errors:
        for _, data in payloads:
            create_employee(db, data)
            created += 1
    return {"dry_run": dry_run or bool(errors), "total_rows": len(rows), "created": created,
            "errors": [{k: (str(v) if k == "details" else v) for k, v in e.items()} for e in errors]}


def export_csv(db: Session, filters: dict) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=EXPORT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for row in db.execute(_list_stmt(filters).limit(20000)):
        item = _list_row(row)
        # Neutralise spreadsheet formula injection in free-text cells.
        writer.writerow({k: ("'" + str(v) if isinstance(v, str) and v[:1] in "=+-@" else v) for k, v in item.items()})
    return out.getvalue()


def employee_for_user(db: Session, username: str) -> Employee | None:
    """The employee record linked to an HMS login, for self-service."""
    return db.scalar(select(Employee).where(Employee.hms_username == username, Employee.deleted_at.is_(None)))


def resolve_subject(db: Session, principal, employee_id: uuid.UUID | None, permission: str) -> Employee:
    """Whose request is this? Yourself, or (with `permission`) anyone."""
    me = employee_for_user(db, principal.username)
    if employee_id is None or (me and me.id == employee_id):
        if me is None:
            raise NotFound("Your login is not linked to an employee record; ask HR to link it")
        return me
    if not principal.can(permission):
        raise Forbidden("You can only raise this for yourself")
    return get_employee(db, employee_id)


def sync_hms_access(db: Session, emp: Employee, action: str, ctx) -> str | None:
    """Mirror an employment status change onto the HMS login, as the HR user
    who made it. Suspension and termination revoke access at once; a
    reinstatement restores it. The outcome is written to the employee's
    history either way, so a refused call is visible and can be redone."""
    if action not in ("suspend", "terminate", "activate") or not emp.hms_employee_id:
        return None
    verb = "activate" if action == "activate" else "deactivate"
    result = hms.call(ctx, "POST", f"/api/employees/{emp.hms_employee_id}/{verb}")
    outcome = "done" if result.ok else f"failed: {result.error}"
    _history(db, emp, f"hms_access_{verb}",
             f"HMS login {'restored' if verb == 'activate' else 'revoked'}" if result.ok
             else f"HMS login {verb} pending — {result.error}", {"result": outcome})
    if not result.ok:
        emit(db, "hr.access.sync_failed", emp.id, {"employee_id": emp.id, "action": verb, "error": result.error})
    return outcome


def summary(db: Session, employee_id: uuid.UUID) -> dict:
    """Headline figures for the profile header: tenure, this month's
    attendance, leave left, next shift, open exceptions."""
    from app.models.workforce import AttendanceException, AttendanceRecord, ShiftAssignment, ShiftTemplate
    from app.services import leave as leave_svc  # leave imports this module, so not at top level

    emp = get_employee(db, employee_id)
    today = date.today()
    first = today.replace(day=1)
    statuses = dict(db.execute(select(AttendanceRecord.status, func.count()).where(
        AttendanceRecord.employee_id == emp.id, AttendanceRecord.work_date >= first,
        AttendanceRecord.work_date <= today).group_by(AttendanceRecord.status)).all())
    worked = sum(statuses.get(s, 0) for s in ("present", "half_day", "in_progress", "missing_punch"))
    scheduled = worked + statuses.get("absent", 0)
    late = db.scalar(select(func.count()).select_from(AttendanceRecord).where(
        AttendanceRecord.employee_id == emp.id, AttendanceRecord.work_date >= first, AttendanceRecord.late_minutes > 0)) or 0
    nxt = db.execute(select(ShiftAssignment.work_date, ShiftTemplate.name, ShiftTemplate.start_time).join(
        ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id).where(
        ShiftAssignment.employee_id == emp.id, ShiftAssignment.status == "published", ShiftAssignment.work_date >= today,
        ShiftAssignment.is_weekly_off.is_(False)).order_by(ShiftAssignment.work_date).limit(1)).first()
    balances = leave_svc.balances_for(db, emp.id, today.year)
    days = (today - emp.joining_date).days if emp.joining_date else 0
    return {
        "tenure": f"{days // 365} y {(days % 365) // 30} m" if days >= 365 else f"{days // 30} m",
        "attendance_rate": round(worked * 100 / scheduled) if scheduled else None,
        "days_worked": worked, "absences": statuses.get("absent", 0), "late_days": late,
        "leave_available": float(sum(b["available"] for b in balances if b["paid"])),
        "next_shift": {"date": nxt[0], "name": nxt[1], "start": nxt[2]} if nxt else None,
        "open_exceptions": db.scalar(select(func.count()).select_from(AttendanceException).where(
            AttendanceException.employee_id == emp.id, AttendanceException.status == "open")) or 0,
    }

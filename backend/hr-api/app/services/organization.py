import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import (
    Branch,
    Department,
    Designation,
    Employee,
    EmployeeDepartment,
    Hospital,
    OrganizationUnit,
)
from app.services.common import actor_of, audit, diff, tenant_of


def _live(model):
    return model.deleted_at.is_(None)


def _get(db: Session, model, obj_id: uuid.UUID, label: str):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None) is not None:
        raise NotFound(f"{label} not found")
    return obj


def _create(db: Session, model, label: str, data: dict):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    audit(db, label, obj.id, "created", data)
    return obj


# --- hospitals / branches ----------------------------------------------------


def list_hospitals(db: Session):
    return db.scalars(select(Hospital).where(_live(Hospital)).order_by(Hospital.name)).all()


def create_hospital(db: Session, data: dict) -> Hospital:
    return _create(db, Hospital, "hospital", data)


def list_branches(db: Session, hospital_id: uuid.UUID | None = None):
    stmt = select(Branch).where(_live(Branch)).order_by(Branch.name)
    if hospital_id:
        stmt = stmt.where(Branch.hospital_id == hospital_id)
    return db.scalars(stmt).all()


def create_branch(db: Session, data: dict) -> Branch:
    _get(db, Hospital, data["hospital_id"], "Hospital")
    return _create(db, Branch, "branch", data)


def update_branch(db: Session, branch_id: uuid.UUID, data: dict) -> Branch:
    branch = _get(db, Branch, branch_id, "Branch")
    changes = diff(branch, data)
    if changes:
        branch.updated_by = actor_of(db)
        audit(db, "branch", branch.id, "updated", changes)
    return branch


# --- departments -------------------------------------------------------------


def _headcounts(db: Session) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(EmployeeDepartment.department_id, func.count(func.distinct(EmployeeDepartment.employee_id)))
        .join(Employee, Employee.id == EmployeeDepartment.employee_id)
        .where(EmployeeDepartment.effective_to.is_(None), Employee.status == "active")
        .group_by(EmployeeDepartment.department_id)
    ).all()
    return dict(rows)


def list_departments(db: Session, branch_id=None, parent_id=None, search: str | None = None):
    stmt = select(Department).where(_live(Department)).order_by(Department.name)
    if branch_id:
        stmt = stmt.where(Department.branch_id == branch_id)
    if parent_id:
        stmt = stmt.where(Department.parent_id == parent_id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(func.lower(Department.name).like(like) | func.lower(Department.code).like(like))
    departments = db.scalars(stmt).all()
    counts = _headcounts(db)
    head_ids = {d.head_employee_id for d in departments if d.head_employee_id}
    heads = {}
    if head_ids:
        for emp in db.scalars(select(Employee).where(Employee.id.in_(head_ids))):
            heads[emp.id] = " ".join(p for p in (emp.first_name, emp.last_name) if p)
    return departments, counts, heads


def _check_parent(db: Session, dept_id: uuid.UUID | None, parent_id: uuid.UUID | None) -> None:
    seen = {dept_id} if dept_id else set()
    current = parent_id
    while current:
        if current in seen:
            raise AppError("A department cannot be placed under itself or one of its sub-departments")
        seen.add(current)
        current = _get(db, Department, current, "Parent department").parent_id


def _check_refs(db: Session, data: dict) -> None:
    if data.get("branch_id"):
        _get(db, Branch, data["branch_id"], "Branch")
    if data.get("head_employee_id"):
        head = _get(db, Employee, data["head_employee_id"], "Department head")
        if head.status != "active":
            raise AppError("Only an active employee can head a department")


def create_department(db: Session, data: dict) -> Department:
    if data.get("census_wards") is None:
        data.pop("census_wards", None)
    _check_refs(db, data)
    _check_parent(db, None, data.get("parent_id"))
    return _create(db, Department, "department", data)


def update_department(db: Session, dept_id: uuid.UUID, data: dict) -> Department:
    dept = _get(db, Department, dept_id, "Department")
    if "census_wards" in data and data["census_wards"] is None:
        data["census_wards"] = []
    _check_refs(db, data)
    if "parent_id" in data:
        _check_parent(db, dept.id, data["parent_id"])
    changes = diff(dept, data)
    if changes:
        dept.updated_by = actor_of(db)
        audit(db, "department", dept.id, "updated", changes)
    return dept


def delete_department(db: Session, dept_id: uuid.UUID) -> None:
    dept = _get(db, Department, dept_id, "Department")
    staffed = db.scalar(
        select(func.count()).select_from(EmployeeDepartment)
        .where(EmployeeDepartment.department_id == dept.id, EmployeeDepartment.effective_to.is_(None))
    )
    children = db.scalar(select(func.count()).select_from(Department).where(Department.parent_id == dept.id, _live(Department)))
    if staffed or children:
        raise Conflict(
            "Department still has staff or sub-departments; move them first",
            {"assigned_employees": staffed, "sub_departments": children},
        )
    dept.deleted_at = datetime.now(timezone.utc)
    audit(db, "department", dept.id, "deleted")


# --- units -------------------------------------------------------------------


def list_units(db: Session, department_id: uuid.UUID | None = None):
    stmt = select(OrganizationUnit).where(_live(OrganizationUnit)).order_by(OrganizationUnit.name)
    if department_id:
        stmt = stmt.where(OrganizationUnit.department_id == department_id)
    return db.scalars(stmt).all()


def create_unit(db: Session, data: dict) -> OrganizationUnit:
    _get(db, Department, data["department_id"], "Department")
    return _create(db, OrganizationUnit, "organization_unit", data)


# --- designations ------------------------------------------------------------


def list_designations(db: Session, job_category: str | None = None):
    stmt = select(Designation).where(_live(Designation)).order_by(Designation.title)
    if job_category:
        stmt = stmt.where(Designation.job_category == job_category)
    designations = db.scalars(stmt).all()
    counts = dict(db.execute(
        select(Employee.designation_id, func.count())
        .where(Employee.status == "active", Employee.deleted_at.is_(None))
        .group_by(Employee.designation_id)
    ).all())
    return designations, counts


def create_designation(db: Session, data: dict) -> Designation:
    return _create(db, Designation, "designation", data)


def update_designation(db: Session, des_id: uuid.UUID, data: dict) -> Designation:
    des = _get(db, Designation, des_id, "Designation")
    changes = diff(des, data)
    if changes:
        des.updated_by = actor_of(db)
        audit(db, "designation", des.id, "updated", changes)
    return des


# --- tree --------------------------------------------------------------------


def org_tree(db: Session) -> list[dict]:
    departments, counts, heads = list_departments(db)
    units = list_units(db)
    branches = list_branches(db)
    hospitals = list_hospitals(db)

    def dept_node(d: Department) -> dict:
        kids = [dept_node(c) for c in departments if c.parent_id == d.id]
        kids += [
            {"id": u.id, "type": "unit", "name": u.name, "code": u.code, "headcount": 0, "children": []}
            for u in units if u.department_id == d.id
        ]
        return {
            "id": d.id, "type": "department", "name": d.name, "code": d.code,
            "headcount": counts.get(d.id, 0) + sum(k["headcount"] for k in kids if k["type"] == "department"),
            "head_name": heads.get(d.head_employee_id), "children": kids,
        }

    roots = [d for d in departments if d.parent_id is None]

    def branch_node(b: Branch) -> dict:
        kids = [dept_node(d) for d in roots if d.branch_id == b.id]
        return {"id": b.id, "type": "branch", "name": b.name, "code": b.code,
                "headcount": sum(k["headcount"] for k in kids), "children": kids}

    tree = []
    for h in hospitals:
        kids = [branch_node(b) for b in branches if b.hospital_id == h.id]
        tree.append({"id": h.id, "type": "hospital", "name": h.name, "code": h.code,
                     "headcount": sum(k["headcount"] for k in kids), "children": kids})
    # Hospital-wide departments not tied to a branch still belong in the picture.
    unplaced = [dept_node(d) for d in roots if d.branch_id is None]
    if unplaced:
        tree.append({"id": uuid.UUID(int=0), "type": "branch", "name": "All branches", "code": "ALL",
                     "headcount": sum(k["headcount"] for k in unplaced), "children": unplaced})
    return tree

import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.schemas.organization import (
    BranchIn,
    BranchOut,
    BranchUpdate,
    DepartmentIn,
    DepartmentOut,
    DepartmentUpdate,
    DesignationIn,
    DesignationOut,
    DesignationUpdate,
    HospitalIn,
    HospitalOut,
    TreeNode,
    UnitIn,
    UnitOut,
)
from app.security import ORG_WRITE, PAYROLL_WRITE, Principal, get_db, require, require_hr_read
from app.services import organization as svc

router = APIRouter(prefix="/api/v1/hr", tags=["organization"])


def _dept_out(d, counts, heads, principal: Principal) -> DepartmentOut:
    out = DepartmentOut.model_validate(d)
    out.headcount = counts.get(d.id, 0)
    out.head_name = heads.get(d.head_employee_id)
    # Budgets are finance data: hidden from everyone without payroll rights.
    out.annual_budget = d.annual_budget if principal.can(PAYROLL_WRITE) else None
    return out


@router.get("/hospitals", response_model=list[HospitalOut])
def list_hospitals(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.list_hospitals(db)


@router.post("/hospitals", response_model=HospitalOut, status_code=201)
def create_hospital(body: HospitalIn, _: Principal = Depends(require(ORG_WRITE)), db: Session = Depends(get_db)):
    return svc.create_hospital(db, body.model_dump())


@router.get("/branches", response_model=list[BranchOut])
def list_branches(hospital_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
                  db: Session = Depends(get_db)):
    return svc.list_branches(db, hospital_id)


@router.post("/branches", response_model=BranchOut, status_code=201)
def create_branch(body: BranchIn, _: Principal = Depends(require(ORG_WRITE)), db: Session = Depends(get_db)):
    return svc.create_branch(db, body.model_dump())


@router.patch("/branches/{branch_id}", response_model=BranchOut)
def update_branch(branch_id: uuid.UUID, body: BranchUpdate, _: Principal = Depends(require(ORG_WRITE)),
                  db: Session = Depends(get_db)):
    return svc.update_branch(db, branch_id, body.model_dump(exclude_unset=True))


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    branch_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
    search: str | None = Query(None, max_length=100),
    principal: Principal = Depends(require_hr_read),
    db: Session = Depends(get_db),
):
    departments, counts, heads = svc.list_departments(db, branch_id, parent_id, search)
    return [_dept_out(d, counts, heads, principal) for d in departments]


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(body: DepartmentIn, principal: Principal = Depends(require(ORG_WRITE)),
                      db: Session = Depends(get_db)):
    data = body.model_dump()
    if not principal.can(PAYROLL_WRITE):
        data.pop("annual_budget", None)
    dept = svc.create_department(db, data)
    return _dept_out(dept, {}, {}, principal)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: uuid.UUID, body: DepartmentUpdate,
                      principal: Principal = Depends(require(ORG_WRITE)), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not principal.can(PAYROLL_WRITE):
        data.pop("annual_budget", None)
    dept = svc.update_department(db, dept_id, data)
    return _dept_out(dept, {}, {}, principal)


@router.delete("/departments/{dept_id}", status_code=204)
def delete_department(dept_id: uuid.UUID, _: Principal = Depends(require(ORG_WRITE)), db: Session = Depends(get_db)):
    svc.delete_department(db, dept_id)
    return Response(status_code=204)


@router.get("/units", response_model=list[UnitOut])
def list_units(department_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
               db: Session = Depends(get_db)):
    return svc.list_units(db, department_id)


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(body: UnitIn, _: Principal = Depends(require(ORG_WRITE)), db: Session = Depends(get_db)):
    return svc.create_unit(db, body.model_dump())


@router.get("/designations", response_model=list[DesignationOut])
def list_designations(job_category: str | None = None, _: Principal = Depends(require_hr_read),
                      db: Session = Depends(get_db)):
    designations, counts = svc.list_designations(db, job_category)
    out = []
    for d in designations:
        item = DesignationOut.model_validate(d)
        item.headcount = counts.get(d.id, 0)
        out.append(item)
    return out


@router.post("/designations", response_model=DesignationOut, status_code=201)
def create_designation(body: DesignationIn, _: Principal = Depends(require(ORG_WRITE)),
                       db: Session = Depends(get_db)):
    return svc.create_designation(db, body.model_dump())


@router.patch("/designations/{des_id}", response_model=DesignationOut)
def update_designation(des_id: uuid.UUID, body: DesignationUpdate, _: Principal = Depends(require(ORG_WRITE)),
                       db: Session = Depends(get_db)):
    return svc.update_designation(db, des_id, body.model_dump(exclude_unset=True))


@router.get("/organization/tree", response_model=list[TreeNode])
def organization_tree(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.org_tree(db)

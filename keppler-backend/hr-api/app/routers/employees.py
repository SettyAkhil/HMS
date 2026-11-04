import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.errors import AppError, Forbidden
from app.schemas.employee import (
    AuditOut,
    ContactIn,
    ContactOut,
    CredentialIn,
    CredentialOut,
    EmployeeCreate,
    EmployeeDetail,
    EmployeeListItem,
    EmployeeUpdate,
    EmploymentRecordOut,
    HistoryOut,
    ImportResult,
    StatusChangeIn,
    TransferIn,
)
from app.security import AUDIT_READ, EMPLOYEES_WRITE, Principal, current_principal, get_db, require, require_any, require_hr_read
from app.services import employees as svc
from app.services import hms
from app.services.common import Page

router = APIRouter(prefix="/api/v1/hr/employees", tags=["employees"])


def _is_self(principal: Principal, db: Session, employee_id: uuid.UUID) -> bool:
    emp = svc.get_employee(db, employee_id)
    return bool(emp.hms_username and emp.hms_username == principal.username)


def _filters(
    search: str | None = Query(None, max_length=100),
    status: str | None = None,
    employee_category: str | None = None,
    employment_type: str | None = None,
    branch_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    designation_id: uuid.UUID | None = None,
    unmapped: bool = False,
    sort: Literal["name", "code", "joining_date", "recent"] = "name",
) -> dict:
    return locals()


@router.get("", response_model=Page[EmployeeListItem])
def list_employees(filters: dict = Depends(_filters), page: int = 1, page_size: int = 25,
                   _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.list_employees(db, filters, page, page_size)


@router.get("/facets")
def employee_facets(filters: dict = Depends(_filters), _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.facets(db, filters)


@router.post("", response_model=EmployeeDetail, status_code=201)
def create_employee(body: EmployeeCreate, _: Principal = Depends(require(EMPLOYEES_WRITE)),
                    db: Session = Depends(get_db)):
    emp = svc.create_employee(db, body.model_dump())
    return svc.employee_detail(db, emp.id, show_personal=True)


@router.get("/export.csv")
def export_employees(filters: dict = Depends(_filters), principal: Principal = Depends(require_hr_read),
                     db: Session = Depends(get_db)):
    # Export is a bulk disclosure: restricted to those who manage employee records.
    if not principal.can(EMPLOYEES_WRITE):
        raise Forbidden("Exporting employees requires employee management rights")
    return Response(svc.export_csv(db, filters), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="employees.csv"'})


@router.post("/import", response_model=ImportResult)
async def import_employees(file: UploadFile = File(...), dry_run: bool = True,
                           _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise AppError("File is larger than 2 MB")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError("File must be UTF-8 CSV") from exc
    return svc.import_csv(db, content, dry_run, EmployeeCreate.model_validate)


@router.get("/{employee_id}", response_model=EmployeeDetail)
def get_employee(employee_id: uuid.UUID, principal: Principal = Depends(current_principal),
                 db: Session = Depends(get_db)):
    is_self = _is_self(principal, db, employee_id)
    if not (principal.can_read_hr() or is_self):
        raise Forbidden("You do not have access to this employee")
    return svc.employee_detail(db, employee_id, show_personal=principal.can(EMPLOYEES_WRITE) or is_self)


@router.patch("/{employee_id}", response_model=EmployeeDetail)
def update_employee(employee_id: uuid.UUID, body: EmployeeUpdate,
                    _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    svc.update_employee(db, employee_id, body.model_dump(exclude_unset=True))
    return svc.employee_detail(db, employee_id, show_personal=True)


@router.post("/{employee_id}/transfer", response_model=EmployeeDetail)
def transfer_employee(employee_id: uuid.UUID, body: TransferIn,
                      _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    svc.transfer_employee(db, employee_id, body.model_dump())
    return svc.employee_detail(db, employee_id, show_personal=True)


@router.get("/{employee_id}/summary")
def employee_summary(employee_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.summary(db, employee_id)


@router.get("/{employee_id}/employment", response_model=list[EmploymentRecordOut])
def employment(employee_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.employment_records(db, employee_id)


@router.get("/{employee_id}/history", response_model=list[HistoryOut])
def history(employee_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return svc.history(db, employee_id)


@router.get("/{employee_id}/audit", response_model=list[AuditOut])
def audit(employee_id: uuid.UUID, _: Principal = Depends(require_any(EMPLOYEES_WRITE, AUDIT_READ)), db: Session = Depends(get_db)):
    return svc.audit_trail(db, employee_id)


@router.put("/{employee_id}/contacts", response_model=list[ContactOut])
def replace_contacts(employee_id: uuid.UUID, body: list[ContactIn],
                     _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    if len(body) > 10:
        raise AppError("At most 10 contacts")
    return svc.replace_contacts(db, employee_id, [c.model_dump() for c in body])


@router.post("/{employee_id}/credentials", response_model=CredentialOut, status_code=201)
def add_credential(employee_id: uuid.UUID, body: CredentialIn,
                   _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    return svc.add_credential(db, employee_id, body.model_dump())


@router.post("/{employee_id}/credentials/{credential_id}/{verdict}", response_model=CredentialOut)
def verify_credential(employee_id: uuid.UUID, credential_id: uuid.UUID, verdict: Literal["verified", "rejected"],
                      _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    return svc.verify_credential(db, employee_id, credential_id, verdict)


# Last: a bare /{action} segment would otherwise shadow /credentials etc.
@router.post("/{employee_id}/{action}", response_model=EmployeeDetail)
def change_status(employee_id: uuid.UUID, action: Literal["activate", "suspend", "terminate", "archive"],
                  body: StatusChangeIn, request: Request, principal: Principal = Depends(require(EMPLOYEES_WRITE)),
                  db: Session = Depends(get_db)):
    if _is_self(principal, db, employee_id):
        raise Forbidden("You cannot change your own employment status")
    emp = svc.change_status(db, employee_id, action, body.reason, body.effective_date)
    svc.sync_hms_access(db, emp, action, hms.CallerContext.from_request(request))
    return svc.employee_detail(db, employee_id, show_personal=True)

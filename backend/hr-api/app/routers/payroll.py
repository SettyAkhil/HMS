import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.errors import Forbidden
from app.security import PAYROLL_WRITE, Principal, current_principal, get_db, require
from app.services import hms
from app.services import payroll as svc
from app.services.employees import employee_for_user

router = APIRouter(prefix="/api/v1/payroll", tags=["payroll"])
PayrollUser = Depends(require(PAYROLL_WRITE))


class ComponentIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Z0-9_]+$")
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["earning", "deduction"]
    prorate: bool = True
    taxable: bool = True
    pf_wage: bool = False


class StructureLine(BaseModel):
    component: str = Field(min_length=1, max_length=20)
    calc: Literal["percent_of_ctc", "percent_of_basic", "fixed", "balance"]
    value: Decimal | None = Field(None, ge=0)


class StructureIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    lines: list[StructureLine] = Field(min_length=1, max_length=30)


class CompensationIn(BaseModel):
    structure_id: uuid.UUID
    monthly_gross: Decimal = Field(gt=0, le=10_000_000)
    overrides: dict[str, Decimal] = Field(default_factory=dict)
    effective_from: date
    pf_enabled: bool = True
    esi_enabled: bool = True
    pt_state: str | None = Field(None, max_length=40)
    uan: str | None = Field(None, pattern=r"^\d{12}$")
    esi_number: str | None = Field(None, pattern=r"^\d{10,17}$")
    pan: str | None = Field(None, pattern=r"^[A-Za-z]{5}\d{4}[A-Za-z]$")
    bank_account: str | None = Field(None, pattern=r"^\d{6,18}$")
    bank_ifsc: str | None = Field(None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    bank_name: str | None = Field(None, max_length=120)
    reason: str | None = Field(None, max_length=500)


class ConfigIn(BaseModel):
    config: dict
    effective_from: date
    source_note: str | None = Field(None, max_length=500)


class LoanIn(BaseModel):
    employee_id: uuid.UUID
    kind: Literal["advance", "loan"]
    principal: Decimal = Field(gt=0, le=5_000_000)
    installment: Decimal = Field(gt=0)
    start_year: int = Field(ge=2000, le=2100)
    start_month: int = Field(ge=1, le=12)
    reason: str | None = Field(None, max_length=500)


class AdjustmentIn(BaseModel):
    employee_id: uuid.UUID
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    kind: Literal["earning", "deduction"]
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Z0-9_]+$")
    amount: Decimal = Field(gt=0, le=10_000_000)
    reason: str = Field(min_length=3, max_length=500)


class RunIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    branch_id: uuid.UUID | None = None


class ReasonIn(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


def _orm(obj, fields):
    return {f: getattr(obj, f) for f in fields}


@router.get("/components")
def components(_: Principal = PayrollUser, db: Session = Depends(get_db)):
    return [_orm(c, ("id", "code", "name", "kind", "prorate", "taxable", "pf_wage")) for c in svc.list_components(db)]


@router.post("/components", status_code=201)
def create_component(body: ComponentIn, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    c = svc.create_component(db, body.model_dump())
    return _orm(c, ("id", "code", "name", "kind", "prorate", "taxable", "pf_wage"))


@router.get("/structures")
def structures(_: Principal = PayrollUser, db: Session = Depends(get_db)):
    return [_orm(s, ("id", "code", "name", "lines")) for s in svc.list_structures(db)]


@router.post("/structures", status_code=201)
def create_structure(body: StructureIn, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    data = body.model_dump(mode="json")
    return _orm(svc.create_structure(db, data), ("id", "code", "name", "lines"))


@router.post("/structures/{structure_id}/preview")
def preview(structure_id: uuid.UUID, monthly_gross: Decimal, _: Principal = PayrollUser,
            db: Session = Depends(get_db)):
    from app.models.payroll import SalaryStructure

    s = db.get(SalaryStructure, structure_id)
    return svc.breakdown(db, s, monthly_gross, {})


@router.get("/statutory")
def statutory(_: Principal = PayrollUser, db: Session = Depends(get_db)):
    return [_orm(c, ("id", "kind", "config", "effective_from", "source_note", "created_by", "created_at"))
            for c in svc.list_configs(db)]


@router.put("/statutory/{kind}")
def save_statutory(kind: Literal["pf", "esi", "pt", "overtime"], body: ConfigIn, _: Principal = PayrollUser,
                   db: Session = Depends(get_db)):
    row = svc.save_config(db, kind, body.config, body.effective_from, body.source_note)
    return _orm(row, ("id", "kind", "config", "effective_from", "source_note"))


@router.get("/compensation/{employee_id}")
def compensation(employee_id: uuid.UUID, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return [svc.comp_out(c, True) for c in svc.compensation_history(db, employee_id)]


@router.post("/compensation/{employee_id}", status_code=201)
def set_compensation(employee_id: uuid.UUID, body: CompensationIn, _: Principal = PayrollUser,
                     db: Session = Depends(get_db)):
    return svc.comp_out(svc.set_compensation(db, employee_id, body.model_dump(mode="python")), True)


@router.get("/loans")
def loans(employee_id: uuid.UUID | None = None, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return [_orm(l, ("id", "employee_id", "kind", "principal", "installment", "start_year", "start_month",
                     "recovered", "status", "reason", "created_at")) for l in svc.list_loans(db, employee_id)]


@router.post("/loans", status_code=201)
def create_loan(body: LoanIn, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return {"id": svc.create_loan(db, body.model_dump()).id}


@router.get("/adjustments")
def adjustments(year: int | None = None, month: int | None = None, _: Principal = PayrollUser,
                db: Session = Depends(get_db)):
    return [_orm(a, ("id", "employee_id", "year", "month", "kind", "code", "amount", "reason", "status",
                     "applied_run_id", "created_by", "created_at")) for a in svc.list_adjustments(db, year, month)]


@router.post("/adjustments", status_code=201)
def create_adjustment(body: AdjustmentIn, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return {"id": svc.create_adjustment(db, body.model_dump()).id}


@router.get("/runs")
def runs(year: int | None = None, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.list_runs(db, year)


@router.post("/runs", status_code=201)
def create_run(body: RunIn, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.run_out(db, svc.create_run(db, body.year, body.month, body.branch_id))


@router.get("/runs/{run_id}")
def run_detail(run_id: uuid.UUID, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return {**svc.run_out(db, svc._run(db, run_id)), "items": svc.items_out(db, run_id)}


@router.post("/runs/{run_id}/calculate")
def calculate(run_id: uuid.UUID, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.run_out(db, svc.calculate(db, run_id))


@router.post("/runs/{run_id}/submit")
def submit(run_id: uuid.UUID, principal: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.run_out(db, svc.submit(db, run_id, principal.username))


@router.post("/runs/{run_id}/finalize")
def finalize(run_id: uuid.UUID, request: Request, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.run_out(db, svc.finalize(db, run_id, hms.CallerContext.from_request(request)))


@router.post("/runs/{run_id}/retry-posting")
def retry_posting(run_id: uuid.UUID, request: Request, _: Principal = PayrollUser, db: Session = Depends(get_db)):
    return svc.run_out(db, svc.retry_posting(db, run_id, hms.CallerContext.from_request(request)))


@router.post("/runs/{run_id}/reverse")
def reverse(run_id: uuid.UUID, body: ReasonIn, request: Request, _: Principal = PayrollUser,
            db: Session = Depends(get_db)):
    return svc.run_out(db, svc.reverse(db, run_id, body.reason, hms.CallerContext.from_request(request)))


@router.get("/payslips")
def payslips(employee_id: uuid.UUID | None = None, principal: Principal = Depends(current_principal),
             db: Session = Depends(get_db)):
    me = employee_for_user(db, principal.username)
    if employee_id is None or not principal.can(PAYROLL_WRITE):
        if me is None:
            raise Forbidden("Your login is not linked to an employee record")
        employee_id = me.id
    return [_orm(p, ("id", "number", "year", "month", "run_id")) | {"net": p.snapshot.get("net")}
            for p in svc.payslips_for(db, employee_id)]


@router.get("/payslips/{payslip_id}")
def payslip(payslip_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    p = svc.payslip(db, payslip_id)
    me = employee_for_user(db, principal.username)
    if not (principal.can(PAYROLL_WRITE) or (me and me.id == p.employee_id)):
        raise Forbidden("You can only open your own payslips")
    return _orm(p, ("id", "number", "year", "month", "void", "snapshot", "created_at"))

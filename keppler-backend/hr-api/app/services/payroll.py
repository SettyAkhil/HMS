"""Compensation, statutory configuration and payroll runs.

Payroll consumes calculated attendance (loss-of-pay days, approved overtime,
night shifts) and approved leave; it never reads raw punches. Preparation
(calculate, adjust, recalculate) is separate from approval (the `payroll`
workflow) and from finalization, which locks the month's attendance,
issues payslips and posts the journal to Accounts. A finalized run cannot be
edited: it can only be reversed by a reversal run, after which the period
can be run again."""

import calendar
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.crypto import decrypt, encrypt
from app.errors import AppError, Conflict, NotFound
from app.models import Department, Designation, Employee, EmployeeDepartment
from app.models.payroll import (
    EmployeeCompensation, EmployeeLoan, PayrollAdjustment, PayrollItem, PayrollRun, Payslip, SalaryComponent,
    SalaryStructure, StatutoryConfig,
)
from app.models.workforce import AttendanceRecord, LeaveRequest, LeaveType, OvertimeRecord
from app.services import hms, workflow
from app.services.common import actor_of, audit, emit, next_code, tenant_of
from app.services.employees import full_name

D0 = Decimal("0")


def rupees(v) -> Decimal:
    return Decimal(v).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


# ── statutory configuration (validated, never hardcoded) ───────────────────


class PFConfig(BaseModel):
    employee_rate: Decimal = Field(ge=0, le=30)  # percent
    employer_rate: Decimal = Field(ge=0, le=30)
    wage_ceiling: Decimal | None = Field(None, gt=0)
    apply_ceiling: bool = True


class ESIConfig(BaseModel):
    employee_rate: Decimal = Field(ge=0, le=10)
    employer_rate: Decimal = Field(ge=0, le=10)
    gross_ceiling: Decimal = Field(gt=0)


class PTSlab(BaseModel):
    min: Decimal = Field(ge=0)
    max: Decimal | None = None
    amount: Decimal = Field(ge=0, le=2500)
    february_amount: Decimal | None = Field(None, ge=0, le=2500)


class PTConfig(BaseModel):
    states: dict[str, list[PTSlab]]

    @model_validator(mode="after")
    def _slabs(self):
        for state, slabs in self.states.items():
            ordered = sorted(slabs, key=lambda s: s.min)
            for a, b in zip(ordered, ordered[1:]):
                if a.max is None or a.max >= b.min:
                    raise ValueError(f"{state}: slabs overlap or leave no upper bound before {b.min}")
        return self


class OvertimeConfig(BaseModel):
    multiplier: Decimal = Field(ge=1, le=4)
    hours_per_day: Decimal = Field(gt=0, le=12)
    night_allowance_per_shift: Decimal = Field(Decimal("0"), ge=0)


CONFIG_MODELS = {"pf": PFConfig, "esi": ESIConfig, "pt": PTConfig, "overtime": OvertimeConfig}


def save_config(db: Session, kind: str, config: dict, effective_from: date, source_note: str | None):
    model = CONFIG_MODELS.get(kind)
    if model is None:
        raise NotFound("Unknown statutory setting")
    try:
        clean = model.model_validate(config).model_dump(mode="json")
    except ValidationError as exc:
        raise AppError(f"Invalid {kind.upper()} settings", {"errors": exc.errors(include_url=False)}) from exc
    row = db.scalar(select(StatutoryConfig).where(StatutoryConfig.kind == kind,
                                                  StatutoryConfig.effective_from == effective_from))
    if row is None:
        row = StatutoryConfig(tenant_id=tenant_of(db), kind=kind, effective_from=effective_from, config=clean,
                              created_by=actor_of(db))
        db.add(row)
    else:
        row.config, row.updated_by = clean, actor_of(db)
    row.source_note = source_note
    audit(db, "statutory_config", f"{kind}:{effective_from}", "saved", {"config": clean, "source": source_note})
    db.flush()
    return row


def config_for(db: Session, kind: str, on: date):
    row = db.scalar(select(StatutoryConfig).where(StatutoryConfig.kind == kind, StatutoryConfig.effective_from <= on)
                    .order_by(StatutoryConfig.effective_from.desc()))
    return CONFIG_MODELS[kind].model_validate(row.config) if row else None


def list_configs(db: Session):
    return db.scalars(select(StatutoryConfig).order_by(StatutoryConfig.kind, StatutoryConfig.effective_from.desc())).all()


# ── components, structures, compensation ───────────────────────────────────


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


def list_components(db: Session):
    return db.scalars(select(SalaryComponent).where(SalaryComponent.deleted_at.is_(None)).order_by(
        SalaryComponent.kind, SalaryComponent.code)).all()


def create_component(db: Session, data: dict):
    c = _new(db, SalaryComponent, **data)
    audit(db, "salary_component", c.id, "created", data)
    return c


def list_structures(db: Session):
    return db.scalars(select(SalaryStructure).where(SalaryStructure.deleted_at.is_(None)).order_by(SalaryStructure.code)).all()


def create_structure(db: Session, data: dict):
    codes = {c.code: c for c in list_components(db)}
    lines = data["lines"]
    missing = [l["component"] for l in lines if l["component"] not in codes]
    if missing:
        raise AppError("Unknown components in structure", {"components": missing})
    if "BASIC" not in {l["component"] for l in lines}:
        raise AppError("A structure needs a BASIC line")
    if sum(1 for l in lines if l["calc"] == "balance") > 1:
        raise AppError("Only one line may take the balance")
    if any(codes[l["component"]].kind != "earning" for l in lines):
        raise AppError("Structures list earnings; deductions are statutory settings, loans or adjustments")
    s = _new(db, SalaryStructure, **data)
    audit(db, "salary_structure", s.id, "created", data)
    return s


def breakdown(db: Session, structure: SalaryStructure, gross: Decimal, overrides: dict) -> list[dict]:
    """Monthly earning lines for a gross; `balance` absorbs the remainder."""
    comps = {c.code: c for c in list_components(db)}
    amounts: dict[str, Decimal] = {}
    basic_line = next(l for l in structure.lines if l["component"] == "BASIC")
    order = [basic_line] + [l for l in structure.lines if l is not basic_line and l["calc"] != "balance"]
    for l in order:
        v = Decimal(str(l.get("value") or 0))
        if l["calc"] == "percent_of_ctc":
            amt = gross * v / 100
        elif l["calc"] == "percent_of_basic":
            amt = amounts.get("BASIC", D0) * v / 100
        else:
            amt = v
        amounts[l["component"]] = rupees(Decimal(str(overrides.get(l["component"], amt))))
    balance = next((l for l in structure.lines if l["calc"] == "balance"), None)
    if balance:
        amounts[balance["component"]] = rupees(max(gross - sum(amounts.values()), D0))
    total = sum(amounts.values())
    if total > gross + 1:
        raise AppError(f"Structure lines add up to ₹{total}, more than the gross ₹{gross}")
    return [{"code": k, "name": comps[k].name, "amount": v, "prorate": comps[k].prorate, "pf_wage": comps[k].pf_wage}
            for k, v in amounts.items()]


def comp_out(c: EmployeeCompensation, show_bank: bool) -> dict:
    out = {k: getattr(c, k) for k in ("id", "employee_id", "structure_id", "monthly_gross", "overrides",
                                      "effective_from", "effective_to", "pf_enabled", "esi_enabled", "pt_state",
                                      "uan", "esi_number", "bank_ifsc", "bank_name", "reason", "created_by")}
    out["bank_account"] = f"••••{c.bank_account_last4}" if c.bank_account_last4 else None
    out["pan"] = None
    if show_bank and c.pan_encrypted:
        pan = decrypt(c.pan_encrypted)
        out["pan"] = f"{pan[:2]}••••{pan[-2:]}" if pan else None
    return out


def set_compensation(db: Session, employee_id: uuid.UUID, data: dict) -> EmployeeCompensation:
    """Effective-dated: closes the open record the day before the new one."""
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise NotFound("Employee not found")
    structure = db.get(SalaryStructure, data["structure_id"])
    if structure is None or structure.deleted_at:
        raise NotFound("Salary structure not found")
    breakdown(db, structure, Decimal(data["monthly_gross"]), data.get("overrides") or {})  # validates
    start = data["effective_from"]
    locked = db.scalar(select(PayrollRun).join(PayrollItem, PayrollItem.run_id == PayrollRun.id).where(
        PayrollItem.employee_id == emp.id, PayrollRun.status == "finalized",
        (PayrollRun.year * 100 + PayrollRun.month) >= start.year * 100 + start.month))
    if locked:
        raise Conflict("A finalized payroll already covers that date; use an arrears adjustment instead")
    current = db.scalar(select(EmployeeCompensation).where(EmployeeCompensation.employee_id == emp.id,
                                                           EmployeeCompensation.effective_to.is_(None)))
    if current:
        if start <= current.effective_from:
            raise AppError("New compensation must start after the current one")
        current.effective_to = start - timedelta(days=1)
        db.flush()
    pan, account = data.pop("pan", None), data.pop("bank_account", None)
    comp = _new(db, EmployeeCompensation, employee_id=emp.id, **data)
    if pan:
        comp.pan_encrypted = encrypt(pan.upper())
    if account:
        comp.bank_account_encrypted, comp.bank_account_last4 = encrypt(account), account[-4:]
    emp.salary_structure_ref = structure.code
    audit(db, "employee_compensation", comp.id, "created",
          {"employee_id": emp.id, "monthly_gross": data["monthly_gross"], "effective_from": start,
           "structure": structure.code, "bank_account": "set" if account else None})
    emit(db, "payroll.compensation.changed", emp.id, {"employee_id": emp.id, "effective_from": start})
    return comp


def compensation_history(db: Session, employee_id: uuid.UUID):
    return db.scalars(select(EmployeeCompensation).where(EmployeeCompensation.employee_id == employee_id)
                      .order_by(EmployeeCompensation.effective_from.desc())).all()


def _comp_for(db: Session, emp_id: uuid.UUID, on: date) -> EmployeeCompensation | None:
    return db.scalar(select(EmployeeCompensation).where(
        EmployeeCompensation.employee_id == emp_id, EmployeeCompensation.effective_from <= on,
        or_(EmployeeCompensation.effective_to.is_(None), EmployeeCompensation.effective_to >= on))
        .order_by(EmployeeCompensation.effective_from.desc()))


# ── loans & adjustments ─────────────────────────────────────────────────────


def create_loan(db: Session, data: dict) -> EmployeeLoan:
    if data["installment"] > data["principal"]:
        raise AppError("Installment cannot exceed the principal")
    loan = _new(db, EmployeeLoan, **data)
    audit(db, "employee_loan", loan.id, "created", data)
    return loan


def list_loans(db: Session, employee_id=None):
    stmt = select(EmployeeLoan).order_by(EmployeeLoan.created_at.desc())
    if employee_id:
        stmt = stmt.where(EmployeeLoan.employee_id == employee_id)
    return db.scalars(stmt).all()


def create_adjustment(db: Session, data: dict) -> PayrollAdjustment:
    adj = _new(db, PayrollAdjustment, **data)
    audit(db, "payroll_adjustment", adj.id, "created", data)
    return adj


def list_adjustments(db: Session, year: int | None = None, month: int | None = None):
    stmt = select(PayrollAdjustment).order_by(PayrollAdjustment.created_at.desc())
    if year:
        stmt = stmt.where(PayrollAdjustment.year == year)
    if month:
        stmt = stmt.where(PayrollAdjustment.month == month)
    return db.scalars(stmt).all()


# ── runs ────────────────────────────────────────────────────────────────────


def _run(db: Session, run_id: uuid.UUID) -> PayrollRun:
    run = db.get(PayrollRun, run_id)
    if run is None:
        raise NotFound("Payroll run not found")
    return run


def create_run(db: Session, year: int, month: int, branch_id: uuid.UUID | None) -> PayrollRun:
    today = date.today()
    if (year, month) > (today.year, today.month):
        raise AppError("Payroll cannot be run for a future month")
    key = str(branch_id) if branch_id else "all"
    exists = db.scalar(select(PayrollRun).where(PayrollRun.year == year, PayrollRun.month == month,
                                                PayrollRun.kind == "regular", PayrollRun.status != "reversed",
                                                or_(PayrollRun.branch_key == key, PayrollRun.branch_key == "all",
                                                    key == "all")))
    if exists:
        raise Conflict(f"A payroll run already covers {calendar.month_name[month]} {year}", {"run_id": str(exists.id)})
    run = _new(db, PayrollRun, code=next_code(db, f"payroll-{year}", f"PR-{year}{month:02d}-", 3), year=year,
               month=month, branch_id=branch_id, branch_key=key)
    audit(db, "payroll_run", run.id, "created", {"year": year, "month": month, "branch_id": branch_id})
    return run


def _require_editable(run: PayrollRun) -> None:
    if run.status not in ("draft", "calculated"):
        raise Conflict(f"A payroll run that is {run.status.replace('_', ' ')} cannot be changed")


def _pt(cfg: PTConfig | None, state: str | None, gross: Decimal, month: int) -> tuple[Decimal, str | None]:
    if not state:
        return D0, None
    if cfg is None or state not in cfg.states:
        return D0, f"No professional tax slabs configured for {state}"
    for slab in cfg.states[state]:
        if gross >= slab.min and (slab.max is None or gross <= slab.max):
            return (slab.february_amount if month == 2 and slab.february_amount is not None else slab.amount), None
    return D0, None


def _calc_item(db: Session, run: PayrollRun, emp: Employee, cfgs: dict) -> dict | None:
    y, m = run.year, run.month
    first, last = date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    comp = _comp_for(db, emp.id, last) or _comp_for(db, emp.id, first)
    warnings, errors = [], []
    if comp is None:
        return None
    structure = db.get(SalaryStructure, comp.structure_id)
    lines = breakdown(db, structure, Decimal(comp.monthly_gross), comp.overrides or {})
    dim = (last - first).days + 1

    # Loss of pay from calculated attendance and unpaid leave.
    lop = D0
    employed_from = max(first, emp.joining_date or first)
    employed_to = min(last, emp.exit_date or last)
    lop += Decimal((employed_from - first).days + (last - employed_to).days)
    records = {r.work_date: r for r in db.scalars(select(AttendanceRecord).where(
        AttendanceRecord.employee_id == emp.id, AttendanceRecord.work_date >= first,
        AttendanceRecord.work_date <= last))}
    unpaid = {lr.id for lr, lt in db.execute(select(LeaveRequest, LeaveType).join(
        LeaveType, LeaveType.id == LeaveRequest.leave_type_id).where(
        LeaveRequest.employee_id == emp.id, LeaveRequest.status == "approved", LeaveType.paid.is_(False),
        LeaveRequest.start_date <= last, LeaveRequest.end_date >= first)).all()}
    missing = open_punch = 0
    d = employed_from
    while d <= employed_to:
        r = records.get(d)
        if r is None:
            missing += 1
        elif r.status == "absent":
            lop += 1
        elif r.status == "half_day":
            lop += Decimal("0.5")
        elif r.status in ("on_leave", "half_day_leave") and r.leave_request_id in unpaid:
            lop += 1 if r.status == "on_leave" else Decimal("0.5")
        elif r.status == "missing_punch":
            open_punch += 1
        d += timedelta(days=1)
    if missing:
        warnings.append(f"{missing} days have no calculated attendance (no roster or punches); paid by default")
    if open_punch:
        warnings.append(f"{open_punch} days still have a missing punch; paid pending correction")
    payable = max(Decimal(dim) - lop, D0)
    ratio = payable / dim

    earnings = [{"code": l["code"], "name": l["name"],
                 "amount": rupees(l["amount"] * ratio if l["prorate"] else l["amount"])} for l in lines]
    ot_minutes = sum(o.approved_minutes or 0 for o in db.scalars(select(OvertimeRecord).where(
        OvertimeRecord.employee_id == emp.id, OvertimeRecord.status == "approved",
        OvertimeRecord.work_date >= first, OvertimeRecord.work_date <= last)))
    nights = sum(1 for r in records.values() if r.is_night)
    ot_cfg: OvertimeConfig | None = cfgs["overtime"]
    if ot_minutes:
        if ot_cfg is None:
            warnings.append("Approved overtime not paid: no overtime settings configured")
        else:
            hourly = Decimal(comp.monthly_gross) / dim / ot_cfg.hours_per_day
            earnings.append({"code": "OVERTIME", "name": f"Overtime ({ot_minutes // 60} h {ot_minutes % 60} min)",
                             "amount": rupees(hourly * ot_cfg.multiplier * ot_minutes / 60)})
    if nights and ot_cfg and ot_cfg.night_allowance_per_shift:
        earnings.append({"code": "NIGHT", "name": f"Night-shift allowance ({nights})",
                         "amount": rupees(ot_cfg.night_allowance_per_shift * nights)})

    adjustments = db.scalars(select(PayrollAdjustment).where(
        PayrollAdjustment.employee_id == emp.id, PayrollAdjustment.status == "pending",
        (PayrollAdjustment.year * 100 + PayrollAdjustment.month) <= y * 100 + m)).all()
    deductions: list[dict] = []
    for a in adjustments:
        target = earnings if a.kind == "earning" else deductions
        target.append({"code": a.code, "name": a.reason[:60], "amount": rupees(a.amount), "adjustment_id": str(a.id)})
    gross = sum((e["amount"] for e in earnings), D0)

    employer: list[dict] = []
    pf_cfg: PFConfig | None = cfgs["pf"]
    if comp.pf_enabled:
        if pf_cfg is None:
            errors.append("PF is enabled but no PF settings are configured")
        else:
            wage_codes = {l["code"] for l in lines if l["pf_wage"]}
            base = sum((e["amount"] for e in earnings if e["code"] in wage_codes), D0)
            if pf_cfg.apply_ceiling and pf_cfg.wage_ceiling:
                base = min(base, pf_cfg.wage_ceiling)
            deductions.append({"code": "PF", "name": "Provident fund", "amount": rupees(base * pf_cfg.employee_rate / 100)})
            employer.append({"code": "PF_ER", "name": "Employer PF", "amount": rupees(base * pf_cfg.employer_rate / 100)})
    esi_cfg: ESIConfig | None = cfgs["esi"]
    if comp.esi_enabled:
        if esi_cfg is None:
            errors.append("ESI is enabled but no ESI settings are configured")
        elif Decimal(comp.monthly_gross) <= esi_cfg.gross_ceiling:
            deductions.append({"code": "ESI", "name": "ESI",
                               "amount": (gross * esi_cfg.employee_rate / 100).quantize(Decimal("1"), ROUND_CEILING)})
            employer.append({"code": "ESI_ER", "name": "Employer ESI",
                             "amount": (gross * esi_cfg.employer_rate / 100).quantize(Decimal("1"), ROUND_CEILING)})
    pt, pt_warning = _pt(cfgs["pt"], comp.pt_state, gross, m)
    if pt_warning:
        warnings.append(pt_warning)
    if pt:
        deductions.append({"code": "PT", "name": "Professional tax", "amount": rupees(pt)})
    for loan in db.scalars(select(EmployeeLoan).where(EmployeeLoan.employee_id == emp.id,
                                                      EmployeeLoan.status == "active")):
        if (loan.start_year, loan.start_month) <= (y, m):
            due = min(loan.installment, loan.principal - loan.recovered)
            if due > 0:
                deductions.append({"code": "LOAN" if loan.kind == "loan" else "ADVANCE",
                                   "name": f"{loan.kind.title()} recovery", "amount": rupees(due),
                                   "loan_id": str(loan.id)})
    total_ded = sum((x["amount"] for x in deductions), D0)
    net = gross - total_ded
    if net < 0:
        errors.append(f"Deductions (₹{total_ded}) exceed gross (₹{gross})")
    return {
        "employee_id": emp.id, "compensation_id": comp.id, "days_in_month": dim, "payable_days": payable,
        "lop_days": lop, "overtime_minutes": ot_minutes, "night_shifts": nights, "earnings": earnings,
        "deductions": deductions, "employer_contributions": employer, "gross": gross,
        "total_deductions": total_ded, "net": net, "warnings": errors + warnings,
        "status": "error" if errors else "warning" if warnings else "ok",
    }


def calculate(db: Session, run_id: uuid.UUID) -> PayrollRun:
    run = _run(db, run_id)
    _require_editable(run)
    first = date(run.year, run.month, 1)
    last = date(run.year, run.month, calendar.monthrange(run.year, run.month)[1])
    cfgs = {k: config_for(db, k, last) for k in CONFIG_MODELS}
    db.query(PayrollItem).filter(PayrollItem.run_id == run.id).delete()
    stmt = select(Employee).where(Employee.deleted_at.is_(None), Employee.status.in_(("active", "suspended", "terminated")),
                                  or_(Employee.joining_date.is_(None), Employee.joining_date <= last),
                                  or_(Employee.exit_date.is_(None), Employee.exit_date >= first))
    if run.branch_id:
        stmt = stmt.where(Employee.branch_id == run.branch_id)
    skipped = []
    for emp in db.scalars(stmt):
        item = _calc_item(db, run, emp, cfgs)
        if item is None:
            skipped.append(full_name(emp))
            continue
        db.add(PayrollItem(tenant_id=run.tenant_id, run_id=run.id, created_by=actor_of(db), **_jsonify(item)))
    db.flush()
    _totals(db, run, skipped)
    run.status, run.calculated_at = "calculated", datetime.now(timezone.utc)
    audit(db, "payroll_run", run.id, "calculated", run.totals)
    emit(db, "payroll.calculated", run.id, {"run_id": run.id, "year": run.year, "month": run.month, **run.totals})
    return run


def _jsonify(item: dict) -> dict:
    def conv(lines):
        return [{k: (str(v) if isinstance(v, Decimal) else v) for k, v in l.items()} for l in lines]
    return {**item, "earnings": conv(item["earnings"]), "deductions": conv(item["deductions"]),
            "employer_contributions": conv(item["employer_contributions"])}


def _totals(db: Session, run: PayrollRun, skipped: list[str] | None = None) -> None:
    items = db.scalars(select(PayrollItem).where(PayrollItem.run_id == run.id)).all()

    def code_sum(field, codes):
        return sum((Decimal(l["amount"]) for i in items for l in getattr(i, field) if l["code"] in codes), D0)

    run.totals = {
        "employees": len(items), "gross": str(sum((i.gross for i in items), D0)),
        "deductions": str(sum((i.total_deductions for i in items), D0)), "net": str(sum((i.net for i in items), D0)),
        "pf": str(code_sum("deductions", {"PF"})), "esi": str(code_sum("deductions", {"ESI"})),
        "professional_tax": str(code_sum("deductions", {"PT"})), "tds": str(code_sum("deductions", {"TDS"})),
        "employer_contribution": str(code_sum("employer_contributions", {"PF_ER", "ESI_ER"})),
        "errors": sum(1 for i in items if i.status == "error"),
        "warnings": sum(1 for i in items if i.status == "warning"),
        "skipped_no_compensation": skipped if skipped is not None else run.totals.get("skipped_no_compensation", []),
    }


def submit(db: Session, run_id: uuid.UUID, requester_username: str) -> PayrollRun:
    run = _run(db, run_id)
    if run.status != "calculated":
        raise Conflict("Calculate the run before submitting it for approval")
    if run.totals.get("errors"):
        raise Conflict(f"{run.totals['errors']} employees have errors; fix them and recalculate")
    run.status = "in_review"
    inst = workflow.start(db, "payroll", "payroll_run", run.id,
                          f"Payroll {calendar.month_name[run.month]} {run.year} ({run.code}): "
                          f"{run.totals['employees']} staff, net ₹{run.totals['net']}", None, requester_username,
                          {"net": float(run.totals["net"]), "employees": run.totals["employees"]})
    run.approval_instance_id = inst.id
    return run


@workflow.on_decision("payroll")
def _payroll_decided(db: Session, inst, outcome: str) -> None:
    run = db.get(PayrollRun, uuid.UUID(inst.entity_id))
    run.status = "approved" if outcome == "approved" else "calculated"
    if outcome == "approved":
        emit(db, "payroll.approved", run.id, {"run_id": run.id, "year": run.year, "month": run.month})


def finalize(db: Session, run_id: uuid.UUID, ctx: hms.CallerContext | None) -> PayrollRun:
    run = _run(db, run_id)
    if run.status != "approved":
        raise Conflict("Only an approved run can be finalized")
    first = date(run.year, run.month, 1)
    last = date(run.year, run.month, calendar.monthrange(run.year, run.month)[1])
    items = db.scalars(select(PayrollItem).where(PayrollItem.run_id == run.id)).all()
    emp_ids = [i.employee_id for i in items]
    db.execute(update(AttendanceRecord).where(AttendanceRecord.employee_id.in_(emp_ids),
                                              AttendanceRecord.work_date >= first, AttendanceRecord.work_date <= last)
               .values(locked=True).execution_options(synchronize_session=False))
    for item in items:
        for line in item.earnings + item.deductions:
            if line.get("adjustment_id"):
                adj = db.get(PayrollAdjustment, uuid.UUID(line["adjustment_id"]))
                adj.status, adj.applied_run_id = "applied", run.id
            if line.get("loan_id"):
                loan = db.get(EmployeeLoan, uuid.UUID(line["loan_id"]))
                loan.recovered += Decimal(line["amount"])
                if loan.recovered >= loan.principal:
                    loan.status = "closed"
        emp = db.get(Employee, item.employee_id)
        db.add(Payslip(tenant_id=run.tenant_id, item_id=item.id, run_id=run.id, employee_id=emp.id,
                       number=f"PS-{run.year}{run.month:02d}-{emp.employee_code}", year=run.year, month=run.month,
                       snapshot=_payslip_snapshot(db, run, item, emp), created_by=actor_of(db)))
    run.status, run.finalized_at, run.finalized_by = "finalized", datetime.now(timezone.utc), actor_of(db)
    db.flush()
    _post_to_accounts(db, run, last, ctx)
    audit(db, "payroll_run", run.id, "finalized", {"posting": run.posting_status})
    emit(db, "payroll.finalized", run.id, {"run_id": run.id, "year": run.year, "month": run.month, **run.totals})
    return run


def _post_to_accounts(db: Session, run: PayrollRun, last: date, ctx: hms.CallerContext | None) -> None:
    t = run.totals
    other = Decimal(t["deductions"]) - sum(Decimal(t[k]) for k in ("pf", "esi", "professional_tax", "tds"))
    event = {"type": "PAYROLL_RUN", "event_id": f"HR-PAYROLL-{run.id}", "run_id": run.code, "date": last.isoformat(),
             "month": f"{run.year}-{run.month:02d}", "gross": t["gross"], "net": t["net"], "pf": t["pf"],
             "esi": t["esi"], "professional_tax": t["professional_tax"], "tds": t["tds"],
             "other_deductions": str(other), "employer_contribution": t["employer_contribution"]}
    result = hms.call(ctx, "POST", "/api/accounts/postings", {"events": [event]})
    outcome = ((result.data or {}).get("results") or [{}])[0] if result.ok else {}
    if result.ok and outcome.get("status") in ("posted", "duplicate"):
        run.posting_status, run.posting_reference = "posted", {**outcome, "event": event}
    else:
        run.posting_status = "pending"
        run.posting_reference = {"event": event, "error": outcome.get("reason") or result.error}


def retry_posting(db: Session, run_id: uuid.UUID, ctx: hms.CallerContext) -> PayrollRun:
    run = _run(db, run_id)
    if run.status != "finalized" or run.posting_status == "posted":
        raise Conflict("Nothing to post for this run")
    _post_to_accounts(db, run, date(run.year, run.month, calendar.monthrange(run.year, run.month)[1]), ctx)
    return run


def reverse(db: Session, run_id: uuid.UUID, reason: str, ctx: hms.CallerContext | None) -> PayrollRun:
    """Void a finalized run: payslips voided, attendance unlocked, adjustments
    and loan recoveries released, the journal reversed in Accounts. The
    original rows stay as history; the period can then be run again."""
    run = _run(db, run_id)
    if run.status != "finalized" or run.kind != "regular":
        raise Conflict("Only a finalized regular run can be reversed")
    items = db.scalars(select(PayrollItem).where(PayrollItem.run_id == run.id)).all()
    first = date(run.year, run.month, 1)
    last = date(run.year, run.month, calendar.monthrange(run.year, run.month)[1])
    for item in items:
        for line in item.deductions:
            if line.get("loan_id"):
                loan = db.get(EmployeeLoan, uuid.UUID(line["loan_id"]))
                loan.recovered -= Decimal(line["amount"])
                loan.status = "active"
    db.execute(update(PayrollAdjustment).where(PayrollAdjustment.applied_run_id == run.id)
               .values(status="pending", applied_run_id=None).execution_options(synchronize_session=False))
    db.execute(update(Payslip).where(Payslip.run_id == run.id).values(void=True)
               .execution_options(synchronize_session=False))
    db.execute(update(AttendanceRecord).where(AttendanceRecord.employee_id.in_([i.employee_id for i in items]),
                                              AttendanceRecord.work_date >= first, AttendanceRecord.work_date <= last)
               .values(locked=False).execution_options(synchronize_session=False))
    reversal = _new(db, PayrollRun, code=f"{run.code}-REV", kind="reversal", year=run.year, month=run.month,
                    branch_id=run.branch_id, branch_key=f"rev-{run.id}", status="finalized",
                    totals={k: (str(-Decimal(v)) if k in ("gross", "deductions", "net", "pf", "esi", "professional_tax",
                                                          "tds", "employer_contribution") else v)
                            for k, v in run.totals.items()},
                    reverses_run_id=run.id, reversal_reason=reason, finalized_at=datetime.now(timezone.utc),
                    finalized_by=actor_of(db))
    journal_id = (run.posting_reference or {}).get("journal_id")
    if run.posting_status == "posted" and journal_id:
        result = hms.call(ctx, "POST", f"/api/accounts/journals/{journal_id}/reverse",
                          {"reason": f"Payroll {run.code} reversed: {reason}"})
        reversal.posting_status = "posted" if result.ok else "pending"
        reversal.posting_reference = result.data if result.ok else {"journal_id": journal_id, "error": result.error}
    else:
        reversal.posting_status = "not_required"
    run.status = "reversed"
    audit(db, "payroll_run", run.id, "reversed", {"reason": reason, "reversal_run_id": reversal.id})
    emit(db, "payroll.reversed", run.id, {"run_id": run.id, "reversal_run_id": reversal.id, "reason": reason})
    return reversal


def _payslip_snapshot(db: Session, run: PayrollRun, item: PayrollItem, emp: Employee) -> dict:
    des = db.get(Designation, emp.designation_id) if emp.designation_id else None
    dept_id = db.scalar(select(EmployeeDepartment.department_id).where(
        EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.is_primary,
        EmployeeDepartment.effective_to.is_(None)))
    comp = db.get(EmployeeCompensation, item.compensation_id) if item.compensation_id else None
    return {
        "period": f"{calendar.month_name[run.month]} {run.year}", "run_code": run.code,
        "employee": {"code": emp.employee_code, "name": full_name(emp), "designation": des.title if des else None,
                     "department": db.get(Department, dept_id).name if dept_id else None,
                     "joining_date": emp.joining_date.isoformat() if emp.joining_date else None,
                     "uan": comp.uan if comp else None,
                     "bank": f"{comp.bank_name or ''} ••••{comp.bank_account_last4}" if comp and comp.bank_account_last4 else None},
        "days_in_month": item.days_in_month, "payable_days": str(item.payable_days), "lop_days": str(item.lop_days),
        "earnings": item.earnings, "deductions": item.deductions, "employer_contributions": item.employer_contributions,
        "gross": str(item.gross), "total_deductions": str(item.total_deductions), "net": str(item.net),
    }


def run_out(db: Session, run: PayrollRun) -> dict:
    return {**{c: getattr(run, c) for c in ("id", "code", "kind", "year", "month", "branch_id", "status", "totals",
                                            "calculated_at", "approval_instance_id", "finalized_at", "finalized_by",
                                            "reverses_run_id", "reversal_reason", "posting_status",
                                            "posting_reference", "created_at", "created_by")}}


def list_runs(db: Session, year: int | None):
    stmt = select(PayrollRun).order_by(PayrollRun.year.desc(), PayrollRun.month.desc(), PayrollRun.created_at.desc())
    if year:
        stmt = stmt.where(PayrollRun.year == year)
    return [run_out(db, r) for r in db.scalars(stmt.limit(120))]


def items_out(db: Session, run_id: uuid.UUID) -> list[dict]:
    rows = db.execute(select(PayrollItem, Employee).join(Employee, Employee.id == PayrollItem.employee_id)
                      .where(PayrollItem.run_id == run_id).order_by(Employee.first_name)).all()
    return [{**{c: getattr(i, c) for c in ("id", "employee_id", "days_in_month", "payable_days", "lop_days",
                                           "overtime_minutes", "night_shifts", "earnings", "deductions",
                                           "employer_contributions", "gross", "total_deductions", "net", "warnings",
                                           "status")},
             "employee_name": full_name(e), "employee_code": e.employee_code} for i, e in rows]


def payslips_for(db: Session, employee_id: uuid.UUID):
    return db.scalars(select(Payslip).where(Payslip.employee_id == employee_id, Payslip.void.is_(False))
                      .order_by(Payslip.year.desc(), Payslip.month.desc())).all()


def payslip(db: Session, payslip_id: uuid.UUID) -> Payslip:
    p = db.get(Payslip, payslip_id)
    if p is None:
        raise NotFound("Payslip not found")
    return p

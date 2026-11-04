"""Facility & Administration routes (/api/v1/facility), plus the self-service
pieces under /api/v1/me: raising a request, following it, and the assets
issued to you."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.errors import Forbidden
from app.security import (
    EMPLOYEES_READ, FACILITY_ASSETS_WRITE, FACILITY_READ, FACILITY_REQUESTS_WRITE, FACILITY_VENDORS_WRITE, HR_READ,
    Principal, current_principal, get_db, require, require_any,
)
from app.services import facility, selfservice
from app.services.employees import employee_for_user

fac = APIRouter(prefix="/api/v1/facility", tags=["facility"])
mine = APIRouter(prefix="/api/v1/me", tags=["self-service"])

read = require(FACILITY_READ)
Category = Literal["maintenance", "electrical", "plumbing", "housekeeping", "biomedical", "it", "transport",
                   "stationery", "security", "other"]
Priority = Literal["critical", "high", "normal", "low"]
Condition = Literal["new", "good", "fair", "poor"]


class RequestIn(BaseModel):
    category: Category
    priority: Priority = "normal"
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=4000)
    location: str = Field(min_length=2, max_length=200)
    department_id: uuid.UUID | None = None
    asset_id: uuid.UUID | None = None


class AssignIn(BaseModel):
    assigned_to_employee_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    note: str | None = Field(None, max_length=1000)


class ProgressIn(BaseModel):
    status: Literal["in_progress", "on_hold", "cancelled"]
    note: str = Field(min_length=2, max_length=1000)


class NoteIn(BaseModel):
    note: str = Field(min_length=2, max_length=1000)


class ResolveIn(BaseModel):
    resolution: str = Field(min_length=3, max_length=2000)
    cost: Decimal | None = Field(None, ge=0)


class CloseIn(BaseModel):
    satisfaction: int | None = Field(None, ge=1, le=5)
    note: str | None = Field(None, max_length=1000)


class AssetIn(BaseModel):
    tag: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=200)
    category: Literal["it", "medical", "furniture", "vehicle", "communication", "uniform", "key", "other"]
    serial_number: str | None = Field(None, max_length=80)
    location: str | None = Field(None, max_length=200)
    department_id: uuid.UUID | None = None
    condition: Condition = "new"
    purchase_date: date | None = None
    cost: Decimal | None = Field(None, ge=0)
    warranty_until: date | None = None
    vendor_id: uuid.UUID | None = None


class AssetPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    location: str | None = Field(None, max_length=200)
    department_id: uuid.UUID | None = None
    status: Literal["in_stock", "maintenance", "retired", "lost"] | None = None
    condition: Condition | None = None
    warranty_until: date | None = None


class IssueIn(BaseModel):
    employee_id: uuid.UUID
    assigned_on: date
    expected_return: date | None = None
    notes: str | None = Field(None, max_length=1000)


class ReturnIn(BaseModel):
    condition: Condition
    returned_on: date | None = None
    notes: str | None = Field(None, max_length=1000)


class VendorIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    service: Literal["housekeeping", "security", "biomedical", "it", "catering", "laundry", "transport", "maintenance", "other"]
    contact_name: str | None = Field(None, max_length=120)
    phone: str | None = Field(None, max_length=30)
    email: EmailStr | None = None
    contract_start: date | None = None
    contract_end: date | None = None
    monthly_value: Decimal | None = Field(None, ge=0)
    sla_hours: int | None = Field(None, ge=1, le=720)
    rating: int | None = Field(None, ge=1, le=5)


# ── dashboard ──────────────────────────────────────────────────────────────


@fac.get("/dashboard")
def dashboard(_: Principal = Depends(read), db: Session = Depends(get_db)):
    return facility.dashboard(db)


# ── requests ───────────────────────────────────────────────────────────────


@fac.get("/requests")
def requests(status: str | None = None, category: Category | None = None, priority: Priority | None = None,
             department_id: uuid.UUID | None = None, assigned_to_employee_id: uuid.UUID | None = None,
             vendor_id: uuid.UUID | None = None, q: str | None = None, page: int = 1, page_size: int = 25,
             _: Principal = Depends(read), db: Session = Depends(get_db)):
    filters = {"status": status, "category": category, "priority": priority, "department_id": department_id,
               "assigned_to_employee_id": assigned_to_employee_id, "vendor_id": vendor_id, "q": q}
    return facility.list_requests(db, filters, max(page, 1), max(1, min(page_size, 100)))


@fac.post("/requests", status_code=201)
def create_request(body: RequestIn, principal: Principal = Depends(require(FACILITY_REQUESTS_WRITE)),
                   db: Session = Depends(get_db)):
    r = facility.create_request(db, body.model_dump(), employee_for_user(db, principal.username))
    return facility.request_out(db, r, True)


@fac.get("/requests/{request_id}")
def request_detail(request_id: uuid.UUID, _: Principal = Depends(read), db: Session = Depends(get_db)):
    return facility.request_out(db, facility._get(db, facility.FacilityRequest, request_id, "Request"), True)


@fac.post("/requests/{request_id}/assign")
def assign(request_id: uuid.UUID, body: AssignIn, _: Principal = Depends(require(FACILITY_REQUESTS_WRITE)),
           db: Session = Depends(get_db)):
    return facility.request_out(db, facility.assign(db, request_id, body.model_dump()), True)


@fac.post("/requests/{request_id}/progress")
def progress(request_id: uuid.UUID, body: ProgressIn, _: Principal = Depends(require(FACILITY_REQUESTS_WRITE)),
             db: Session = Depends(get_db)):
    return facility.request_out(db, facility.progress(db, request_id, body.status, body.note), True)


@fac.post("/requests/{request_id}/notes")
def note(request_id: uuid.UUID, body: NoteIn, _: Principal = Depends(require(FACILITY_REQUESTS_WRITE)),
         db: Session = Depends(get_db)):
    return facility.request_out(db, facility.comment(db, request_id, body.note), True)


@fac.post("/requests/{request_id}/resolve")
def resolve(request_id: uuid.UUID, body: ResolveIn, _: Principal = Depends(require(FACILITY_REQUESTS_WRITE)),
            db: Session = Depends(get_db)):
    return facility.request_out(db, facility.resolve(db, request_id, body.resolution, body.cost), True)


@fac.post("/requests/{request_id}/close")
def close(request_id: uuid.UUID, body: CloseIn, principal: Principal = Depends(current_principal),
          db: Session = Depends(get_db)):
    r = facility.close(db, request_id, body.satisfaction, body.note, employee_for_user(db, principal.username),
                       principal.can(FACILITY_REQUESTS_WRITE))
    return facility.request_out(db, r, True)


@fac.post("/requests/{request_id}/reopen")
def reopen(request_id: uuid.UUID, body: NoteIn, principal: Principal = Depends(current_principal),
           db: Session = Depends(get_db)):
    r = facility.reopen(db, request_id, body.note, employee_for_user(db, principal.username),
                        principal.can(FACILITY_REQUESTS_WRITE))
    return facility.request_out(db, r, True)


# ── assets ─────────────────────────────────────────────────────────────────


@fac.get("/assets")
def assets(category: str | None = None, status: str | None = None, department_id: uuid.UUID | None = None,
           employee_id: uuid.UUID | None = None, q: str | None = None, page: int = 1, page_size: int = 25,
           _: Principal = Depends(read), db: Session = Depends(get_db)):
    filters = {"category": category, "status": status, "department_id": department_id, "employee_id": employee_id, "q": q}
    return facility.list_assets(db, filters, max(page, 1), max(1, min(page_size, 100)))


@fac.post("/assets", status_code=201)
def create_asset(body: AssetIn, _: Principal = Depends(require(FACILITY_ASSETS_WRITE)), db: Session = Depends(get_db)):
    return facility.asset_out(db, facility.create_asset(db, body.model_dump()))


@fac.get("/assets/{asset_id}")
def asset_detail(asset_id: uuid.UUID, _: Principal = Depends(read), db: Session = Depends(get_db)):
    return facility.asset_out(db, facility._get(db, facility.Asset, asset_id, "Asset"), True)


@fac.patch("/assets/{asset_id}")
def update_asset(asset_id: uuid.UUID, body: AssetPatch, _: Principal = Depends(require(FACILITY_ASSETS_WRITE)),
                 db: Session = Depends(get_db)):
    return facility.asset_out(db, facility.update_asset(db, asset_id, body.model_dump(exclude_unset=True)), True)


@fac.post("/assets/{asset_id}/issue")
def issue(asset_id: uuid.UUID, body: IssueIn, _: Principal = Depends(require(FACILITY_ASSETS_WRITE)),
          db: Session = Depends(get_db)):
    facility.assign_asset(db, asset_id, body.model_dump())
    return facility.asset_out(db, facility._get(db, facility.Asset, asset_id, "Asset"), True)


@fac.post("/assets/{asset_id}/return")
def return_asset(asset_id: uuid.UUID, body: ReturnIn, _: Principal = Depends(require(FACILITY_ASSETS_WRITE)),
                 db: Session = Depends(get_db)):
    return facility.asset_out(db, facility.return_asset(db, asset_id, body.model_dump()), True)


@fac.get("/employees/{employee_id}/assets")
def employee_assets(employee_id: uuid.UUID, _: Principal = Depends(require_any(FACILITY_READ, HR_READ, EMPLOYEES_READ)),
                    db: Session = Depends(get_db)):
    """Assets held by one employee -- read by the HR profile's Assets tab."""
    return facility.assets_held_by(db, employee_id)


# ── vendors ────────────────────────────────────────────────────────────────


@fac.get("/vendors")
def vendors(service: str | None = None, _: Principal = Depends(read), db: Session = Depends(get_db)):
    return facility.list_vendors(db, service)


@fac.post("/vendors", status_code=201)
def create_vendor(body: VendorIn, _: Principal = Depends(require(FACILITY_VENDORS_WRITE)), db: Session = Depends(get_db)):
    return facility.vendor_out(db, facility.save_vendor(db, body.model_dump()))


@fac.put("/vendors/{vendor_id}")
def update_vendor(vendor_id: uuid.UUID, body: VendorIn, _: Principal = Depends(require(FACILITY_VENDORS_WRITE)),
                  db: Session = Depends(get_db)):
    return facility.vendor_out(db, facility.save_vendor(db, body.model_dump(), vendor_id))


# ── self-service ───────────────────────────────────────────────────────────


@mine.get("/requests")
def my_requests(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    emp = selfservice.me(db, principal)
    return facility.list_requests(db, {"requester_employee_id": emp.id}, 1, 100)["items"]


@mine.post("/requests", status_code=201)
def raise_request(body: RequestIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Any linked staff member may report a facility issue."""
    emp = selfservice.me(db, principal)
    if body.priority == "critical" and not principal.can(FACILITY_REQUESTS_WRITE):
        body.priority = "high"  # critical is triaged by the desk, not self-declared
    return facility.request_out(db, facility.create_request(db, body.model_dump(), emp), True)


@mine.get("/assets")
def my_assets(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return facility.assets_held_by(db, selfservice.me(db, principal).id)


_ = Forbidden

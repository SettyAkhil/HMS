import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Provider = Literal["etimetracklite", "ebioserver", "simulator"]


class IntegrationIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: Provider
    base_url: str = Field(min_length=4, max_length=300)
    username: str | None = Field(None, max_length=120)
    password: str | None = Field(None, max_length=200)
    branch_id: uuid.UUID | None = None
    enabled: bool = True
    poll_interval_seconds: int = Field(300, ge=60, le=86400)
    device_timezone: str = Field("Asia/Kolkata", max_length=60)

    @field_validator("base_url")
    @classmethod
    def _url(cls, v: str, info):
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("sim://")):
            raise ValueError("base_url must start with http://, https:// or sim://")
        return v


class IntegrationUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    base_url: str | None = Field(None, min_length=4, max_length=300)
    username: str | None = Field(None, max_length=120)
    password: str | None = Field(None, max_length=200)
    branch_id: uuid.UUID | None = None
    enabled: bool | None = None
    poll_interval_seconds: int | None = Field(None, ge=60, le=86400)
    device_timezone: str | None = Field(None, max_length=60)


class IntegrationOut(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    base_url: str
    username: str | None
    has_password: bool
    branch_id: uuid.UUID | None
    enabled: bool
    poll_interval_seconds: int
    device_timezone: str
    operations: list[str]
    verified_at: str | None
    synced_until: datetime | None
    last_success_at: datetime | None
    last_error: str | None
    consecutive_failures: int
    is_simulator: bool
    created_at: datetime


class ConnectionTestOut(BaseModel):
    ok: bool
    message: str
    operations: list[str]
    product: str | None


class SyncRequest(BaseModel):
    """Omit both dates for an incremental sync; give both to re-read a window
    (e.g. after a device was offline for days)."""

    window_from: datetime | None = None
    window_to: datetime | None = None


class SyncResult(BaseModel):
    sync_log_id: uuid.UUID | None = None
    status: str
    error: str | None = None
    window_from: datetime | None = None
    window_to: datetime | None = None
    fetched: int = 0
    inserted: int = 0
    duplicates: int = 0
    unmapped: int = 0
    rejected: int = 0
    devices: list[dict] = []


class DeviceIn(BaseModel):
    integration_id: uuid.UUID
    serial_number: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(None, max_length=200)
    branch_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    direction_mode: Literal["auto", "in", "out"] = "auto"
    enabled: bool = True


class DeviceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    location: str | None = Field(None, max_length=200)
    branch_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    direction_mode: Literal["auto", "in", "out"] | None = None
    enabled: bool | None = None


class DeviceOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    integration_id: uuid.UUID
    serial_number: str
    name: str
    location: str | None
    branch_id: uuid.UUID | None
    department_id: uuid.UUID | None
    direction_mode: str
    enabled: bool
    status: str
    last_seen_at: datetime | None
    last_punch_at: datetime | None


class MappingIn(BaseModel):
    integration_id: uuid.UUID
    employee_id: uuid.UUID
    device_user_id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    effective_from: date | None = None


class MappingEnd(BaseModel):
    effective_to: date | None = None


class MappingOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    employee_id: uuid.UUID
    employee_code: str | None
    employee_name: str | None
    device_user_id: str
    effective_from: date
    effective_to: date | None
    provisioning_status: str
    created_at: datetime
    created_by: str | None
    claimed_punches: int | None = None


class UnmappedOut(BaseModel):
    integration_id: uuid.UUID
    device_user_id: str
    punch_count: int
    first_punch: datetime
    last_punch: datetime
    devices: list[str]


class PunchOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    device_id: uuid.UUID | None
    device_name: str | None
    device_serial: str | None
    device_user_id: str
    punch_time: datetime
    direction: str | None
    verify_mode: str | None
    source: str
    raw_payload: str
    received_at: datetime
    employee_id: uuid.UUID | None
    employee_code: str | None
    employee_name: str | None


class SyncLogOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    trigger: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    window_from: datetime | None
    window_to: datetime | None
    fetched: int
    inserted: int
    duplicates: int
    unmapped: int
    rejected: int
    error: str | None
    details: dict | None
    created_by: str | None


class LiveRow(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    full_name: str
    department: str | None
    designation: str | None
    branch: str | None
    category: str
    first_check_in: datetime | None
    last_check_out: datetime | None
    last_punch: datetime | None
    punch_count: int
    status: Literal["in", "out", "not_arrived"]
    last_synced_at: datetime | None


class LiveBoard(BaseModel):
    date: date
    rows: list[LiveRow]
    counts: dict
    devices: dict
    last_sync_at: datetime | None

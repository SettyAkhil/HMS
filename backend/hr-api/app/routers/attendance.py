import asyncio
import json
import uuid
from datetime import date, datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import AppError
from app.live import async_client, channel
from app.schemas.attendance import (
    ConnectionTestOut,
    DeviceIn,
    DeviceOut,
    DeviceUpdate,
    IntegrationIn,
    IntegrationOut,
    IntegrationUpdate,
    LiveBoard,
    MappingEnd,
    MappingIn,
    MappingOut,
    PunchOut,
    SyncLogOut,
    SyncRequest,
    SyncResult,
    UnmappedOut,
)
from app.security import ATTENDANCE_WRITE, Principal, get_db, require, require_hr_read
from app.services import attendance as svc
from app.services.common import Page

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


# --- integrations ------------------------------------------------------------


@router.get("/integrations", response_model=list[IntegrationOut])
def list_integrations(_: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return [svc.integration_out(i) for i in svc.list_integrations(db)]


@router.post("/integrations", response_model=IntegrationOut, status_code=201)
def create_integration(body: IntegrationIn, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                       db: Session = Depends(get_db)):
    if body.provider == "simulator" and not body.base_url.startswith("sim://"):
        raise AppError("Simulator integrations use a sim:// URL")
    if body.provider != "simulator" and body.base_url.startswith("sim://"):
        raise AppError("Only the simulator provider accepts a sim:// URL")
    return svc.integration_out(svc.create_integration(db, body.model_dump()))


@router.patch("/integrations/{integration_id}", response_model=IntegrationOut)
def update_integration(integration_id: uuid.UUID, body: IntegrationUpdate,
                       _: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return svc.integration_out(svc.update_integration(db, integration_id, body.model_dump(exclude_unset=True)))


@router.delete("/integrations/{integration_id}", status_code=204)
def delete_integration(integration_id: uuid.UUID, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                       db: Session = Depends(get_db)):
    svc.delete_integration(db, integration_id)
    return Response(status_code=204)


@router.post("/integrations/{integration_id}/test", response_model=ConnectionTestOut)
def test_integration(integration_id: uuid.UUID, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                     db: Session = Depends(get_db)):
    return svc.test_integration(db, integration_id)


@router.post("/integrations/{integration_id}/discover-devices", response_model=list[DeviceOut])
def discover_devices(integration_id: uuid.UUID, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                     db: Session = Depends(get_db)):
    return svc.discover_devices(db, integration_id)


@router.post("/integrations/{integration_id}/sync", response_model=SyncResult)
def sync_integration(integration_id: uuid.UUID, body: SyncRequest | None = None,
                     principal: Principal = Depends(require(ATTENDANCE_WRITE))):
    window = None
    if body and (body.window_from or body.window_to):
        if not (body.window_from and body.window_to) or body.window_to <= body.window_from:
            raise AppError("Give both window_from and window_to, with window_to after window_from")
        to_utc = lambda d: d if d.tzinfo else d.replace(tzinfo=timezone.utc)  # noqa: E731
        window = (to_utc(body.window_from), to_utc(body.window_to))
    trigger = "retry" if window else "manual"
    return svc.run_sync(principal.tenant_id, integration_id, trigger, principal.username, window)


@router.get("/sync-logs", response_model=Page[SyncLogOut])
def sync_logs(integration_id: uuid.UUID | None = None, page: int = 1, page_size: int = 25,
              _: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return svc.sync_logs(db, integration_id, page, page_size)


# --- devices -----------------------------------------------------------------


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(integration_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
                 db: Session = Depends(get_db)):
    return svc.list_devices(db, integration_id)


@router.post("/devices", response_model=DeviceOut, status_code=201)
def create_device(body: DeviceIn, _: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return svc.create_device(db, body.model_dump())


@router.patch("/devices/{device_id}", response_model=DeviceOut)
def update_device(device_id: uuid.UUID, body: DeviceUpdate, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                  db: Session = Depends(get_db)):
    return svc.update_device(db, device_id, body.model_dump(exclude_unset=True))


@router.delete("/devices/{device_id}", status_code=204)
def retire_device(device_id: uuid.UUID, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                  db: Session = Depends(get_db)):
    svc.retire_device(db, device_id)
    return Response(status_code=204)


# --- mappings ----------------------------------------------------------------


@router.get("/mappings", response_model=list[MappingOut])
def list_mappings(integration_id: uuid.UUID | None = None, employee_id: uuid.UUID | None = None,
                  include_ended: bool = False, _: Principal = Depends(require_hr_read),
                  db: Session = Depends(get_db)):
    return svc.list_mappings(db, integration_id, employee_id, include_ended)


@router.post("/mappings", response_model=MappingOut, status_code=201)
def create_mapping(body: MappingIn, _: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return svc.create_mapping(db, body.model_dump())


@router.post("/mappings/{mapping_id}/end", response_model=MappingOut)
def end_mapping(mapping_id: uuid.UUID, body: MappingEnd, _: Principal = Depends(require(ATTENDANCE_WRITE)),
                db: Session = Depends(get_db)):
    return svc.end_mapping(db, mapping_id, body.effective_to)


@router.get("/unmapped", response_model=list[UnmappedOut])
def unmapped(integration_id: uuid.UUID | None = None, _: Principal = Depends(require(ATTENDANCE_WRITE)),
             db: Session = Depends(get_db)):
    return svc.unmapped_summary(db, integration_id)


# --- punches & live ----------------------------------------------------------


@router.get("/punches", response_model=Page[PunchOut])
def punches(
    employee_id: uuid.UUID | None = None,
    device_id: uuid.UUID | None = None,
    device_user_id: str | None = Query(None, max_length=40),
    mapped: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 50,
    _: Principal = Depends(require_hr_read),
    db: Session = Depends(get_db),
):
    filters = {"employee_id": employee_id, "device_id": device_id, "device_user_id": device_user_id,
               "mapped": mapped, "date_from": date_from, "date_to": date_to}
    return svc.list_punches(db, filters, page, page_size)


@router.get("/live", response_model=LiveBoard)
def live(
    day: date | None = None,
    branch_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    designation_id: uuid.UUID | None = None,
    employee_category: str | None = None,
    status: Literal["in", "out", "not_arrived"] | None = None,
    _: Principal = Depends(require_hr_read),
    db: Session = Depends(get_db),
):
    today = datetime.now(ZoneInfo(settings.timezone)).date()
    filters = {"branch_id": branch_id, "department_id": department_id, "designation_id": designation_id,
               "employee_category": employee_category, "status": status}
    return svc.live_board(db, day or today, filters)


@router.get("/live/stream")
async def live_stream(request: Request, principal: Principal = Depends(require_hr_read)):
    """Server-sent events: one message per committed sync/device change for
    the caller's own hospital, plus a heartbeat so proxies keep it open."""

    async def events():
        client = async_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(channel(principal.tenant_id))
        try:
            yield "retry: 5000\nevent: ready\ndata: {}\n\n"
            idle = 0.0
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("type") == "message":
                    data = message["data"].decode() if isinstance(message["data"], bytes) else message["data"]
                    kind = json.loads(data).get("kind", "update")
                    yield f"event: {kind}\ndata: {data}\n\n"
                    idle = 0.0
                else:
                    idle += 1.0
                    if idle >= 15:
                        yield ": heartbeat\n\n"
                        idle = 0.0
                await asyncio.sleep(0)
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()
            await client.aclose()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

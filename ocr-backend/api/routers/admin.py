from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import CurrentUser, require_admin
from database.db_utils import get_audit_log, list_users, set_user_role

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class SetRoleRequest(BaseModel):
    role: str  # "user" | "admin"


@router.get("/audit-log")
async def audit_log(
    limit: int = 200,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    current_user: CurrentUser = Depends(require_admin),
):
    """Who did what, when — every ocr/summarizer upload+export and
    assistant chat is logged (see database.db_utils.log_audit_event)."""
    return get_audit_log(limit=limit, user_id=user_id, action=action)


@router.get("/users")
async def users(current_user: CurrentUser = Depends(require_admin)):
    return list_users()


@router.post("/users/{user_id}/role")
async def update_role(user_id: int, payload: SetRoleRequest, current_user: CurrentUser = Depends(require_admin)):
    if payload.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'.")
    ok = set_user_role(user_id, payload.role)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": f"User {user_id} role set to '{payload.role}'."}

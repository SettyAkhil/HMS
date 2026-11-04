from fastapi import APIRouter, Depends, HTTPException, Request

from core.rate_limit import limiter
from core.schemas import LoginRequest, RegisterRequest, TokenResponse, MessageResponse
from core.security import create_access_token, get_current_user, CurrentUser
from database.db_utils import log_audit_event, register_user, verify_login

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse)
@limiter.limit("10/minute")
async def register(request: Request, payload: RegisterRequest):
    ok, message = register_user(payload.username, payload.password)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    log_audit_event(None, "auth.register", "user", payload.username, request.client.host)
    return MessageResponse(message=message)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest):
    ok, user_id, role = verify_login(payload.username, payload.password)
    if not ok:
        log_audit_event(None, "auth.login_failed", "user", payload.username, request.client.host)
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_access_token(user_id=user_id, username=payload.username, role=role)
    log_audit_event(user_id, "auth.login", "user", payload.username, request.client.host)
    return TokenResponse(access_token=token, user_id=user_id, username=payload.username)


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)):
    return {"user_id": current_user.user_id, "username": current_user.username, "role": current_user.role}

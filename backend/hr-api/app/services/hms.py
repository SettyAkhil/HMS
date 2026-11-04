"""Calls into other HospAI services, always through the gateway and always as
the signed-in user (their session cookie and CSRF token are forwarded). HR
never reads another service's database, and never acts with more authority
than the person who triggered the action: if they lack the permission the
other service requires, the call is refused there and recorded as pending."""

from dataclasses import dataclass

import httpx
from fastapi import Request

from app.config import settings


@dataclass
class CallerContext:
    session: str | None
    csrf: str | None

    @classmethod
    def from_request(cls, request: Request) -> "CallerContext":
        return cls(request.cookies.get(settings.session_cookie_name), request.cookies.get("csrf_token"))


@dataclass
class HmsResult:
    ok: bool
    status: int
    data: dict | None
    error: str | None = None


def call(ctx: CallerContext | None, method: str, path: str, json: dict | None = None, timeout: float = 10) -> HmsResult:
    if ctx is None or not ctx.session:
        return HmsResult(False, 0, None, "No user session to act with")
    cookies = {settings.session_cookie_name: ctx.session}
    headers = {"Accept": "application/json"}
    if ctx.csrf:
        cookies["csrf_token"] = ctx.csrf
        headers["X-CSRF-Token"] = ctx.csrf
    try:
        resp = httpx.request(method, f"{settings.gateway_url}{path}", json=json, cookies=cookies, headers=headers,
                             timeout=timeout)
    except httpx.HTTPError as exc:
        return HmsResult(False, 0, None, f"{exc.__class__.__name__} reaching {path}")
    try:
        data = resp.json()
    except ValueError:
        data = None
    if resp.status_code >= 400:
        message = (data or {}).get("error") or (data or {}).get("message") or f"HTTP {resp.status_code}"
        return HmsResult(False, resp.status_code, data, str(message)[:300])
    return HmsResult(True, resp.status_code, data)

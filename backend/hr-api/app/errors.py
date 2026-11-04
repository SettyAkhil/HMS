"""One error shape for every route: {"error": message, "code": ..., "details": ...}.
`error` stays a plain string because the frontend's apiFetch reads it as one,
same as every Flask service behind the gateway."""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


class AppError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details


class NotFound(AppError):
    status, code = 404, "not_found"


class Conflict(AppError):
    status, code = 409, "conflict"


class Forbidden(AppError):
    status, code = 403, "forbidden"


class Unauthorized(AppError):
    status, code = 401, "unauthorized"


class Unavailable(AppError):
    status, code = 503, "unavailable"


def _body(message: str, code: str, details=None) -> dict:
    body = {"error": message, "code": code}
    if details:
        body["details"] = details
    return jsonable_encoder(body)


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(_body(exc.message, exc.code, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(_body("Validation failed", "validation_error", {"fields": fields}), status_code=422)

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError):
        # Constraint names are ours and safe to show; the SQL is not.
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        return JSONResponse(
            _body("This conflicts with an existing record", "conflict", {"constraint": constraint}),
            status_code=409,
        )

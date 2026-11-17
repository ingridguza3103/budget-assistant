from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .activity import router as activity_router
from .auth import router as auth_router
from .bills import router as bills_router
from .budget_demo import router as demo_router
from .budgets import router as budget_router
from .config import settings

app = FastAPI(title="Budget Assistant")
app.include_router(auth_router)
app.include_router(budget_router)
app.include_router(activity_router)
app.include_router(demo_router)
app.include_router(bills_router)


@app.middleware("http")
async def verify_origin(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("origin") != settings.app_origin:
        response = JSONResponse(
            status_code=403,
            content={"detail": "Open Budget Assistant at its configured address and try again."},
        )
    else:
        response = await call_next(request)
    if request.url.path.startswith(("/api/auth/", "/api/budgets")):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    # Validation details can contain submitted credentials. Return message text only.
    fields = {issue["loc"][-1] for issue in error.errors() if issue["loc"]}
    if "username" in fields:
        message = "Invalid characters in username. Use letters and numbers only."
    elif "password" in fields:
        message = "Enter a password of up to 128 characters."
    else:
        message = "Check the submitted fields and try again."
    return JSONResponse(status_code=422, content={"detail": message})

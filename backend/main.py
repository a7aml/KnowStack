from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from config.settings import settings
from middleware.rate_limit_middleware import RATE_LIMIT_MESSAGE, limiter
from routes.auth_routes import router as auth_router
from routes.document_routes import router as document_router
from routes.employee_auth_routes import router as employee_auth_router
from routes.employee_routes import router as employee_router
from routes.organization_routes import router as organization_router

app = FastAPI(title="KnowStack API")

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": RATE_LIMIT_MESSAGE},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(document_router)
app.include_router(employee_router)
app.include_router(employee_auth_router)
app.include_router(organization_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

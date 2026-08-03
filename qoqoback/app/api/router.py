from fastapi import APIRouter

from app.api.routes import (
    auth,
    content,
    health,
    logs,
    news,
    orders,
    references,
    reports,
    settings,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(logs.router)
api_router.include_router(settings.router)
api_router.include_router(content.router)
api_router.include_router(news.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(orders.router)
api_router.include_router(reports.router)
api_router.include_router(references.router)

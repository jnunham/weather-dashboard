from fastapi import APIRouter, Query

from ..services import geocode as geocode_service

router = APIRouter(prefix="/api", tags=["geocode"])


@router.get("/geocode")
async def geocode(q: str = Query(..., min_length=1)):
    return await geocode_service.geocode(q)

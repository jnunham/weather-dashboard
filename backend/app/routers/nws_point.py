from fastapi import APIRouter, Query

from ..services import nws

router = APIRouter(prefix="/api", tags=["nws"])


@router.get("/conditions")
async def conditions(lat: float = Query(...), lon: float = Query(...)):
    return await nws.get_current_conditions(lat, lon)


@router.get("/forecast")
async def forecast(lat: float = Query(...), lon: float = Query(...)):
    return await nws.get_forecast(lat, lon)


@router.get("/afd")
async def afd(lat: float = Query(...), lon: float = Query(...)):
    return await nws.get_afd(lat, lon)

from fastapi import APIRouter, Query

from ..services import nws

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts")
async def alerts(lat: float = Query(...), lon: float = Query(...)):
    return await nws.get_alerts(lat, lon)

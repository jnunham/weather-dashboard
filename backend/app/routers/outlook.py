from fastapi import APIRouter, Query

from ..services import spc

router = APIRouter(prefix="/api", tags=["outlook"])


@router.get("/outlook")
async def outlook(day: str = Query("1"), hazard: str = Query("cat")):
    return await spc.get_outlook(day, hazard)

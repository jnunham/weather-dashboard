from fastapi import APIRouter

from ..services import spc

router = APIRouter(prefix="/api", tags=["spc-feeds"])


@router.get("/mesoscale-discussions")
async def mesoscale_discussions():
    return await spc.get_mesoscale_discussions()


@router.get("/watches")
async def watches():
    return await spc.get_watches()

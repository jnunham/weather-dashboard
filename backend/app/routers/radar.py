import httpx
from fastapi import APIRouter, HTTPException, Response

from ..cache import cached
from ..config import USER_AGENT

router = APIRouter(prefix="/api/radar", tags=["radar"])

HEADERS = {"User-Agent": USER_AGENT}
RAINVIEWER_TILE_HOST = "https://tilecache.rainviewer.com"


@router.get("/frames")
async def frames():
    async def fetch():
        async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
            try:
                resp = await client.get("https://api.rainviewer.com/public/weather-maps.json")
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(502, "Could not reach RainViewer") from exc
        return resp.json()

    return await cached("radar-frames", 120, fetch)


@router.get("/tile/{full_path:path}")
async def radar_tile(full_path: str):
    """Proxies RainViewer radar tile images. See tiles.base_tile for why this
    goes through the backend instead of being fetched directly by the browser."""
    url = f"{RAINVIEWER_TILE_HOST}/{full_path}"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Could not reach RainViewer") from exc
    return Response(content=resp.content, media_type="image/png", headers={"Cache-Control": "public, max-age=120"})

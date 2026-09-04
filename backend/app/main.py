from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, DEFAULT_LOCATION
from .routers import alerts, geocode, nws_point, outlook, radar, radar_products, spc_feeds

app = FastAPI(title="Weather Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(nws_point.router)
app.include_router(alerts.router)
app.include_router(outlook.router)
app.include_router(spc_feeds.router)
app.include_router(geocode.router)
app.include_router(radar.router)
app.include_router(radar_products.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "default_location": DEFAULT_LOCATION}


# In production, build the frontend (`npm run build`) and uncomment this to
# serve it from the same FastAPI process/origin — avoids CORS entirely and
# makes this a single deployable service:
#
# from pathlib import Path
# from fastapi.staticfiles import StaticFiles
# frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
# if frontend_dist.exists():
#     app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

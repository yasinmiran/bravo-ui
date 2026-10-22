import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.api import assets, auth, jobs, processes, rules, workspaces
from app.api.auth import require_passphrase
from app.config import BACKEND_DIR, settings

FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    jobs.fail_interrupted()
    yield


app = FastAPI(title="Triage", lifespan=lifespan)
app.include_router(auth.router)
for router in (workspaces.router, assets.router, rules.router, processes.router):
    app.include_router(router, dependencies=[Depends(require_passphrase)])
app.include_router(processes.stream_router)


@app.get("/api/health")
def health():
    return {"ok": True, "fake_model": settings.fake_model, "fake_delay": settings.fake_delay,
            "api_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "assess_model": settings.assess_model, "extract_model": settings.extract_model,
            "workers": settings.workers}


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "not found")
        candidate = FRONTEND_DIST / path
        if path and candidate.is_file() and candidate.resolve().is_relative_to(FRONTEND_DIST.resolve()):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})

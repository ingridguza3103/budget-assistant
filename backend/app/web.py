from pathlib import Path

from fastapi.staticfiles import StaticFiles

from .main import app

frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

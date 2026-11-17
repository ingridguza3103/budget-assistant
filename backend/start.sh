#!/bin/sh
set -eu

export APP_ORIGIN="${APP_ORIGIN:-${RENDER_EXTERNAL_URL:?Set APP_ORIGIN or RENDER_EXTERNAL_URL}}"
python -m alembic upgrade head
exec python -m uvicorn app.web:app --host 0.0.0.0 --port "${PORT:-10000}"

# Budget Assistant

**Plan your months. See where the year is heading.**

Budget Assistant brings monthly planning, recorded spending, bill schedules, and a rolling balance forecast into one application. Start with your current balance, build your monthly plans, and see how much remains across the months you choose. As a month’s activity is completed, switch its forecast contribution from planned figures to recorded activity.

Built with **React, TypeScript, FastAPI, and PostgreSQL**, with automated tests, coverage enforcement, and continuous delivery.

**[Open the live demo](https://budget-assistant-p1y3.onrender.com/)** · **[View CI runs](https://github.com/ingridguza3103/budget-assistant/actions)** · **[Report an issue](https://github.com/ingridguza3103/budget-assistant/issues)**

[![CI](https://github.com/ingridguza3103/budget-assistant/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ingridguza3103/budget-assistant/actions/workflows/ci.yml)
![Coverage gate](https://img.shields.io/badge/Coverage%20gate-80%25-88e788?labelColor=1E293B)

## Try the demo

1. Create a username and password account. No email is required.
2. Choose an unused month and select **Try a sample budget**.
3. Review and save the fictional sample to explore its plan, transactions, and scheduled bills.
4. Open **View forecast**, enter a starting balance, choose a range, and save the forecast settings.

Your saved budgets remain available when you sign in again. The first request may take a moment while the hosting service starts.

## Features

| Feature | What you can do |
| --- | --- |
| Monthly planning | Create, reopen, edit, and delete months. Copy the preceding calendar month’s allocations into a new plan. |
| Detailed categories | Plan and record Bills, Everyday expenses, Travel, Gifts, Groceries, Savings, Debt payments, and Other. |
| Actual activity | Add, edit, delete, search, and filter dated income and outflow entries. |
| Monthly dashboard | Compare planned and actual figures with category charts, percentages, and variance indicators. |
| Balance forecast | Set a positive or negative opening balance and inclusive **Forecast from** and **Forecast until** limits. |
| Plan-to-actual updates | Select **Use actuals** for completed months while future months continue using their plans. |
| Bill calendar | Schedule bills, select dates, filter payment statuses, and identify overdue payments. Add monthly repeats with independent payment statuses. |
| What if? | Preview changes to allocations and apply a scenario to the plan editor for review and saving. |

The interface also includes unsaved-change prompts, previous/next saved-month navigation, and URLs that preserve the open month and calendar view.

## How the forecast works

Amounts are stored as **integer cents** and displayed in euros.

```text
Planned net  = expected income − planned allocations
Recorded net = recorded income − recorded outflow
```

The dashboard keeps three figures separate:

| Figure | Calculation |
| --- | --- |
| Plan at end | Opening balance plus the planned net for every included month. |
| Forecast at end | Opening balance plus recorded net for months marked **Use actuals**, and planned net for the remaining months. |
| Actual balance | Opening balance plus recorded net through consecutive included months marked **Use actuals**. |

The explicit switch lets you enter transactions gradually without replacing a complete month’s plan with partial records. Changing recorded activity in a month already using actuals recalculates the forecast.

Both range boundaries are inclusive. Only saved budget months contribute; missing months are not estimated. Choosing **Last saved month** leaves the upper limit open as more budgets are added.

Savings contributions and debt payments count as allocations and outflow in this budgeting model.

### Bills and recorded spending

A bill’s paid status tracks its schedule. **Record payment** opens a prefilled Activity entry; saving that entry includes the payment in actual spending.

Monthly bill rules generate occurrences for eligible saved budgets. Each occurrence has its own paid status, and due dates adapt to shorter months.

## Engineering and architecture

This portfolio project covers frontend development, Python API design, relational modelling, test engineering, and deployment automation.

The backend is a **modular monolith** organized around authentication, monthly plans, activity, bills, recurrence, and forecasting. Shared validation and ownership checks keep account access consistent across endpoints.

In production, one Render web service serves the compiled React application and the API from the same origin. Neon hosts PostgreSQL.

| Area | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database access | SQLAlchemy, Psycopg |
| Persistence and migrations | PostgreSQL, Alembic |
| Frontend testing | Vitest, React Testing Library, jsdom, V8 coverage |
| Backend testing | unittest, HTTPX, coverage.py, PostgreSQL |
| CI and analysis | GitHub Actions, SonarQube Cloud |
| Hosting | Render, Neon |

### Implementation choices

- **Account isolation:** backend operations check budget ownership before accessing or changing a month’s data.
- **Data integrity:** database constraints enforce valid amounts, category values, month boundaries, and forecast ranges.
- **Schema evolution:** versioned Alembic migrations extend existing data. Older plan payloads preserve allocations for categories they omit.
- **Reproducible CI:** Python dependencies are pinned with hashes; npm uses the committed lockfile; GitHub Actions are pinned to commit SHAs.
- **Controlled delivery:** builds, migrations, tests, coverage enforcement, and configured quality checks precede automatic deployment.

### Authentication and security

- Case-sensitive credentials and alphanumeric usernames.
- Argon2 password hashing.
- Random session tokens, stored as digests in PostgreSQL, with expiry and logout revocation.
- HttpOnly, SameSite cookies, with Secure cookies for HTTPS deployments.
- Database-backed login and signup throttling.
- Origin validation for state-changing requests.
- Validation responses that omit submitted credential values.

## Testing and quality

Backend integration tests exercise the API against PostgreSQL. Frontend tests exercise components and user interactions with controlled API responses.

The suite covers authentication and session expiry, rejected origins, cross-account access, budget and transaction lifecycles, forecast calculations, date-range validation, recurring bills, error states, retries, filters, navigation, and unsaved changes.

### Last verified test snapshot

Local verification on **19 November 2026**:

| Suite | Tests | Line coverage | Branch coverage |
| --- | ---: | ---: | ---: |
| Backend | 32 | 97.00% | 89.66% |
| Frontend | 64 | 94.67% | 87.97% |

**96 automated tests. 93.13% combined application line and branch coverage.**

CI fails below **80% combined application line and branch coverage**. The gate aggregates covered lines and branches across both applications. Current summaries and downloadable coverage reports are available in [GitHub Actions](https://github.com/ingridguza3103/budget-assistant/actions).

SonarQube Cloud imports the Python XML and frontend LCOV reports for coverage analysis alongside its code-quality and security checks.

## Run locally

These commands use Bash, including Ubuntu or WSL. Install **Python 3.12** with virtual environment support, **Node.js 24**, **Git**, and **Docker** or a local **PostgreSQL 17** installation.

### 1. Clone and install

```bash
git clone https://github.com/ingridguza3103/budget-assistant.git
cd budget-assistant

python3.12 -m venv backend/.venv
source backend/.venv/bin/activate

python -m pip install --only-binary :all: --require-hashes \
  -r backend/requirements-ci.lock
npm --prefix frontend ci --ignore-scripts
```

This uses the same Python dependency lockfile as CI.

### 2. Configure and start PostgreSQL

Choose your own local development password:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_NAME=budget_assistant
export DB_USER=budget_app
export DB_PASSWORD="replace-with-your-local-development-password"
export APP_ORIGIN=http://127.0.0.1:5173

docker run -d \
  --name budget-assistant-postgres \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -v budget_assistant_pgdata:/var/lib/postgresql/data \
  postgres:17-alpine

docker exec budget-assistant-postgres \
  pg_isready -U "$DB_USER" -d "$DB_NAME"
```

Continue when PostgreSQL reports that it is accepting connections. For an existing PostgreSQL instance, create a database and adjust the connection variables to match it.

The backend also reads `backend/.env`; [the example file](backend/.env.example) lists the local settings. Environment variables take precedence. Keep your local configuration untracked.

### 3. Apply migrations and start the API

In the same terminal, with the virtual environment and database variables active:

```bash
cd backend
python -m alembic upgrade head
python -m alembic check
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4. Start the frontend

In another terminal, from the repository root:

```bash
npm --prefix frontend run dev
```

Open **http://127.0.0.1:5173**. Vite forwards `/api` requests to the backend on port 8000. Use the origin configured in `APP_ORIGIN` when accessing the app.

## Run tests locally

From the repository root:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:coverage
```

<details>
<summary>Run backend tests and the combined coverage gate</summary>

Use the backend terminal, with its virtual environment and local database variables active. With the Docker setup above, create a dedicated test database once:

```bash
docker exec budget-assistant-postgres \
  createdb -U "$DB_USER" budget_assistant_test
```

The following subshell points the backend at that test database. SQLAlchemy builds the connection URL so passwords containing special characters are encoded correctly.

```bash
(
  set -e
  DATABASE_URL="$(python - <<'PY'
import os
from sqlalchemy import URL

print(URL.create(
    "postgresql+psycopg",
    username=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    host=os.environ["DB_HOST"],
    port=int(os.environ["DB_PORT"]),
    database="budget_assistant_test",
).render_as_string(hide_password=False))
PY
  )"
  export DATABASE_URL

  cd backend
  python -m alembic upgrade head
  python -m alembic check
  cd ..

  PYTHONPATH=backend python -m coverage run \
    -m unittest discover -s backend/tests -v
  python -m coverage xml -o backend/coverage.xml
  python -m coverage json -o backend/coverage.json
)
```

After generating both frontend and backend reports:

```bash
python scripts/check_coverage.py
```

The CI workflow provisions its own PostgreSQL database automatically.

</details>

## CI/CD and deployment

The [CI workflow](.github/workflows/ci.yml) runs for pushes to `main`, pull requests targeting `main`, and manual dispatches. It builds the frontend, applies and checks migrations, runs both test suites, enforces coverage, and uploads reports. SonarQube Cloud analysis is configured on `main` when the required project variables and token are present.

Render deploys from `main` after the configured CI checks pass. [`backend/start.sh`](backend/start.sh) applies pending migrations before starting Uvicorn and serving the compiled frontend. Production database access uses `DATABASE_URL`; Neon supplies PostgreSQL.

## Explore the code

| Path | Responsibility |
| --- | --- |
| [`frontend/src/`](frontend/src/) | Components, charts, forms, navigation, and API clients. |
| [`backend/app/`](backend/app/) | API routes, authentication, models, and application logic. |
| [`backend/app/forecast.py`](backend/app/forecast.py) | Forecast settings and cumulative balance calculations. |
| [`backend/app/recurrence.py`](backend/app/recurrence.py) | Monthly bill occurrence generation. |
| [`backend/alembic/`](backend/alembic/) | Versioned database migrations. |
| [`backend/tests/`](backend/tests/) and [`frontend/tests/`](frontend/tests/) | Automated test suites. |
| [`scripts/check_coverage.py`](scripts/check_coverage.py) | Combined application coverage gate. |

---

Built by [ingridguza3103](https://github.com/ingridguza3103).

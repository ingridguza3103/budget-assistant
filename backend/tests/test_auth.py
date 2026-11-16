import secrets
import unittest
from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, update

from app.auth import cookie_name, token_digest
from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models import LoginSession, User


def remove_test_account(username: str) -> None:
    with SessionLocal.begin() as db:
        db.execute(delete(User).where(User.username == username))


class AuthFlowTest(unittest.IsolatedAsyncioTestCase):
    async def test_signup_login_and_logout(self) -> None:
        username = f"CITest{secrets.token_hex(6)}"
        password = "Demo8abc"
        self.addCleanup(remove_test_account, username)

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url=settings.app_origin,
            headers={"Origin": settings.app_origin},
        ) as client:
            self.assertEqual((await client.get("/api/auth/me")).status_code, 401)

            rejected = await client.post(
                "/api/auth/signup",
                json={"username": username, "password": password[:-1]},
            )
            self.assertEqual(rejected.status_code, 400, rejected.text)
            self.assertEqual(rejected.json()["detail"], "Use at least 8 characters for your password.")

            credentials = {"username": username, "password": password}
            created = await client.post("/api/auth/signup", json=credentials)
            self.assertEqual(created.status_code, 201, created.text)
            self.assertIn("HttpOnly", created.headers["set-cookie"])
            self.assertEqual((await client.get("/api/auth/me")).json(), {"username": username})

            duplicate = await client.post("/api/auth/signup", json=credentials)
            self.assertEqual(duplicate.status_code, 409, duplicate.text)

            self.assertEqual((await client.post("/api/auth/logout")).status_code, 204)
            self.assertEqual((await client.get("/api/auth/me")).status_code, 401)

            wrong_case = await client.post(
                "/api/auth/login",
                json={**credentials, "username": username.lower()},
            )
            self.assertEqual(wrong_case.status_code, 401)

            signed_in = await client.post("/api/auth/login", json=credentials)
            self.assertEqual(signed_in.status_code, 200, signed_in.text)
            self.assertEqual((await client.get("/api/auth/me")).json(), {"username": username})
            self.assertEqual((await client.post("/api/auth/logout")).status_code, 204)

    async def test_rejects_untrusted_origins_and_invalid_credentials(self) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url=settings.app_origin,
            headers={"Origin": settings.app_origin},
        ) as client:
            untrusted = await client.post(
                "/api/auth/login",
                headers={"Origin": "https://untrusted.example"},
                json={"username": "BudgetUser8", "password": "Demo8abc"},
            )
            self.assertEqual(untrusted.status_code, 403)

            for credentials, expected in (
                ({"username": "Budget_User", "password": "Demo8abc"}, "letters and numbers only"),,
                ({"username": "BudgetUser8", "password": ""}, "Enter a password"),
            ):
                with self.subTest(credentials=expected):
                    rejected = await client.post("/api/auth/signup", json=credentials)
                    self.assertEqual(rejected.status_code, 422)
                    self.assertIn(expected, rejected.json()["detail"])

    async def test_expired_cookie_cannot_resume_a_session(self) -> None:
        username = f"CITest{secrets.token_hex(6)}"
        self.addCleanup(remove_test_account, username)

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url=settings.app_origin,
            headers={"Origin": settings.app_origin},
        ) as client:
            created = await client.post(
                "/api/auth/signup",
                json={"username": username, "password": "Demo8abc"},
            )
            self.assertEqual(created.status_code, 201, created.text)
            token = client.cookies[cookie_name()]

            with SessionLocal.begin() as db:
                db.execute(
                    update(LoginSession)
                    .where(LoginSession.token_hash == token_digest(token))
                    .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
                )

            self.assertEqual((await client.get("/api/auth/me")).status_code, 401)

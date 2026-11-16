import unittest

from pydantic import ValidationError

from app.auth import Credentials
from app.config import Settings


class CredentialsTest(unittest.TestCase):
    def test_keeps_case_and_password_characters(self) -> None:
        credentials = Credentials(username="BudgetUser8", password=" Demo8x ")
        self.assertEqual(credentials.username, "BudgetUser8")
        self.assertEqual(credentials.password.get_secret_value(), " Demo8x ")

    def test_rejects_usernames_with_unsupported_characters_or_lengths(self) -> None:
        for username in ("", "Budget_User", "Budget User", "a" * 65):
            with self.subTest(username=username), self.assertRaises(ValidationError):
                Credentials(username=username, password="Demo8abc")


class SettingsTest(unittest.TestCase):
    def test_https_origin_normalizes_the_trailing_slash_and_uses_secure_cookies(self) -> None:
        settings = Settings(
            _env_file=None,
            db_password="test-value",
            app_origin="https://budget.example/",
        )
        self.assertEqual(settings.app_origin, "https://budget.example")
        self.assertTrue(settings.secure_cookie)

    def test_loopback_http_origin_for_local_development(self) -> None:
        settings = Settings(
            _env_file=None,
            db_password="test-value",
            app_origin="http://127.0.0.1:5173",
        )
        self.assertEqual(settings.app_origin, "http://127.0.0.1:5173")
        self.assertFalse(settings.secure_cookie)

    def test_rejects_invalid_origins(self) -> None:
        for origin in (
            "http://budget.example",
            "https://budget.example/some-path",
            "https://user@budget.example",
        ):
            with self.subTest(origin=origin), self.assertRaises(ValidationError):
                Settings(_env_file=None, db_password="test-value", app_origin=origin)

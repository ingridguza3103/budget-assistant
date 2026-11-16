import hashlib
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import Database
from .models import AuthThrottle, LoginSession, User

router = APIRouter(prefix="/api/auth")
password_hasher = PasswordHash.recommended()
dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))
session_lifetime = timedelta(hours=8)
attempt_window_seconds = 600


class Credentials(BaseModel):
    username: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9]+$")]
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]


class SignedInUser(BaseModel):
    username: str


def token_digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def cookie_name() -> str:
    return "__Host-budget_session" if settings.secure_cookie else "budget_session"


def record_attempt(db: Session, key: str, window: int, limit: int) -> bool:
    table = AuthThrottle.__table__
    row = insert(table).values(key=token_digest(key), window=window, attempts=1)
    increment = row.on_conflict_do_update(
        index_elements=[table.c.key, table.c.window],
        set_={"attempts": func.least(table.c.attempts + 1, limit + 1)},
    ).returning(table.c.attempts)
    return db.execute(increment).scalar_one() <= limit


def throttle(db: Session, request: Request, action: str, username: str) -> None:
    now = int(time.time())
    window = now // attempt_window_seconds
    address = request.client.host if request.client else "unknown"
    ip_limit = 10 if action == "signup" else 30
    allowed = record_attempt(db, f"{action}:ip:{address}", window, ip_limit)
    if allowed and action == "login":
        allowed = record_attempt(db, f"login:user:{username}", window, 10)
    db.commit()
    if not allowed:
        retry_after = attempt_window_seconds - now % attempt_window_seconds
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Try again in a few minutes.",
            headers={"Retry-After": str(retry_after)},
        )


def revoke_session(db: Session, request: Request) -> None:
    if token := request.cookies.get(cookie_name()):
        db.execute(delete(LoginSession).where(LoginSession.token_hash == token_digest(token)))


def start_session(db: Session, request: Request, response: Response, user: User) -> SignedInUser:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    revoke_session(db, request)
    db.add(
        LoginSession(
            token_hash=token_digest(token),
            user_id=user.id,
            expires_at=now + session_lifetime,
        )
    )
    window = int(now.timestamp()) // attempt_window_seconds
    db.execute(delete(AuthThrottle).where(AuthThrottle.window < window - 1))
    db.commit()
    response.set_cookie(
        key=cookie_name(),
        value=token,
        max_age=int(session_lifetime.total_seconds()),
        httponly=True,
        secure=settings.secure_cookie,
        samesite="lax",
        path="/",
    )
    return SignedInUser(username=user.username)


@router.post("/signup", status_code=201)
def signup(credentials: Credentials, request: Request, response: Response, db: Database) -> SignedInUser:
    throttle(db, request, "signup", credentials.username)
    password = credentials.password.get_secret_value()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your password.")

    user = User(username=credentials.username, password_hash=password_hasher.hash(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        if getattr(getattr(error.orig, "diag", None), "constraint_name", None) == "uq_users_username":
            raise HTTPException(status_code=409, detail="That username is unavailable.") from error
        raise
    return start_session(db, request, response, user)


@router.post("/login")
def login(credentials: Credentials, request: Request, response: Response, db: Database) -> SignedInUser:
    throttle(db, request, "login", credentials.username)
    user = db.scalar(select(User).where(User.username == credentials.username))
    password_hash = user.password_hash if user else dummy_hash
    verified, upgraded_hash = password_hasher.verify_and_update(credentials.password.get_secret_value(), password_hash)
    if user is None or not verified:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    if upgraded_hash:
        user.password_hash = upgraded_hash
    return start_session(db, request, response, user)


def get_current_user(request: Request, db: Database) -> User:
    if token := request.cookies.get(cookie_name()):
        user = db.scalar(
            select(User)
            .join(LoginSession, LoginSession.user_id == User.id)
            .where(
                LoginSession.token_hash == token_digest(token),
                LoginSession.expires_at > datetime.now(UTC),
            )
        )
        if user:
            return user
    raise HTTPException(status_code=401, detail="Log in to continue.")


@router.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]) -> SignedInUser:
    return SignedInUser(username=user.username)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Database) -> None:
    revoke_session(db, request)
    db.commit()
    response.delete_cookie(
        key=cookie_name(),
        path="/",
        httponly=True,
        secure=settings.secure_cookie,
        samesite="lax",
    )

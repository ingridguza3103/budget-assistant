from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import URL, create_engine, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

def database_url() -> URL:
    if settings.database_url is not None:
        try:
            url = make_url(settings.database_url.get_secret_value())
        except ArgumentError:
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string.") from None
        if url.get_backend_name() != "postgresql":
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string.")
        return url.set(drivername="postgresql+psycopg")

    if settings.db_password is None:
        raise ValueError("Set DB_PASSWORD for local development or DATABASE_URL for deployment.")
    return URL.create(
        drivername="postgresql+psycopg",
        username=settings.db_user,
        password=settings.db_password.get_secret_value(),
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
    )


engine = create_engine(
    database_url(),
    pool_pre_ping=True,
    hide_parameters=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


Database = Annotated[Session, Depends(get_db)]

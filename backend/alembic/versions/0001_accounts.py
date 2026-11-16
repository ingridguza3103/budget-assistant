"""Create accounts, browser sessions, and authentication throttles."""

from alembic import op
import sqlalchemy as sa

revision = "0001_accounts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "auth_throttles",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("window", sa.Integer(), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )
    op.create_index("ix_auth_throttles_window", "auth_throttles", ["window"])


def downgrade() -> None:
    op.drop_table("auth_throttles")
    op.drop_table("sessions")
    op.drop_table("users")

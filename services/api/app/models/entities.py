import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class UserRole(StrEnum):
    CUSTOMER = "customer"
    MERCHANT = "merchant"
    ADMIN = "admin"


class VerificationStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class CampaignStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class VoucherStatus(StrEnum):
    PENDING_CHAIN = "pending_chain"
    ACTIVE = "active"
    REDEEMED = "redeemed"
    REFUNDED = "refunded"
    EXPIRED = "expired"
    FAILED = "failed"


class TransactionStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FINALIZED = "finalized"
    FAILED = "failed"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_address: Mapped[str] = mapped_column(String(44), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CUSTOMER)
    status: Mapped[str] = mapped_column(String(32), default="active")


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"
    __table_args__ = (Index("ix_auth_challenge_wallet_expiry", "wallet_address", "expires_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_address: Mapped[str] = mapped_column(String(44), index=True)
    message: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Merchant(TimestampMixin, Base):
    __tablename__ = "merchants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    wallet_address: Mapped[str] = mapped_column(String(44), index=True)
    business_name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    address: Mapped[str] = mapped_column(Text)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus), default=VerificationStatus.PENDING
    )


class Campaign(TimestampMixin, Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        UniqueConstraint("merchant_id", "external_id", name="uq_campaign_merchant_external"),
        Index("ix_campaign_discovery", "status", "starts_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(64))
    onchain_address: Mapped[str | None] = mapped_column(String(44), unique=True, nullable=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("merchants.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    terms: Mapped[str] = mapped_column(Text, default="")
    price_minor: Mapped[int] = mapped_column(BigInteger)
    original_value_minor: Mapped[int] = mapped_column(BigInteger)
    stock: Mapped[int] = mapped_column(Integer)
    sold_count: Mapped[int] = mapped_column(Integer, default=0)
    per_user_limit: Mapped[int] = mapped_column(Integer, default=1)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus), default=CampaignStatus.DRAFT
    )
    transaction_signature: Mapped[str | None] = mapped_column(String(88), nullable=True)


class Voucher(TimestampMixin, Base):
    __tablename__ = "vouchers"
    __table_args__ = (Index("ix_voucher_owner_status", "owner_user_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voucher_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    encrypted_secret: Mapped[bytes] = mapped_column(LargeBinary)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"), index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    onchain_address: Mapped[str | None] = mapped_column(String(44), unique=True, nullable=True)
    status: Mapped[VoucherStatus] = mapped_column(
        Enum(VoucherStatus), default=VoucherStatus.PENDING_CHAIN
    )
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    signature: Mapped[str] = mapped_column(String(88), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("merchants.id"), nullable=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    voucher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vouchers.id"), nullable=True)
    gross_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    commission_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    merchant_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus), default=TransactionStatus.PENDING
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

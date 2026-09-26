import hashlib
from dataclasses import dataclass
from datetime import datetime


class DomainRuleViolation(ValueError):
    """Raised when a marketplace invariant would be broken."""


@dataclass(frozen=True, slots=True)
class PaymentSplit:
    gross_amount: int
    commission_amount: int
    merchant_amount: int


def calculate_payment_split(gross_amount: int, commission_bps: int) -> PaymentSplit:
    if gross_amount <= 0:
        raise DomainRuleViolation("Gross amount must be positive")
    if not 0 <= commission_bps <= 1_000:
        raise DomainRuleViolation("Commission must be between 0 and 1000 basis points")

    commission = gross_amount * commission_bps // 10_000
    return PaymentSplit(
        gross_amount=gross_amount,
        commission_amount=commission,
        merchant_amount=gross_amount - commission,
    )


def hash_voucher_secret(secret: bytes) -> bytes:
    if len(secret) < 32:
        raise DomainRuleViolation("Voucher secret must contain at least 256 bits of entropy")
    return hashlib.sha256(secret).digest()


def assert_campaign_purchasable(
    *,
    now: datetime,
    starts_at: datetime,
    expires_at: datetime,
    stock: int,
    sold_count: int,
    per_user_limit: int,
    buyer_purchase_count: int,
    is_published: bool,
) -> None:
    if not is_published:
        raise DomainRuleViolation("Campaign is not published")
    if now < starts_at:
        raise DomainRuleViolation("Campaign has not started")
    if now >= expires_at:
        raise DomainRuleViolation("Campaign has expired")
    if sold_count >= stock:
        raise DomainRuleViolation("Campaign stock is exhausted")
    if buyer_purchase_count >= per_user_limit:
        raise DomainRuleViolation("Per-user purchase limit reached")


def assert_voucher_redeemable(
    *,
    now: datetime,
    expires_at: datetime,
    status: str,
    signer_merchant_id: str,
    campaign_merchant_id: str,
) -> None:
    if signer_merchant_id != campaign_merchant_id:
        raise DomainRuleViolation("Only the campaign merchant may redeem this voucher")
    if status != "active":
        raise DomainRuleViolation("Voucher is not active")
    if now >= expires_at:
        raise DomainRuleViolation("Voucher has expired")


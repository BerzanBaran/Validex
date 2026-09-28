"""Prepare idempotent draft campaigns for a verified local demo merchant.

Never fabricates published campaigns, chain addresses, signatures, or paid vouchers.
Run from services/api with PYTHONPATH=. (or after pip install -e .).
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.entities import Campaign, CampaignStatus, Merchant, VerificationStatus

FIXTURE = Path(__file__).resolve().parents[3] / "docs" / "demo-campaigns.json"


def load_templates() -> list[dict]:
    templates = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if not isinstance(templates, list) or not templates:
        raise ValueError("Demo campaign fixture is empty")
    for item in templates:
        if (
            not isinstance(item, dict)
            or not item.get("external_id")
            or item.get("price_minor", 0) <= 0
            or item.get("original_value_minor", 0) < item["price_minor"]
            or item.get("stock", 0) <= 0
        ):
            raise ValueError("Invalid demo campaign fixture")
    return templates


async def apply(wallet: str) -> None:
    settings = get_settings()
    if settings.environment != "development":
        raise RuntimeError("Demo seed is restricted to VALIDEX_ENVIRONMENT=development")
    now = datetime.now(UTC)
    async with SessionFactory() as session:
        merchant = await session.scalar(select(Merchant).where(Merchant.wallet_address == wallet))
        if merchant is None or merchant.verification_status != VerificationStatus.VERIFIED:
            raise RuntimeError("An existing verified demo merchant wallet is required")
        created = 0
        for item in load_templates():
            existing = await session.scalar(
                select(Campaign).where(
                    Campaign.merchant_id == merchant.id,
                    Campaign.external_id == item["external_id"],
                )
            )
            if existing is not None:
                continue
            session.add(
                Campaign(
                    merchant_id=merchant.id,
                    starts_at=now,
                    expires_at=now + timedelta(days=30),
                    status=CampaignStatus.DRAFT,
                    **item,
                )
            )
            created += 1
        await session.commit()
    print(f"Created {created} draft campaign(s); no on-chain or published data was fabricated.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--merchant-wallet", help="Existing verified merchant public key")
    parser.add_argument("--apply", action="store_true", help="Insert drafts into development DB")
    args = parser.parse_args()
    templates = load_templates()
    if not args.apply:
        print(json.dumps(templates, ensure_ascii=False, indent=2))
        print("Preview only. Use --apply --merchant-wallet <PUBLIC_KEY> for development drafts.")
        return
    if not args.merchant_wallet:
        parser.error("--merchant-wallet is required with --apply")
    asyncio.run(apply(args.merchant_wallet))


if __name__ == "__main__":
    main()

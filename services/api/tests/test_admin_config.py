import asyncio
import uuid
from types import SimpleNamespace

import base58
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import dependencies
from app.core.config import Settings
from app.models.entities import User, UserRole


def test_admin_wallet_must_be_public_key_or_empty():
    address = base58.b58encode(bytes([7]) * 32).decode("ascii")
    assert Settings(admin_wallet=address, _env_file=None).admin_wallet == address
    assert Settings(admin_wallet="", _env_file=None).admin_wallet == ""
    with pytest.raises(ValidationError):
        Settings(admin_wallet="not-a-solana-address", _env_file=None)


def test_old_admin_role_is_not_enough_after_wallet_change(monkeypatch):
    user = User(id=uuid.uuid4(), wallet_address="old-admin", role=UserRole.ADMIN)
    monkeypatch.setattr(
        dependencies, "get_settings", lambda: SimpleNamespace(admin_wallet="new-admin")
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependencies.require_admin(user))
    assert error.value.status_code == 403

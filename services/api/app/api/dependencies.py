import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session
from app.domain.auth import InvalidAccessToken, decode_access_token
from app.models.entities import User, UserRole

SessionDep = Annotated[AsyncSession, Depends(get_session)]
bearer_scheme = HTTPBearer(auto_error=False)
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)]


async def get_current_user(session: SessionDep, credentials: BearerDep) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    settings = get_settings()
    try:
        payload = decode_access_token(
            token=credentials.credentials,
            secret=settings.jwt_secret,
            issuer=settings.jwt_issuer,
        )
        user_id = uuid.UUID(str(payload["sub"]))
    except (InvalidAccessToken, KeyError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token is invalid or expired",
        ) from error

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
    if payload.get("wallet") != user.wallet_address:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token wallet mismatch",
        )
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def require_merchant(current_user: CurrentUserDep) -> User:
    if current_user.role != UserRole.MERCHANT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant role required")
    return current_user


MerchantUserDep = Annotated[User, Depends(require_merchant)]


async def require_admin(current_user: CurrentUserDep) -> User:
    if (
        current_user.role != UserRole.ADMIN
        or not get_settings().admin_wallet
        or current_user.wallet_address != get_settings().admin_wallet
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


AdminUserDep = Annotated[User, Depends(require_admin)]

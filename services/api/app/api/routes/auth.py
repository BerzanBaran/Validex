from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUserDep, SessionDep
from app.core.config import get_settings
from app.domain.auth import (
    InvalidWalletAddress,
    InvalidWalletSignature,
    create_auth_challenge,
    issue_access_token,
    verify_wallet_signature,
)
from app.models.entities import AuditLog, AuthChallenge, User, UserRole
from app.schemas.auth import (
    AuthChallengeRequest,
    AuthChallengeResponse,
    AuthTokenResponse,
    AuthUserResponse,
    AuthVerifyRequest,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()


@router.get("/me", response_model=AuthUserResponse)
async def get_authenticated_user(current_user: CurrentUserDep) -> AuthUserResponse:
    return AuthUserResponse(
        user_id=current_user.id,
        wallet_address=current_user.wallet_address,
        role=current_user.role,
    )


@router.post("/challenge", response_model=AuthChallengeResponse)
async def request_challenge(
    payload: AuthChallengeRequest,
    session: SessionDep,
) -> AuthChallengeResponse:
    now = datetime.now(UTC)
    try:
        _, message, expires_at = create_auth_challenge(
            payload.wallet_address,
            now=now,
            ttl_seconds=settings.auth_challenge_ttl_seconds,
        )
    except InvalidWalletAddress as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    challenge = AuthChallenge(
        wallet_address=payload.wallet_address,
        message=message,
        expires_at=expires_at,
    )
    session.add(challenge)
    await session.commit()
    await session.refresh(challenge)
    return AuthChallengeResponse(
        challenge_id=challenge.id,
        message=challenge.message,
        expires_at=challenge.expires_at,
    )


@router.post("/verify", response_model=AuthTokenResponse)
async def verify_challenge(
    payload: AuthVerifyRequest,
    session: SessionDep,
) -> AuthTokenResponse:
    now = datetime.now(UTC)
    result = await session.scalars(
        select(AuthChallenge)
        .where(AuthChallenge.id == payload.challenge_id)
        .with_for_update()
    )
    challenge = result.one_or_none()
    if challenge is None or challenge.wallet_address != payload.wallet_address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    if challenge.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Challenge was already used",
        )
    if challenge.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Challenge has expired")

    try:
        verify_wallet_signature(
            wallet_address=payload.wallet_address,
            message=challenge.message,
            signature_base64=payload.signature,
        )
    except (InvalidWalletAddress, InvalidWalletSignature) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error

    user = await session.scalar(select(User).where(User.wallet_address == payload.wallet_address))
    if user is None:
        user = User(wallet_address=payload.wallet_address, role=UserRole.CUSTOMER, status="active")
        session.add(user)
        await session.flush()
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is not active",
        )

    challenge.used_at = now
    session.add(
        AuditLog(
            actor_id=user.id,
            action="auth.wallet_login",
            entity_type="user",
            entity_id=str(user.id),
        )
    )
    token, expires_at = issue_access_token(
        user_id=user.id,
        wallet_address=user.wallet_address,
        role=user.role.value,
        secret=settings.jwt_secret,
        issuer=settings.jwt_issuer,
        ttl_minutes=settings.access_token_ttl_minutes,
        now=now,
    )
    await session.commit()
    return AuthTokenResponse(
        access_token=token,
        expires_at=expires_at,
        user_id=user.id,
        wallet_address=user.wallet_address,
        role=user.role,
    )

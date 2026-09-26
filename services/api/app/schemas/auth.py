import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import UserRole


class AuthChallengeRequest(BaseModel):
    wallet_address: str = Field(min_length=32, max_length=44)


class AuthChallengeResponse(BaseModel):
    challenge_id: uuid.UUID
    message: str
    expires_at: datetime


class AuthVerifyRequest(BaseModel):
    challenge_id: uuid.UUID
    wallet_address: str = Field(min_length=32, max_length=44)
    signature: str = Field(min_length=80, max_length=100)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user_id: uuid.UUID
    wallet_address: str
    role: UserRole


class AuthUserResponse(BaseModel):
    user_id: uuid.UUID
    wallet_address: str
    role: UserRole

"""Read-only network status; financial state changes use strict proof verification."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.dependencies import CurrentUserDep
from app.domain.solana_chain import ChainVerificationError
from app.domain.transaction_tracker import ChainStatus, transaction_status

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionStatusRead(BaseModel):
    signature: str
    status: ChainStatus


@router.get("/{signature}/status", response_model=TransactionStatusRead)
async def get_transaction_status(
    signature: str, current_user: CurrentUserDep
) -> TransactionStatusRead:
    _ = current_user
    try:
        network_status = await transaction_status(signature)
    except ChainVerificationError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return TransactionStatusRead(signature=signature, status=network_status)

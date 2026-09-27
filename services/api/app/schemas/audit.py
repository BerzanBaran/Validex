import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditEventRead(BaseModel):
    id: uuid.UUID
    action: str
    actor_wallet: str | None
    entity_type: str
    entity_id: str
    created_at: datetime

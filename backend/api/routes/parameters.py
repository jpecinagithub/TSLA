from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import Parameter, ParamAudit

router = APIRouter(prefix="/api/parameters", tags=["parameters"])


class ParamUpdate(BaseModel):
    value: str


@router.get("")
def list_params(db: Session = Depends(get_db)):
    rows = db.query(Parameter).all()
    return [
        {"key": r.key_name, "value": r.value, "description": r.description, "updated_at": r.updated_at}
        for r in rows
    ]


@router.put("/{key_name}")
def update_param(key_name: str, body: ParamUpdate, db: Session = Depends(get_db)):
    param = db.get(Parameter, key_name)
    if not param:
        raise HTTPException(404, f"Parameter '{key_name}' not found")

    audit = ParamAudit(
        key_name  = key_name,
        old_value = param.value,
        new_value = body.value,
        ts        = datetime.now(timezone.utc).replace(tzinfo=None),
    )
    param.value      = body.value
    param.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(audit)
    db.commit()
    return {"key": key_name, "value": param.value, "updated_at": param.updated_at}

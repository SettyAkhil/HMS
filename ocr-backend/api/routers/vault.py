from fastapi import APIRouter, Depends, HTTPException, Response
from typing import Literal
import urllib.parse

from core.schemas import VaultDocDetail, VaultDocSummary
from core.security import get_current_user, CurrentUser
from database.db_utils import get_document_markdown, get_user_vault, get_document_for_export
from modules.precision_ocr import generate_pro_pdf, generate_docx

router = APIRouter(prefix="/api/v1/vault", tags=["vault"])


@router.get("", response_model=list[VaultDocSummary])
async def list_vault(current_user: CurrentUser = Depends(get_current_user)):
    rows = get_user_vault(current_user.user_id)
    return [
        VaultDocSummary(
            id=row[0],
            filename=row[1],
            doc_category=row[2],
            confidence_score=row[3],
            extraction_date=str(row[4]) if row[4] else None,
        )
        for row in rows
    ]


@router.get("/{doc_id}", response_model=VaultDocDetail)
async def get_vault_doc(doc_id: int, current_user: CurrentUser = Depends(get_current_user)):
    markdown = get_document_markdown(doc_id, current_user.user_id)
    if markdown is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return VaultDocDetail(id=doc_id, markdown=markdown)


@router.get("/{doc_id}/export/{fmt}")
async def export_vault_doc(doc_id: int, fmt: Literal["pdf", "docx"], current_user: CurrentUser = Depends(get_current_user)):
    doc_info = get_document_for_export(doc_id, current_user.user_id)
    if not doc_info:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    markdown_text = doc_info["markdown"]
    client_name = doc_info["client"]
    filename = urllib.parse.quote(doc_info["filename"])
    
    if fmt == "pdf":
        pdf_bytes = generate_pro_pdf(markdown_text, client_name)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
        )
    elif fmt == "docx":
        docx_bytes = generate_docx(markdown_text, client_name)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid export format")

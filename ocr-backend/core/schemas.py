from pydantic import BaseModel
from typing import Any, Dict, List, Optional

class RegionPrediction(BaseModel):
    """Data contract for an extracted region from the document."""
    region_id: str
    region_type: str        # e.g., "paragraph", "table", "header"
    bbox: List[int]         # [x1, y1, x2, y2]
    page_number: int
    text_content: Optional[str] = None
    confidence_score: float = 0.0
    reading_order: int = 0
    
    # Resolver Audit Fields
    entity_classification: Optional[str] = None
    resolved_name: Optional[str] = None
    dataset_source: Optional[str] = None
    resolution_confidence: float = 0.0

    # Grounding fields (Phase 5) — every extracted field must be traceable to
    # which OCR model actually read it and how confident that read was,
    # separate from the medical/entity resolution confidence above.
    ocr_confidence: float = 0.0
    ocr_model_used: str = "unknown"

class DocumentUploadResponse(BaseModel):
    """Response returned when a file is uploaded."""
    document_hash: str
    job_id: str
    message: str

class JobStatusResponse(BaseModel):
    """Response returned when polling a job's status."""
    job_id: str
    document_hash: str
    status: str
    progress: float
    message: str
    
class ExtractionResult(BaseModel):
    """Final output schema returned after a job completes."""
    job_id: str
    document_hash: str
    regions: List[RegionPrediction]


# ─── Auth ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str


class MessageResponse(BaseModel):
    message: str


# ─── Drug CDSS ────────────────────────────────────────────────────────────

class CDSSDrugRequest(BaseModel):
    name: str
    route: Optional[str] = None
    indication: Optional[str] = None
    duration: Optional[str] = None


class CDSSEvaluateRequest(BaseModel):
    patient: Dict[str, Any]
    labs: Dict[str, Any]
    drugs: List[CDSSDrugRequest]


class CDSSAlert(BaseModel):
    drug: str
    severity: str
    message: str
    recommendation: Optional[str] = None


class CDSSEvaluateResponse(BaseModel):
    alerts: List[Dict[str, Any]]


# ─── Vault ────────────────────────────────────────────────────────────────

class VaultDocSummary(BaseModel):
    id: int
    filename: str
    doc_category: Optional[str] = None
    confidence_score: Optional[float] = None
    extraction_date: Optional[str] = None


class VaultDocDetail(BaseModel):
    id: int
    markdown: str


# ─── Dashboard ────────────────────────────────────────────────────────────

class ActiveJobSummary(BaseModel):
    job_id: str
    job_type: str
    status: str
    progress: float
    filename: Optional[str] = None


class DashboardSummary(BaseModel):
    vault_document_count: int
    active_jobs: List[ActiveJobSummary]
    recent_documents: List[VaultDocSummary]


# ─── AI Assistant (RAG chat) ───────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    target_language: str = "English"
    # Scopes retrieval to specific ingested documents instead of everything
    # the user has loaded — None/empty means search the whole knowledge base.
    doc_ids: Optional[List[int]] = None


class Citation(BaseModel):
    doc_id: int
    filename: str
    page_label: str
    snippet: str


class ChatResponse(BaseModel):
    role: str = "assistant"
    content: str
    citations: List[Citation] = []


class IngestTextRequest(BaseModel):
    documents: List[str]


class IngestVaultDocRequest(BaseModel):
    doc_ids: List[int]


class KBDocumentOut(BaseModel):
    doc_id: int
    filename: str
    category: str
    chunk_count: int

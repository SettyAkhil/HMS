from celery import shared_task
from utils.database import store_document_embedding
import logging

logger = logging.getLogger(__name__)


@shared_task
def process_document_embedding_task(
    source_table: str,
    source_id: int,
    content_text: str,
    hospital_id: int,
    patient_id: int = None,
):
    """
    Generate and store vector embeddings for clinical documents asynchronously.
    """
    try:
        store_document_embedding(
            source_table,
            source_id,
            content_text,
            hospital_id=hospital_id,
            patient_id=patient_id,
        )
        logger.info(
            f"Successfully generated embedding for {source_table} ID {source_id}"
        )
    except Exception as e:
        logger.error(
            f"Failed to generate embedding for {source_table} ID {source_id}: {str(e)}"
        )

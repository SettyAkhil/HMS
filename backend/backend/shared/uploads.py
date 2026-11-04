from werkzeug.utils import secure_filename

from core.storage import ObjectStorage

STORAGE = ObjectStorage()


def save_uploaded_file(uploaded_file, file_bytes, doc_type):
    original_name = secure_filename(uploaded_file.filename or "") or "document"
    return STORAGE.store(doc_type, original_name, file_bytes, uploaded_file.mimetype)

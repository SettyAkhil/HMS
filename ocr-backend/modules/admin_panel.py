# modules/admin_panel.py
import sqlite3
import os
import pandas as pd
from datetime import datetime, timedelta

# --- DATABASE CONNECTION ---
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "ai_portal.db")

def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

# --- ANALYTICS DATA FETCHING ---
def fetch_system_metrics():
    """Fetches high-level metrics for the dashboard."""
    conn = get_connection()
    cursor = conn.cursor()
    
    metrics = {}
    cursor.execute("SELECT COUNT(id) FROM users")
    metrics['total_users'] = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT COUNT(id) FROM universal_docs")
    metrics['total_ocr_docs'] = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT COUNT(id) FROM chat_history WHERE app_type = 'LightRAG' AND role = 'user'")
    metrics['total_rag_queries'] = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT AVG(confidence_score) FROM universal_docs")
    avg_conf = cursor.fetchone()[0]
    metrics['avg_confidence'] = round(avg_conf, 1) if avg_conf else 0.0

    conn.close()
    return metrics

def fetch_recent_audit_log(limit=50):
    conn = get_connection()
    query = """
        SELECT u.username, d.filename, d.doc_category, d.confidence_score, d.extraction_date 
        FROM universal_docs d
        JOIN users u ON d.user_id = u.id
        ORDER BY d.extraction_date DESC
        LIMIT ?
    """
    df = pd.read_sql_query(query, conn, params=(limit,))
    conn.close()
    return df

def fetch_user_table():
    conn = get_connection()
    query = "SELECT id, username, created_at FROM users ORDER BY created_at DESC"
    df = pd.read_sql_query(query, conn)
    conn.close()
    return df

# --- API COST SAVINGS ENGINE (LOCAL OVERRIDE) ---
def calculate_estimated_savings(metrics):
    """
    Calculates estimated INR saved by running Gemma 4 locally instead of using Cloud APIs.
    OCR: ~₹0.99 per page (Cloud Multimodal API baseline)
    RAG: ~₹0.05 per query.
    """
    ocr_savings = metrics['total_ocr_docs'] * 2 * 0.99 
    rag_savings = metrics['total_rag_queries'] * 0.05
    total_savings = ocr_savings + rag_savings
    
    return {
        "ocr_saved_inr": round(ocr_savings, 2),
        "rag_saved_inr": round(rag_savings, 2),
        "total_saved_inr": round(total_savings, 2)
    }

def generate_mock_timeseries_data(total_docs):
    dates = [(datetime.today() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    if total_docs == 0:
        counts = [0] * 7
    else:
        import random
        counts = [random.randint(0, max(1, total_docs // 3)) for _ in range(6)]
        counts.append(abs(total_docs - sum(counts)))
    return pd.DataFrame({"Date": dates, "Documents Processed": counts}).set_index("Date")
"""
Rate limiting (Phase 6) — shared Limiter instance. Lives in its own module
(not api/main.py) so routers can import it without a circular import
(main.py imports the routers, which would need to import back from main.py
otherwise).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

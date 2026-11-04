"""
Bootstrap script (Phase 6 RBAC) — promotes a user to the "admin" role so they
can use the admin-only endpoints (api/routers/admin.py: audit log, user list/
role management). Every user defaults to "user" on registration; this is the
only way to create the first admin (chicken-and-egg — the admin endpoints
themselves require an existing admin to call them).

Usage:
    python scripts/promote_admin.py <username>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_utils import list_users, set_user_role

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/promote_admin.py <username>")
        sys.exit(1)

    username = sys.argv[1]
    match = next((u for u in list_users() if u["username"] == username), None)
    if not match:
        print(f"No user named '{username}' found.")
        sys.exit(1)

    set_user_role(match["id"], "admin")
    print(f"User '{username}' (id={match['id']}) promoted to admin.")

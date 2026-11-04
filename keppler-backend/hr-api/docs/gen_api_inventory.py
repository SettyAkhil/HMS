"""Writes docs/API.md from the live FastAPI route table:
    docker run --rm -v "$PWD/hr-api:/app" -w /app -e HR_DATABASE_URL=postgresql+psycopg://x:y@localhost/z \
      keppler-backend-hr-api python -m docs.gen_api_inventory > hr-api/docs/API.md"""
from collections import defaultdict

from fastapi.routing import APIRoute

from app.main import app


def permissions(route: APIRoute) -> str:
    perms: set[str] = set()
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        stack.extend(dep.dependencies)
        name = getattr(dep.call, "__name__", "")
        if name == "require_hr_read":
            perms.add("hr.read or employees.read")
        if name == "dep" and dep.call.__closure__:
            for cell in dep.call.__closure__:
                if isinstance(cell.cell_contents, tuple):
                    perms.update(cell.cell_contents)
    if not perms and any(getattr(d.call, "__name__", "") == "current_principal" for d in route.dependant.dependencies):
        perms.add("any signed-in user (handler scopes to self/ownership)")
    return ", ".join(sorted(perms)) or "public"


groups = defaultdict(list)
for r in app.routes:
    if isinstance(r, APIRoute):
        for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
            groups[(r.tags or ["other"])[0]].append((r.path, m, permissions(r), (r.endpoint.__doc__ or "").strip().split("\n")[0]))

print("# hr-api endpoint inventory\n")
print("Generated from the live route table by `docs/gen_api_inventory.py`. *Requires* is what the route demands "
      "beyond a valid HMS session; handlers narrow further where noted (self-only, case visibility, record ownership). "
      "Full request/response schemas: OpenAPI at `/api/v1/hr-openapi.json` on hr-api (not exposed through the gateway).\n")
total = 0
for tag in sorted(groups):
    rows = sorted(groups[tag])
    total += len(rows)
    print(f"## {tag}\n\n| Method | Path | Requires | Notes |\n|---|---|---|---|")
    for path, m, p, doc in rows:
        print(f"| {m} | `{path}` | {p} | {doc.replace('|', '/')} |")
    print()
print(f"_{total} operations._")

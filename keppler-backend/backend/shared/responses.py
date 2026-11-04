import json

from flask import jsonify


def row_to_dict(row):
    if row is None:
        return None
    data = dict(row)
    module_access = data.get("module_access")
    if isinstance(module_access, str):
        try:
            parsed = json.loads(module_access)
            if isinstance(parsed, list):
                data["module_access"] = parsed
        except json.JSONDecodeError:
            data["module_access"] = []
    return data


def rows_to_dicts(rows):
    return [row_to_dict(row) for row in rows]


def validate_required_fields(payload, fields):
    missing = [field for field in fields if payload.get(field) in (None, "")]
    if missing:
        return jsonify({"error": "Missing required fields", "missing": missing}), 400
    return None

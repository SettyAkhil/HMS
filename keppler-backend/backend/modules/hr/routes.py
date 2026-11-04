from flask import Blueprint, request, jsonify, g
from werkzeug.exceptions import BadRequest
from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import (
    row_to_dict,
    rows_to_dicts,
    validate_required_fields,
)
from shared.hospital import (
    current_hospital_id,
    normalize_department_name,
)
from core.auth import (
    signup_employee,
    resolve_user_permissions,
    authorize_employee_access_change,
)
from utils.database import (
    get_all_employees,
    get_employee,
    update_employee,
    list_attendance,
    get_employee_stats,
    search_employees,
    delete_employee,
    activate_employee,
    deactivate_employee,
    list_departments,
    create_department,
    update_department,
    delete_department,
    create_attendance,
    update_attendance_record,
    delete_attendance_record,
    list_payroll,
    create_payroll_record,
    update_payroll_record,
    delete_payroll_record,
    list_leave_requests,
    create_leave_request,
    delete_leave_request,
    update_leave_status,
)

hr_bp = Blueprint("hr", __name__)


@hr_bp.get("/api/employees")
@require_permissions("employees.read")
def employees_list():
    employees = get_all_employees(hospital_id=current_hospital_id())
    return jsonify({"employees": rows_to_dicts(employees)})


# Creating brand-new accounts stays strictly admin-only -- unlike editing an
# existing employee's access (see employees_detail's PUT branch below, which
# is clamped via authorize_employee_access_change), account creation has no
# pre-existing row to clamp against, so it's the highest-risk operation to
# hand to a non-admin "employees" module grant. Not part of this redesign's
# scope.
@hr_bp.post("/api/employees")
@require_permissions("admin.use")
def employees_create():
    payload = request.get_json(force=True)
    result = signup_employee(
        payload, allow_admin_creation=True, hospital_id=current_hospital_id()
    )
    status = 201 if result.get("success") else 400
    return jsonify(result), status


@hr_bp.get("/api/employees/stats")
@require_permissions("employees.read")
def employees_stats():
    return jsonify(get_employee_stats(hospital_id=current_hospital_id()))


@hr_bp.get("/api/employees/search")
@require_permissions("employees.read")
def employees_search():
    query = request.args.get("q")
    if not query:
        return jsonify({"employees": []})
    employees = search_employees(query, hospital_id=current_hospital_id())
    return jsonify({"employees": rows_to_dicts(employees)})


_ACCESS_FIELDS = ("user_type", "access_role", "module_access")


@hr_bp.route("/api/employees/<employee_id>", methods=["GET", "PUT", "DELETE"])
@require_permissions("employees.read")
def employees_detail(employee_id):
    hospital_id = current_hospital_id()
    if request.method == "GET":
        employee = get_employee(employee_id=employee_id, hospital_id=hospital_id)
        if not employee:
            return jsonify({"error": "Employee not found"}), 404
        return jsonify({"employee": row_to_dict(employee)})

    if request.method == "PUT":
        user_permissions = resolve_user_permissions(g.current_user)
        payload = request.get_json(force=True)
        wants_access_change = any(field in payload for field in _ACCESS_FIELDS)

        if wants_access_change:
            # Changing user_type/access_role/module_access is a distinct,
            # higher-privilege action from editing name/email/phone/etc --
            # requires its own permission, separately grantable from basic
            # profile editing.
            if "employees.access.write" not in user_permissions:
                return (
                    jsonify(
                        {
                            "error": "Forbidden",
                            "required_permissions": ["employees.access.write"],
                        }
                    ),
                    403,
                )
            ok, error = authorize_employee_access_change(
                payload.get("user_type"), payload.get("module_access"), g.current_user
            )
            if not ok:
                return jsonify({"error": error}), 403
        elif "employees.profile.write" not in user_permissions:
            return (
                jsonify(
                    {
                        "error": "Forbidden",
                        "required_permissions": ["employees.profile.write"],
                    }
                ),
                403,
            )

        updated = update_employee(employee_id, payload, hospital_id=hospital_id)
        if not updated:
            return jsonify({"error": "Employee not found"}), 404
        return jsonify({"status": "ok"})

    # DELETE -- destructive/irreversible, stays admin-only like creation.
    user_permissions = resolve_user_permissions(g.current_user)
    if "admin.use" not in user_permissions:
        return (
            jsonify({"error": "Forbidden", "required_permissions": ["admin.use"]}),
            403,
        )
    # Scoped to the caller's hospital like GET/PUT above. Without it the helper
    # fell back to the default hospital: another tenant's admin could delete its
    # staff, and a non-default tenant could not delete its own.
    deleted = delete_employee(employee_id, hospital_id=hospital_id)
    if not deleted:
        return jsonify({"error": "Employee not found"}), 404
    return jsonify({"status": "ok"})


@hr_bp.post("/api/employees/<employee_id>/activate")
@require_permissions("employees.profile.write")
def employees_activate(employee_id):
    activated = activate_employee(employee_id, hospital_id=current_hospital_id())
    if not activated:
        return jsonify({"error": "Employee not found"}), 404
    return jsonify({"status": "active"})


@hr_bp.post("/api/employees/<employee_id>/deactivate")
@require_permissions("employees.profile.write")
def employees_deactivate(employee_id):
    deactivated = deactivate_employee(employee_id, hospital_id=current_hospital_id())
    if not deactivated:
        return jsonify({"error": "Employee not found"}), 404
    return jsonify({"status": "inactive"})


@hr_bp.get("/api/hr/departments")
@require_permissions("hr.read")
def hr_departments_list():
    return jsonify(
        {
            "departments": rows_to_dicts(
                list_departments(hospital_id=current_hospital_id())
            )
        }
    )


@hr_bp.post("/api/hr/departments")
@require_permissions("hr.departments.write")
def hr_departments_create():
    payload = request.get_json(force=True)
    try:
        department_name = normalize_department_name(payload.get("department_name"))
    except BadRequest as error:
        return jsonify({"error": str(error)}), 400

    existing = next(
        (
            row
            for row in rows_to_dicts(
                list_departments(hospital_id=current_hospital_id())
            )
            if (row.get("department_name") or "").strip().lower()
            == department_name.lower()
        ),
        None,
    )
    if existing:
        return jsonify(
            {
                "department_id": existing.get("id"),
                "department_name": existing.get("department_name"),
                "already_exists": True,
            }
        )

    department_id = create_department(
        {
            "department_name": department_name,
            "mapped_head_employee_id": payload.get("mapped_head_employee_id"),
        },
        hospital_id=current_hospital_id(),
    )
    log_audit_event(
        "create",
        "departments",
        str(department_id),
        {"department_name": department_name},
    )
    return jsonify({"department_id": department_id})


@hr_bp.put("/api/hr/departments/<int:department_id>")
@require_permissions("hr.departments.write")
def hr_departments_update(department_id):
    payload = request.get_json(force=True)
    if "department_name" in payload:
        try:
            payload["department_name"] = normalize_department_name(
                payload.get("department_name")
            )
        except BadRequest as error:
            return jsonify({"error": str(error)}), 400

        duplicate = next(
            (
                row
                for row in rows_to_dicts(
                    list_departments(hospital_id=current_hospital_id())
                )
                if row.get("id") != department_id
                and (row.get("department_name") or "").strip().lower()
                == payload["department_name"].lower()
            ),
            None,
        )
        if duplicate:
            return jsonify({"error": "Department already exists"}), 409

    updated = update_department(
        department_id, payload, hospital_id=current_hospital_id()
    )
    if not updated:
        return jsonify({"error": "Department not found"}), 404
    log_audit_event(
        "update", "departments", str(department_id), {"department_id": department_id}
    )
    return jsonify({"status": "ok"})


@hr_bp.delete("/api/hr/departments/<int:department_id>")
@require_permissions("hr.departments.write")
def hr_departments_delete(department_id):
    deleted = delete_department(
        department_id,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if not deleted:
        return jsonify({"error": "Department not found"}), 404
    log_audit_event(
        "delete", "departments", str(department_id), {"department_id": department_id}
    )
    return jsonify({"status": "ok"})


@hr_bp.get("/api/hr/attendance")
@require_permissions("hr.read")
def hr_attendance_list():
    employee_id = request.args.get("employee_id")
    return jsonify(
        {"attendance": rows_to_dicts(list_attendance(employee_id=employee_id))}
    )


@hr_bp.post("/api/hr/attendance")
@require_permissions("hr.attendance.write")
def hr_attendance_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["employee_id", "attendance_date", "status"]
    )
    if validation_error:
        return validation_error
    attendance_id = create_attendance(payload)
    log_audit_event(
        "create",
        "attendance",
        str(attendance_id),
        {"employee_id": payload.get("employee_id")},
    )
    return jsonify({"attendance_id": attendance_id})


@hr_bp.put("/api/hr/attendance/<int:attendance_id>")
@require_permissions("hr.attendance.write")
def hr_attendance_update(attendance_id):
    payload = request.get_json(force=True)
    updated = update_attendance_record(attendance_id, payload)
    if not updated:
        return jsonify({"error": "Attendance record not found"}), 404
    log_audit_event(
        "update", "attendance", str(attendance_id), {"attendance_id": attendance_id}
    )
    return jsonify({"status": "ok"})


@hr_bp.delete("/api/hr/attendance/<int:attendance_id>")
@require_permissions("hr.attendance.write")
def hr_attendance_delete(attendance_id):
    deleted = delete_attendance_record(
        attendance_id, actor=g.current_user.get("username")
    )
    if not deleted:
        return jsonify({"error": "Attendance record not found"}), 404
    log_audit_event(
        "delete", "attendance", str(attendance_id), {"attendance_id": attendance_id}
    )
    return jsonify({"status": "ok"})


@hr_bp.get("/api/hr/payroll")
@require_permissions("hr.read")
def hr_payroll_list():
    employee_id = request.args.get("employee_id")
    return jsonify({"payroll": rows_to_dicts(list_payroll(employee_id=employee_id))})


@hr_bp.post("/api/hr/payroll")
@require_permissions("hr.payroll.write")
def hr_payroll_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["employee_id", "payroll_month", "basic_salary"]
    )
    if validation_error:
        return validation_error
    payroll_id = create_payroll_record(payload)
    log_audit_event(
        "create",
        "payroll",
        str(payroll_id),
        {"employee_id": payload.get("employee_id")},
    )
    return jsonify({"payroll_id": payroll_id})


@hr_bp.put("/api/hr/payroll/<int:payroll_id>")
@require_permissions("hr.payroll.write")
def hr_payroll_update(payroll_id):
    payload = request.get_json(force=True)
    updated = update_payroll_record(payroll_id, payload)
    if not updated:
        return jsonify({"error": "Payroll record not found"}), 404
    log_audit_event("update", "payroll", str(payroll_id), {"payroll_id": payroll_id})
    return jsonify({"status": "ok"})


@hr_bp.delete("/api/hr/payroll/<int:payroll_id>")
@require_permissions("hr.payroll.write")
def hr_payroll_delete(payroll_id):
    deleted = delete_payroll_record(payroll_id, actor=g.current_user.get("username"))
    if not deleted:
        return jsonify({"error": "Payroll record not found"}), 404
    log_audit_event("delete", "payroll", str(payroll_id), {"payroll_id": payroll_id})
    return jsonify({"status": "ok"})


@hr_bp.get("/api/hr/leaves")
@require_permissions("hr.read")
def hr_leaves_list():
    employee_id = request.args.get("employee_id")
    return jsonify(
        {"leaves": rows_to_dicts(list_leave_requests(employee_id=employee_id))}
    )


@hr_bp.post("/api/hr/leaves")
@require_permissions("hr.leaves.write")
def hr_leaves_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["employee_id", "leave_type", "start_date", "end_date"]
    )
    if validation_error:
        return validation_error
    leave_id = create_leave_request(payload)
    log_audit_event(
        "create",
        "leave_requests",
        str(leave_id),
        {"employee_id": payload.get("employee_id")},
    )
    return jsonify({"leave_id": leave_id})


@hr_bp.post("/api/hr/leaves/<int:leave_id>/status")
@require_permissions("hr.leaves.write")
def hr_leave_status_update(leave_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["status"])
    if validation_error:
        return validation_error
    updated = update_leave_status(
        leave_id, payload.get("status", "pending"), g.current_user.get("username")
    )
    if not updated:
        return jsonify({"error": "Leave request not found"}), 404
    log_audit_event(
        "update", "leave_requests", str(leave_id), {"status": payload.get("status")}
    )
    return jsonify({"status": "ok"})


@hr_bp.delete("/api/hr/leaves/<int:leave_id>")
@require_permissions("hr.leaves.write")
def hr_leaves_delete(leave_id):
    deleted = delete_leave_request(leave_id, actor=g.current_user.get("username"))
    if not deleted:
        return jsonify({"error": "Leave request not found"}), 404
    log_audit_event("delete", "leave_requests", str(leave_id), {"leave_id": leave_id})
    return jsonify({"status": "ok"})





from flask import Blueprint, request, jsonify, g
from shared.session_auth import (
    require_permissions,
    require_session,
    resolve_user_permissions,
)
from shared.audit import log_audit_event
from shared.responses import (
    rows_to_dicts,
    validate_required_fields,
)
from shared.hospital import current_hospital_id
from utils.database import (
    list_pharmacy_sales,
    list_inventory_items,
    upsert_inventory_item,
    delete_inventory_item,
    create_pharmacy_sale,
    list_pharmacy_suppliers,
    create_pharmacy_supplier,
    update_pharmacy_supplier,
    delete_pharmacy_supplier,
    list_pharmacy_purchases,
    create_pharmacy_purchase,
    update_pharmacy_purchase,
    delete_pharmacy_purchase,
    get_pharmacy_summary,
)

pharmacy_bp = Blueprint("pharmacy", __name__)


@pharmacy_bp.get("/api/pharmacy/inventory")
@require_permissions("pharmacy.read")
def pharmacy_inventory_list():
    return jsonify(
        {"items": rows_to_dicts(list_inventory_items(hospital_id=current_hospital_id()))}
    )


@pharmacy_bp.post("/api/pharmacy/inventory")
@require_permissions("pharmacy.inventory.write")
def pharmacy_inventory_upsert():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["medicine_name"])
    if validation_error:
        return validation_error
    item_id = upsert_inventory_item(payload, hospital_id=current_hospital_id())
    log_audit_event(
        "upsert",
        "pharmacy_inventory",
        str(item_id),
        {"medicine_name": payload.get("medicine_name")},
    )
    return jsonify({"item_id": item_id})


@pharmacy_bp.delete("/api/pharmacy/inventory/<int:item_id>")
@require_permissions("pharmacy.inventory.write")
def pharmacy_inventory_delete(item_id):
    deleted = delete_inventory_item(
        item_id, hospital_id=current_hospital_id(), actor=g.current_user.get("username")
    )
    if not deleted:
        return jsonify({"error": "Inventory item not found"}), 404
    log_audit_event("delete", "pharmacy_inventory", str(item_id), {"item_id": item_id})
    return jsonify({"status": "ok"})


@pharmacy_bp.post("/api/pharmacy/sales")
@require_permissions("pharmacy.sales.write")
def pharmacy_sale_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["medicine_name", "quantity", "unit_price"]
    )
    if validation_error:
        return validation_error
    sale_id = create_pharmacy_sale(payload, hospital_id=current_hospital_id())
    log_audit_event(
        "create",
        "pharmacy_sales",
        str(sale_id),
        {"medicine_name": payload.get("medicine_name")},
    )
    return jsonify({"sale_id": sale_id})


@pharmacy_bp.get("/api/pharmacy/sales")
@require_permissions("pharmacy.read")
def pharmacy_sales_list():
    medicine_name = request.args.get("medicine_name")
    invoice_id = request.args.get("invoice_id")
    patient_id = request.args.get("patient_id")
    return jsonify(
        {
            "sales": rows_to_dicts(
                list_pharmacy_sales(
                    medicine_name=medicine_name,
                    invoice_id=invoice_id,
                    patient_id=patient_id,
                    hospital_id=current_hospital_id(),
                )
            )
        }
    )


@pharmacy_bp.get("/api/pharmacy/suppliers")
@require_permissions("pharmacy.read")
def pharmacy_suppliers_list():
    return jsonify(
        {"suppliers": rows_to_dicts(list_pharmacy_suppliers(hospital_id=current_hospital_id()))}
    )


@pharmacy_bp.post("/api/pharmacy/suppliers")
@require_permissions("pharmacy.suppliers.write")
def pharmacy_suppliers_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["supplier_name"])
    if validation_error:
        return validation_error
    supplier_id = create_pharmacy_supplier(payload, hospital_id=current_hospital_id())
    log_audit_event(
        "create",
        "pharmacy_suppliers",
        str(supplier_id),
        {"supplier_name": payload.get("supplier_name")},
    )
    return jsonify({"supplier_id": supplier_id})


@pharmacy_bp.put("/api/pharmacy/suppliers/<int:supplier_id>")
@require_permissions("pharmacy.suppliers.write")
def pharmacy_suppliers_update(supplier_id):
    payload = request.get_json(force=True)
    updated = update_pharmacy_supplier(
        supplier_id, payload, hospital_id=current_hospital_id()
    )
    if not updated:
        return jsonify({"error": "Supplier not found"}), 404
    log_audit_event(
        "update", "pharmacy_suppliers", str(supplier_id), {"supplier_id": supplier_id}
    )
    return jsonify({"status": "ok"})


@pharmacy_bp.delete("/api/pharmacy/suppliers/<int:supplier_id>")
@require_permissions("pharmacy.suppliers.write")
def pharmacy_suppliers_delete(supplier_id):
    deleted = delete_pharmacy_supplier(
        supplier_id, hospital_id=current_hospital_id(), actor=g.current_user.get("username")
    )
    if not deleted:
        return jsonify({"error": "Supplier not found"}), 404
    log_audit_event(
        "delete", "pharmacy_suppliers", str(supplier_id), {"supplier_id": supplier_id}
    )
    return jsonify({"status": "ok"})


@pharmacy_bp.get("/api/pharmacy/purchases")
@require_permissions("pharmacy.read")
def pharmacy_purchases_list():
    status = request.args.get("status")
    return jsonify(
        {
            "purchases": rows_to_dicts(
                list_pharmacy_purchases(status=status, hospital_id=current_hospital_id())
            )
        }
    )


@pharmacy_bp.post("/api/pharmacy/purchases")
@require_permissions("pharmacy.purchases.write")
def pharmacy_purchases_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["medicine_name", "quantity", "unit_cost"]
    )
    if validation_error:
        return validation_error
    purchase_id = create_pharmacy_purchase(payload, hospital_id=current_hospital_id())
    log_audit_event(
        "create",
        "pharmacy_purchases",
        str(purchase_id),
        {"medicine_name": payload.get("medicine_name")},
    )
    return jsonify({"purchase_id": purchase_id})


@pharmacy_bp.put("/api/pharmacy/purchases/<int:purchase_id>")
@require_permissions("pharmacy.purchases.write")
def pharmacy_purchases_update(purchase_id):
    payload = request.get_json(force=True)
    updated = update_pharmacy_purchase(
        purchase_id, payload, hospital_id=current_hospital_id()
    )
    if not updated:
        return jsonify({"error": "Purchase not found"}), 404
    log_audit_event(
        "update", "pharmacy_purchases", str(purchase_id), {"purchase_id": purchase_id}
    )
    return jsonify({"status": "ok"})


@pharmacy_bp.delete("/api/pharmacy/purchases/<int:purchase_id>")
@require_permissions("pharmacy.purchases.write")
def pharmacy_purchases_delete(purchase_id):
    deleted = delete_pharmacy_purchase(
        purchase_id, hospital_id=current_hospital_id(), actor=g.current_user.get("username")
    )
    if not deleted:
        return jsonify({"error": "Purchase not found"}), 404
    log_audit_event(
        "delete", "pharmacy_purchases", str(purchase_id), {"purchase_id": purchase_id}
    )
    return jsonify({"status": "ok"})


@pharmacy_bp.get("/api/pharmacy/summary")
@require_permissions("pharmacy.read")
def pharmacy_summary():
    return jsonify(get_pharmacy_summary(hospital_id=current_hospital_id()))


# ---- Prescriptions via OCR ----


@pharmacy_bp.post("/api/pharmacy/prescriptions")
@require_session
def create_prescription():
    perms = resolve_user_permissions(g.current_user)
    if (
        "pharmacy.prescriptions.write" not in perms
        and "patients.documents.write" not in perms
    ):
        return jsonify({"error": "Forbidden"}), 403

    payload = request.get_json(force=True)
    patient_id = payload.get("patient_id")
    medicines_json = payload.get("medicines_json")
    doc_id = payload.get("doc_id")

    if not patient_id or not medicines_json:
        return jsonify({"error": "patient_id and medicines_json are required"}), 400
    if not isinstance(medicines_json, str):
        medicines_json = __import__("json").dumps(medicines_json)
    from utils.database import get_patient

    if not get_patient(patient_id, hospital_id=current_hospital_id()):
        return jsonify({"error": "Patient not found"}), 404

    username = g.current_user.get("username")
    pid = __import__("utils.database").database.create_pharmacy_prescription(
        hospital_id=current_hospital_id(),
        patient_id=patient_id,
        doctor_username=username,
        medicines_json=medicines_json,
        doc_id=doc_id,
    )
    return jsonify({"prescription_id": pid})


@pharmacy_bp.get("/api/pharmacy/prescriptions")
@require_permissions("pharmacy.read")
def list_prescriptions():
    from utils.database import list_pending_pharmacy_prescriptions

    rows = list_pending_pharmacy_prescriptions(hospital_id=current_hospital_id())
    return jsonify({"prescriptions": rows_to_dicts(rows)})


@pharmacy_bp.post("/api/pharmacy/prescriptions/<int:prescription_id>/fulfill")
@require_permissions("pharmacy.prescriptions.write")
def fulfill_prescription(prescription_id):
    from utils.database import (
        get_pharmacy_prescription,
        fulfill_pharmacy_prescription,
        create_pharmacy_sale,
    )
    import json

    hospital_id = current_hospital_id()
    presc = get_pharmacy_prescription(hospital_id, prescription_id)
    if not presc:
        return jsonify({"error": "Prescription not found"}), 404

    if presc["status"] == "fulfilled":
        return jsonify({"error": "Already fulfilled"}), 400

    # Process sales
    medicines = []
    try:
        medicines = json.loads(presc["medicines_json"])
    except:
        pass

    # the frontend passes modified medicines array with correct prices
    payload = request.get_json(force=True)
    final_medicines = payload.get("medicines", medicines)

    # Validate every line before recording any sale, so a bad line cannot leave
    # the prescription half-dispensed.
    lines = []
    for med in final_medicines if isinstance(final_medicines, list) else []:
        try:
            qty = int(med.get("quantity", 1))
            price = float(med.get("unit_price", 0))
        except (TypeError, ValueError, AttributeError):
            return jsonify({"error": "Each medicine needs a numeric quantity and unit_price"}), 400
        if qty <= 0 or price < 0:
            return jsonify({"error": "quantity must be positive and unit_price not negative"}), 400
        lines.append((med, qty, price))

    # Refuse before any sale is written: never dispense more than the unexpired
    # stock on hand (expired batches do not count), summed per medicine.
    from utils.database import get_sellable_stock

    wanted = {}
    for med, qty, _ in lines:
        key = str(med.get("name", "Unknown")).lower()
        wanted[key] = (str(med.get("name", "Unknown")), wanted.get(key, (None, 0))[1] + qty)
    short = []
    for name, qty in wanted.values():
        available = get_sellable_stock(hospital_id, name)
        if qty > available:
            short.append({"medicine": name, "requested": qty, "available_unexpired": available})
    if short:
        return jsonify({"error": "Insufficient unexpired stock", "shortfalls": short}), 409

    for med, qty, price in lines:
        create_pharmacy_sale(
            {
                "patient_id": presc["patient_id"],
                "medicine_name": med.get("name", "Unknown"),
                "quantity": qty,
                "unit_price": price,
                "prescription_ref": f"OCR-{prescription_id}",
            },
            hospital_id=hospital_id,
        )

    fulfill_pharmacy_prescription(hospital_id, prescription_id)
    return jsonify({"status": "ok"})

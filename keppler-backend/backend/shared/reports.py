def build_reports_export_text(overview):
    lines = [
        "# HospAI Reports Overview",
        "",
        "## Financial Summary",
        f"- Total billed: INR {overview['billing_summary']['total_billed']:.2f}",
        f"- Total collected: INR {overview['billing_summary']['total_collected']:.2f}",
        f"- Total due: INR {overview['billing_summary']['total_due']:.2f}",
        f"- Net position: INR {overview['accounts_summary']['net_position']:.2f}",
        "",
        "## Operations",
        f"- Monthly OP: {overview['hospital_summary']['ip_op_counts']['monthly_op']}",
        f"- Monthly IP: {overview['hospital_summary']['ip_op_counts']['monthly_ip']}",
        f"- Average LOS: {overview['alos_summary']['average_los_days']} days",
        f"- Admissions counted: {overview['alos_summary']['admission_count']}",
        "",
        "## Clinic Income",
    ]

    for row in overview.get("clinic_income", []):
        lines.append(f"- {row['label']}: INR {float(row['count']):.2f}")

    lines.extend(["", "## Discounts by Module"])
    for row in overview.get("discount_by_module", []):
        lines.append(f"- {row['label']}: INR {float(row['count']):.2f}")

    lines.extend(["", "## Payment Status"])
    for row in overview.get("payment_status_breakdown", []):
        lines.append(f"- {row['label']}: {row['count']} invoice(s)")

    return "\n".join(lines)

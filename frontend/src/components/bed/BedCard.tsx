import { FaBed } from "react-icons/fa"
import { FiTool } from "react-icons/fi"
import { formatDateTimeIST } from "../../lib/format"
import { BillingDatabase } from "../../services/billingDb"
import { InsuranceChip } from "../insurance/integrations"

export type BedCardData = {
  id: number | string
  room_no: string
  bed_no: string
  bed_type: string
  status: "Available" | "Occupied" | "Maintenance"
  admission_date?: string | null
  patient_id?: string | null
  patient_name?: string | null
  patient_last_name?: string | null
  patient_phone?: string | null
  patient_age?: number | null
  patient_gender?: string | null
  admission_notes?: string | null
}

export function bedOccupantName(bed: BedCardData): string {
  return (
    `${bed.patient_name || ""} ${bed.patient_last_name || ""}`.trim() || "-"
  )
}

// Drives the card's fill color for an occupied bed -- "other" covers both an
// actual non-binary gender on file and a bed whose gender wasn't recorded,
// so a card is never left uncolored.
export function bedGenderVariant(
  bed: BedCardData,
): "male" | "female" | "other" {
  const g = (bed.patient_gender || "").trim().toLowerCase()
  if (g.startsWith("m")) return "male"
  if (g.startsWith("f")) return "female"
  return "other"
}

function daysSinceAdmission(iso: string): number {
  return Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1,
  )
}

// The one bed tile used by both the Inpatient Bed Board (read-only overview)
// and Bed Management (the allocate/transfer/discharge workflow) so the two
// screens read identically -- patient name/age/gender sit right on the card
// (not hidden behind a hover), and a hover tooltip adds the secondary detail
// (phone, admission timestamp) that doesn't fit on the card. No cost/rate is
// shown here by design -- this board is about occupancy, not billing.
export function BedCard<T extends BedCardData>({
  bed,
  onClick,
  onPatientClick,
  readOnly,
  // Opens the patient's real clinical chart -- kept separate from `onClick`
  // (which opens the bed-allocation modal) so the two actions don't collide;
  // the patient name renders as its own clickable link when this is set.
  // Generic (T, not the base BedCardData) so a caller with a richer bed row
  // shape (e.g. BedManagementPage's `Bed`) can pass a handler typed for that
  // full shape without TS treating it as unsafe.
  // Inpatient Bed Board renders these read-only (it's a monitoring view, not
  // a workflow) -- a plain div instead of a button so it doesn't look
  // clickable when there's nothing behind the click.
}: {
  bed: T
  onClick?: () => void
  onPatientClick?: (bed: T) => void
  readOnly?: boolean
}) {
  // Computed before render (rather than in an IIFE mid-JSX) so the card knows
  // whether it has a flag row at all -- an empty row would still claim its
  // padding and break the shared baseline across a grid row.
  const flags: { key: string ;text: string }[] = []
  if (bed.status === "Occupied" && bed.patient_id) {
    const clr = BillingDatabase.getInpatientFinancialClearance(
      bed.patient_id,
      bedOccupantName(bed),
    )
    if (clr.totalAmount !== 0 || clr.balanceDue !== 0) {
      if (!clr.isCleared && clr.balanceDue > 0) {
        flags.push({
          key: "due",
          text: `🔒 Due ₹${clr.balanceDue.toLocaleString("en-IN")}`,
        })
      } else if (clr.isCleared) {
        flags.push({ key: "cleared", text: "✅ Bill cleared" })
      }
    }
  }
  if (
    bed.status === "Occupied" &&
    bed.admission_notes &&
    (bed.admission_notes.toLowerCase().includes("er") ||
      bed.admission_notes.toLowerCase().includes("transfer"))
  ) {
    flags.push({ key: "transfer", text: "🚑 Transferred" })
  }

  const variant =
    bed.status === "Occupied"
      ? `occupied-${bedGenderVariant(bed)}`
      : bed.status === "Maintenance"
        ? "maintenance"
        : "available"
  return (
    <div
      className={`bed-info-card bed-info-card-${variant}${
        bed.bed_type === "ICU" ? " bed-info-card-icu" : ""
      }`}
    >
      <div
        role={readOnly ? undefined : "button"}
        tabIndex={readOnly ? undefined : 0}
        className={`bed-info-card-main${
          readOnly ? " bed-info-card-main-static" : ""
        }`}
        onClick={readOnly ? undefined : onClick}
        onKeyDown={
          readOnly
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") onClick?.()
              }
        }
      >
        <div className="bed-info-card-top">
          <span className="bed-info-card-label">
            <FaBed className="bed-info-card-icon" aria-hidden />
            Room {bed.room_no} &middot; Bed {bed.bed_no}
          </span>
          <span className="bed-info-card-type">{bed.bed_type}</span>
        </div>

        {bed.status === "Occupied" ? (
          <div className="bed-info-card-body">
            {onPatientClick && bed.patient_id ? (
              <span
                className="bed-info-card-name bed-info-card-name-link"
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onPatientClick(bed)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation()
                    onPatientClick(bed)
                  }
                }}
              >
                {bedOccupantName(bed)}
              </span>
            ) : (
              <span className="bed-info-card-name">{bedOccupantName(bed)}</span>
            )}
            <span className="bed-info-card-meta">
              {bed.patient_age ? `${bed.patient_age}y · ` : ""}
              {bed.patient_gender || "Gender N/A"}
              {bed.patient_id ? ` · ${bed.patient_id}` : ""}
            </span>
            {bed.admission_date && (
              <span className="bed-info-card-meta">
                Day {daysSinceAdmission(bed.admission_date)}
              </span>
            )}
            {/* Status only -- no amounts on the board (see note above). */}
            <InsuranceChip patientId={bed.patient_id || undefined} patientName={bedOccupantName(bed)} />
            {flags.length > 0 && (
              <div className="bed-info-card-flags">
                {flags.map((flag) => (
                  <span
                    key={flag.key}
                    className={`bed-info-card-flag bed-info-card-flag-${flag.key}`}
                  >
                    {flag.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : bed.status === "Maintenance" ? (
          <div className="bed-info-card-body">
            <div className="bed-info-card-status">
              <FiTool aria-hidden /> Under maintenance
            </div>
          </div>
        ) : (
          <div className="bed-info-card-body">
            <div className="bed-info-card-status flex items-center justify-between">
              <span>Available</span>
              {!readOnly && (
                <span className="text-[10px] text-emerald-700 font-semibold opacity-75">
                  Click to allocate &rarr;
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {bed.status === "Occupied" &&
        (bed.patient_phone || bed.admission_date) && (
          <div className="bed-info-card-tooltip" role="tooltip">
            <strong>{bedOccupantName(bed)}</strong>
            {bed.patient_phone && <span>{bed.patient_phone}</span>}
            {bed.admission_date && (
              <span>Admitted {formatDateTimeIST(bed.admission_date)}</span>
            )}
          </div>
        )}
    </div>
  )
}

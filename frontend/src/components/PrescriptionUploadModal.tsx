import { Modal, Button } from "./ui"
import type { Notice } from "../types"

type Props = {
  patientId: string
  patientName: string
  doctorName?: string
  onClose: () => void
  setNotice: (notice: Notice | null) => void
  mode?: "ocr" | "manual"
}

// Pharmacy (prescriptions/inventory) is out of scope for this ER + Bed
// Management build -- see the integration report. ErPage.tsx's "Order
// Medication" button still mounts this component unmodified, so this stub
// keeps that entry point from crashing instead of silently faking a
// prescription that nothing on the backend actually persists.
export default function PrescriptionUploadModal({
  patientName,
  onClose,
}: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Order Medication"
      description={patientName}
    >
      <p className="muted">
        Pharmacy/prescriptions weren't part of this ER + Bed Management build --
        see the integration report for what was in and out of scope.
      </p>
      <div className="ui-modal-actions" style={{ marginTop: "0.8rem" }}>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}

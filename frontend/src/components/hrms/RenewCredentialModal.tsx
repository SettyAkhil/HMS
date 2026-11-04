import React, { useState } from "react"
import { HrmsDatabase, StaffCredential } from "../../services/hrmsDb"
import { X, Award, CheckCircle, ShieldCheck } from "lucide-react"

interface RenewCredentialModalProps {
  credential: StaffCredential | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

function RenewCredentialModalBody({
  credential,
  isOpen,
  onClose,
  onSuccess,
}: RenewCredentialModalProps & { credential: NonNullable<RenewCredentialModalProps["credential"]> }) {

  const [newExpiry, setNewExpiry] = useState("2029-12-31")
  const [renewalDoc, setRenewalDoc] = useState("CERT-RENEW-2026.pdf")
  const [notes, setNotes] = useState("Renewal processed with State Board with verification fee paid.")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    HrmsDatabase.renewCredential(credential.id, newExpiry)
    if (onSuccess) onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Clinical Header */}
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-2xs">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Renew Clinical Credential</h2>
              <p className="text-[11px] text-blue-100">NABH & Statutory Licensure Compliance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
          <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="font-bold text-[#0F172A]">{credential.title}</div>
            <div className="text-[#64748B]">
              Staff: <span className="font-semibold text-[#0F172A]">{credential.staffName}</span>
            </div>
            <div className="text-[#64748B]">
              Issuing Board: <span className="font-semibold text-[#334155]">{credential.authority}</span>
            </div>
            <div className="text-[#64748B]">
              Current License No: <span className="font-mono font-bold text-[#1B4FD8]">{credential.licenseNo}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              New License Expiration Date <span className="text-[#DC2626] font-bold">*</span>
            </label>
            <input
              type="date"
              required
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Renewal Verification Document Name / Slip
            </label>
            <input
              type="text"
              value={renewalDoc}
              onChange={(e) => setRenewalDoc(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Auditor / Verification Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none resize-none"
            />
          </div>

          <div className="pt-3 border-t border-[#DDE2EC] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] bg-white border border-[#DDE2EC] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-[#15803D] hover:bg-[#166534] rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Confirm & Re-Certify
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// The hooks live in RenewCredentialModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function RenewCredentialModal(props: RenewCredentialModalProps) {
  if (!props.isOpen || !props.credential) return null
  return <RenewCredentialModalBody {...props} credential={props.credential} />
}

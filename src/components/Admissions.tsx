import { useEffect, useMemo, useState } from "react"
import { Icon } from "./icons"
import { BedCard, bedOccupantName, type BedCardData } from "./bed/BedCard"
import { AdmissionPaymentType } from "./insurance/integrations"
import { Modal } from "./insurance/ui"
import { BedDatabase } from "../services/bedDb"
import { apiFetch, reportError } from "../lib/api"
import { formatDateTimeIST } from "../lib/format"
import type { Notice } from "../types"

type Bed = BedCardData & {
  ward: string
  bed_type: string
  admission_date: string | null
}

type Summary = {
  total: number
  available: number
  occupied: number
  maintenance: number
}

type ErBedRequest = {
  id: number
  visit_no: string
  patient_id?: string | null
  er_visit_id?: number | null
  patient_name: string | null
  patient_last_name: string | null
  is_unknown_patient: boolean
  unknown_patient_label: string | null
  requested_level_of_care: string
  requested_specialty: string | null
  requested_at: string
}

function requestPatientLabel(req: ErBedRequest): string {
  if (req.is_unknown_patient)
    return req.unknown_patient_label || "Unidentified patient"
  const name = `${req.patient_name || ""} ${req.patient_last_name || ""}`.trim()
  return name || "Patient"
}

type Props = {
  setNotice?: (n: Notice | null) => void
  navigate?: (page: string) => void
}

export default function Admissions({ setNotice, navigate }: Props) {
  const [activeTab, setActiveTab] = useState<"requests" | "admitted">(
    "requests",
  )
  const [admitFilter, setAdmitFilter] = useState<"today" | "all">("today")
  const [beds, setBeds] = useState<Bed[]>([])
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
  })
  const [requests, setRequests] = useState<ErBedRequest[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [bedsRes, requestsRes] = await Promise.all([
        apiFetch<{ beds: Bed[] ;summary: Summary }>("/api/beds"),
        apiFetch<{ bed_requests: ErBedRequest[] }>(
          "/api/er/bed-requests?status=pending",
        ).catch(() => ({
          bed_requests: [] as ErBedRequest[],
        })),
      ])
      setBeds(bedsRes.beds || [])
      setSummary(
        bedsRes.summary || {
          total: 0,
          available: 0,
          occupied: 0,
          maintenance: 0,
        },
      )
      setRequests(requestsRes.bed_requests || [])
    } catch (error: any) {
      reportError(setNotice, error, "Failed to load admissions data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const availableGeneral = beds.filter(
    (b) => b.status === "Available" && b.bed_type !== "ICU",
  ).length
  const availableIcu = beds.filter(
    (b) => b.status === "Available" && b.bed_type === "ICU",
  ).length

  const admittedToday = useMemo(() => {
    const today = new Date().toDateString()
    return beds
      .filter(
        (b) =>
          b.status === "Occupied" &&
          b.admission_date &&
          new Date(b.admission_date).toDateString() === today,
      )
      .sort(
        (a, b) =>
          new Date(b.admission_date!).getTime() -
          new Date(a.admission_date!).getTime(),
      )
  }, [beds])

  const allOccupiedBeds = useMemo(() => {
    return beds
      .filter((b) => b.status === "Occupied")
      .sort(
        (a, b) =>
          new Date(b.admission_date || 0).getTime() -
          new Date(a.admission_date || 0).getTime(),
      )
  }, [beds])

  const displayedAdmitted = admitFilter === "today" ? admittedToday : allOccupiedBeds

  const goToBedManagement = () => navigate?.("beds")
  const [paymentFor, setPaymentFor] = useState<Bed | null>(null)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      {paymentFor && (
        <Modal wide title={`Payment type — ${bedOccupantName(paymentFor)}`} onClose={() => setPaymentFor(null)}>
          <AdmissionPaymentType
            patientId={paymentFor.patient_id || ""}
            patientName={bedOccupantName(paymentFor)}
            encounterType={paymentFor.bed_type === "ICU" ? "ICU" : "IP"}
            department={paymentFor.bed_type === "ICU" ? "ICU" : "Inpatient"}
          />
        </Modal>
      )}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 leading-tight">
            Inpatient Admissions
          </h1>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            Live admission requests and today's admissions &mdash; assign beds
            from Bed Management.
          </p>
        </div>
        <button
          onClick={goToBedManagement}
          className="h-8 px-3 bg-[#1B4FD8] text-white text-[12px] font-medium rounded hover:bg-[#1740B4] transition-colors flex items-center gap-2"
        >
          <Icon.Plus /> Direct Admission
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 flex w-full flex-col gap-5">
        {/* Key Metrics -- same px-6 gutter as the header above, so the cards
            line up under the title instead of being centred in their own
            max-w-7xl column. */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          {[
            {
              label: "Pending requests",
              value: requests.length,
              tone: "#D97706",
            },
            {
              label: "Admitted today",
              value: admittedToday.length,
              tone: "#16A34A",
            },
            {
              label: "Available beds (general)",
              value: availableGeneral,
              tone: "#0F172A",
            },
            // Available ICU beds are headroom, not an alarm -- this used to
            // render in the same red as a critical metric.
            {
              label: "Available beds (ICU)",
              value: availableIcu,
              tone: "#7C3AED",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-[#DDE2EC] px-4 py-3 rounded-none"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                {stat.label}
              </div>
              <div
                className="text-2xl font-mono font-bold leading-tight mt-1"
                style={{ color: stat.tone }}
              >
                {loading ? "—" : stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-[#DDE2EC] rounded-none flex flex-col overflow-hidden">
          <div className="border-b border-[#DDE2EC] flex px-4">
            <button
              onClick={() => setActiveTab("requests")}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === "requests"
                  ? "border-[#1B4FD8] text-[#1B4FD8]"
                  : "border-transparent text-[#64748B] hover:text-gray-900"
              }`}
            >
              Pending Admission Requests ({requests.length})
            </button>
            <button
              onClick={() => setActiveTab("admitted")}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === "admitted"
                  ? "border-[#1B4FD8] text-[#1B4FD8]"
                  : "border-transparent text-[#64748B] hover:text-gray-900"
              }`}
            >
              Admitted Patients ({allOccupiedBeds.length})
            </button>
          </div>

          <div className="overflow-auto bg-[#F8FAFC]">
            {activeTab === "requests" && (
              <div className="p-4 space-y-3">
                {loading ? (
                  <p className="text-[12.5px] text-[#64748B] p-4">Loading...</p>
                ) : requests.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-[#94A3B8]">
                    <div className="text-4xl mb-3">📋</div>
                    <div className="text-[13px] font-semibold text-gray-700 mb-1">
                      No pending requests
                    </div>
                    <div className="text-[12px]">
                      ER admission requests awaiting a bed will appear here.
                    </div>
                  </div>
                ) : (
                  requests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white border border-[#DDE2EC] rounded-md p-3.5 flex items-center justify-between gap-4 hover:border-[#1B4FD8] transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[14px] bg-[#1B4FD8]">
                          {requestPatientLabel(req).charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-[14px] font-bold text-gray-900">
                              {requestPatientLabel(req)}
                            </h3>
                            <span className="text-[11px] font-mono text-[#64748B]">
                              {req.visit_no}
                            </span>
                          </div>
                          <div className="text-[12.5px] text-gray-700 mb-1">
                            <strong>Requested:</strong>{" "}
                            {req.requested_level_of_care.toUpperCase()}
                            {req.requested_specialty
                              ? ` · ${req.requested_specialty}`
                              : ""}
                          </div>
                          <div className="text-[11.5px] text-[#64748B]">
                            Requested from ER ·{" "}
                            {formatDateTimeIST(req.requested_at)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          BedDatabase.setPendingAllocation({
                            patient_id:
                              req.patient_id ||
                              `P-ER-${req.er_visit_id || req.id}`,
                            name: req.patient_name || "Emergency Patient",
                            last_name: req.patient_last_name || undefined,
                            source: "ER",
                            visit_no: req.visit_no,
                            er_bed_request_id: req.id,
                            er_visit_id: req.er_visit_id || undefined,
                            requested_level_of_care: req.requested_level_of_care,
                            requested_specialty:
                              req.requested_specialty || undefined,
                            clinical_notes: `ER Admission Request (${req.visit_no}) for ${req.requested_level_of_care}`,
                            timestamp: req.requested_at,
                          })
                          goToBedManagement()
                        }}
                        className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-medium rounded shadow-sm transition-colors cursor-pointer"
                      >
                        Assign Bed
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "admitted" && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 bg-[#E2E8F0] p-0.5 rounded">
                    <button
                      type="button"
                      onClick={() => setAdmitFilter("today")}
                      className={`px-3 py-1 text-[11.5px] font-semibold transition-colors cursor-pointer ${
                        admitFilter === "today"
                          ? "bg-white text-gray-900 shadow-2xs"
                          : "text-[#64748B] hover:text-gray-900"
                      }`}
                    >
                      Admitted Today ({admittedToday.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdmitFilter("all")}
                      className={`px-3 py-1 text-[11.5px] font-semibold transition-colors cursor-pointer ${
                        admitFilter === "all"
                          ? "bg-white text-gray-900 shadow-2xs"
                          : "text-[#64748B] hover:text-gray-900"
                      }`}
                    >
                      All Admitted Patients ({allOccupiedBeds.length})
                    </button>
                  </div>
                </div>
                {loading ? (
                  <p className="text-[12.5px] text-[#64748B] p-4">Loading...</p>
                ) : displayedAdmitted.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-[#94A3B8]">
                    <div className="text-4xl mb-3">🛏️</div>
                    <div className="text-[13px] font-semibold text-gray-700 mb-1">
                      {admitFilter === "today" ? "No admissions today" : "No admitted patients"}
                    </div>
                    <div className="text-[12px]">
                      {admitFilter === "today"
                        ? "Patients admitted today will appear here. Switch to 'All Admitted Patients' to view prior admissions."
                        : "No occupied beds currently in the hospital."}
                    </div>
                  </div>
                ) : (
                  <div className="bed-info-card-grid">
                    {displayedAdmitted.map((bed) => (
                      <div key={bed.id} className="flex flex-col gap-1.5">
                        <BedCard bed={bed} readOnly />
                        {/* Payment type is chosen per encounter; insurance opens its case. */}
                        <button
                          type="button"
                          onClick={() => setPaymentFor(bed)}
                          className="h-8 px-2 bg-white border border-[#DDE2EC] hover:border-[#1B4FD8] text-[12px] font-semibold text-gray-800 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          💳 Payment type
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState } from "react"
import { ShieldAlert, RefreshCw, History, CheckCircle2, AlertTriangle, Eye, Download, Search } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import type { PostingException, AuditEntry } from "../../types/accounts"
import {
  Button, Card, Empty, ErrorNote, Loaded, Modal, Notice, PageHeader, Pill, Table, Td, Th,
  downloadCsv, formatDate, formatDateTime, useAction, useApi
} from "./ui"

export default function PostingAuditView() {
  const [activeTab, setActiveTab] = useState<"exceptions" | "audit">("exceptions")
  const [selectedPayload, setSelectedPayload] = useState<PostingException | null>(null)
  const [auditQuery, setAuditQuery] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  const exceptionsState = useApi(() => accountsApi.exceptions(), [])
  const auditState = useApi(() => accountsApi.audit(), [])

  const retryItem = (id: number, eventId: string) => {
    action.run(
      () => accountsApi.retryException(id),
      (res) => {
        if (res.status === "posted") {
          setNotice(`Event ${eventId} successfully posted to ledger as ${res.journal_no || "journal"}.`)
        } else {
          setNotice(`Event ${eventId} retry result: ${res.status}. ${res.reason || ""}`)
        }
        exceptionsState.reload()
      }
    )
  }

  const exportAudit = (entries: AuditEntry[]) => {
    downloadCsv(
      `financial_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`,
      ["Timestamp", "Actor", "Action", "Entity", "Entity ID", "Detail"],
      entries.map((e) => [
        e.at,
        e.actor,
        e.action,
        e.entity,
        e.entity_id || "",
        e.detail ? JSON.stringify(e.detail) : ""
      ])
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit & Integration Outbox"
        subtitle="Real-time monitor of operational accounting events, failed posting exception queues, and immutable double-entry ledger audit trails."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex border border-[#D0D5DD] rounded-[6px] overflow-hidden text-xs">
              <button
                onClick={() => setActiveTab("exceptions")}
                className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                  activeTab === "exceptions" ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
                }`}
              >
                Posting Exceptions
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                  activeTab === "audit" ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
                }`}
              >
                Audit Trail
              </button>
            </div>
            {activeTab === "audit" && auditState.data?.entries && (
              <Button size="sm" onClick={() => exportAudit(auditState.data!.entries)}>
                <Download size={13} /> Export Audit
              </Button>
            )}
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {activeTab === "exceptions" && (
        <Loaded state={exceptionsState}>
          {({ exceptions }) => {
            const list = Array.isArray(exceptions) ? exceptions : []
            return (
              <div className="space-y-4">
                {/* Outbox Status Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
                    <span className="text-xs text-[#64748B] font-medium">Pending Exceptions</span>
                    <div className="text-xl font-bold text-[#BE123C] mt-1">{list.length}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">Require review or manual correction</div>
                  </div>
                  <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
                    <span className="text-xs text-[#64748B] font-medium">Outbox Integration Status</span>
                    <div className="text-xl font-bold text-[#047857] mt-1 flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-[#10B981]" /> Active
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">Billing & Pharmacy feeds streaming</div>
                  </div>
                  <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
                    <span className="text-xs text-[#64748B] font-medium">Auto-Recovery Engine</span>
                    <div className="text-xl font-bold text-[#1B4FD8] mt-1">Idempotent</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">Safe retry without double-posting</div>
                  </div>
                </div>

                <Card
                  title={`Posting Exceptions (${list.length})`}
                  padded={false}
                  actions={
                    <Button size="sm" onClick={() => exceptionsState.reload()}>
                      <RefreshCw size={13} /> Refresh
                    </Button>
                  }
                >
                  {list.length === 0 ? (
                    <Empty>All operational events have posted cleanly into the general ledger. Zero exceptions.</Empty>
                  ) : (
                    <Table dense>
                      <thead>
                        <tr>
                          <Th>Event ID</Th>
                          <Th>Source Module</Th>
                          <Th>Type</Th>
                          <Th>Failure Reason</Th>
                          <Th right>Attempts</Th>
                          <Th>Last Seen</Th>
                          <Th right>Action</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((ex) => (
                          <tr key={ex.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-[#1B4FD8]">
                              {ex.event_id}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#F1F5F9] text-[#334155] uppercase">
                                {ex.source_module}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-xs text-[#0F172A]">
                              {ex.event_type}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#BE123C] max-w-md truncate" title={ex.reason}>
                              {ex.reason}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                              {ex.attempts}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#64748B] whitespace-nowrap">
                              {formatDateTime(ex.last_seen)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedPayload(ex)}
                                  title="View event payload details"
                                >
                                  <Eye size={13} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  busy={action.busy}
                                  onClick={() => retryItem(ex.id, ex.event_id)}
                                >
                                  Retry
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </div>
            )
          }}
        </Loaded>
      )}

      {activeTab === "audit" && (
        <Loaded state={auditState}>
          {({ entries }) => {
            const allEntries = Array.isArray(entries) ? entries : []
            const q = auditQuery.trim().toLowerCase()
            const filtered = allEntries.filter(
              (e) =>
                !q ||
                e.actor.toLowerCase().includes(q) ||
                e.action.toLowerCase().includes(q) ||
                e.entity.toLowerCase().includes(q) ||
                (e.entity_id && e.entity_id.toLowerCase().includes(q))
            )

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-80">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 text-[#94A3B8]" size={14} />
                      <input
                        type="text"
                        placeholder="Search audit trail by actor, action or entity..."
                        value={auditQuery}
                        onChange={(e) => setAuditQuery(e.target.value)}
                        className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1B4FD8] bg-white"
                      />
                    </div>
                  </div>
                  <span className="text-xs text-[#64748B]">Showing {filtered.length} entries</span>
                </div>

                <Card title="Financial Audit Log" padded={false}>
                  {filtered.length === 0 ? (
                    <Empty>No audit entries recorded matching search.</Empty>
                  ) : (
                    <Table dense>
                      <thead>
                        <tr>
                          <Th>Timestamp</Th>
                          <Th>Actor</Th>
                          <Th>Action</Th>
                          <Th>Entity</Th>
                          <Th>Entity ID</Th>
                          <Th>Audit Details</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((item) => (
                          <tr key={item.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 px-3 text-xs text-[#64748B] whitespace-nowrap">
                              {formatDateTime(item.at)}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A]">
                              {item.actor}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#EFF6FF] text-[#1B4FD8]">
                                {item.action}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs font-medium text-[#334155]">
                              {item.entity}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#475569]">
                              {item.entity_id || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#64748B] font-mono max-w-xs truncate">
                              {item.detail ? JSON.stringify(item.detail) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </div>
            )
          }}
        </Loaded>
      )}

      {/* Payload Inspection Modal */}
      {selectedPayload && (
        <Modal
          title={`Event Payload: ${selectedPayload.event_id}`}
          onClose={() => setSelectedPayload(null)}
          footer={
            <div className="flex justify-between w-full">
              <Button
                variant="primary"
                busy={action.busy}
                onClick={() => {
                  retryItem(selectedPayload.id, selectedPayload.event_id)
                  setSelectedPayload(null)
                }}
              >
                Retry Posting
              </Button>
              <Button onClick={() => setSelectedPayload(null)}>Close</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="text-xs text-[#B42318] p-2.5 bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg">
              <strong>Failure:</strong> {selectedPayload.reason}
            </div>
            <div>
              <label className="text-xs font-semibold text-[#475569] block mb-1">Payload JSON</label>
              <pre className="p-3 bg-[#0F172A] text-[#E2E8F0] rounded-lg text-xs font-mono max-h-72 overflow-y-auto">
                {JSON.stringify(selectedPayload.payload, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

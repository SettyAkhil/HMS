import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Bell,
  CheckCircle2,
  FlaskConical,
  HeartPulse,
  Hourglass,
  Pill,
  Receipt,
  Siren,
  Stethoscope,
} from "lucide-react";
import { Btn } from "../shared";
import { formatElapsed } from "../../hooks/useLiveClinic";
import { encounterArrivalIso } from "../../services/encounterTime";
import { DoctorAccount } from "../../services/doctorPortalDb";
import { LabOrderDatabase } from "../../services/labOrdersDb";
import { InsuranceEngineService } from "../../services/insuranceDb";
import {
  acknowledgeAlert,
  acknowledgeAll,
  buildDoctorLiveBoard,
  callPatientIn,
  holdPatient,
  LiveAlert,
  LONG_WAIT_MINUTES,
  withdrawLabOrder,
} from "../../services/doctorLiveFeed";

/**
 * The doctor's real-time board: the clinic as it stands this second, and the
 * handful of things only the doctor can move forward.
 *
 * Everything shown is derived from stores other desks write to, so reception
 * taking payment, the pharmacist dispensing or the lab entering a result all
 * land here within a tick -- including from another browser tab.
 */

const SEVERITY_STYLES: Record<LiveAlert["severity"], { border: string; bg: string; text: string; dot: string; label: string }> = {
  critical: { border: "#FECACA", bg: "#FEF2F2", text: "#B91C1C", dot: "#DC2626", label: "Critical" },
  warning: { border: "#FDE68A", bg: "#FFFBEB", text: "#92400E", dot: "#D97706", label: "Attention" },
  info: { border: "#E2E8F0", bg: "#F8FAFC", text: "#475569", dot: "#64748B", label: "Update" },
};

const KIND_ICONS: Record<LiveAlert["kind"], React.ComponentType<{ size?: number; className?: string }>> = {
  "new-patient": Bell,
  "vitals-ready": HeartPulse,
  "waiting-long": Hourglass,
  "in-consultation": Stethoscope,
  "lab-awaiting-payment": Receipt,
  "lab-in-progress": FlaskConical,
  "lab-result": BarChart3,
  "lab-critical": AlertTriangle,
  "rx-ready": Pill,
  "rx-dispensed": CheckCircle2,
  "rx-rejected": Ban,
  "er-assignment": Siren,
};

export default function LiveBoard({
  doctor,
  now,
  revision,
  onOpenPatient,
  onGoToSheet,
  onOpenErVisit,
}: {
  doctor: DoctorAccount;
  now: number;
  revision: number;
  onOpenPatient: (encounterId: string) => void;
  onGoToSheet: (encounterId: string) => void;
  onOpenErVisit?: (visitId: number) => void;
}) {
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Derived data follows the data revision, not the clock; waiting minutes are
  // recomputed from `now` inside the board so the numbers still tick.
  const board = useMemo(() => buildDoctorLiveBoard(doctor, now), [doctor, revision, Math.floor(now / 30000)]);

  const visibleAlerts = showAcknowledged ? board.alerts : board.alerts.filter(alert => !alert.acknowledged);
  const needsAction = board.actionable;

  const handleCallIn = (encounterId: string) => {
    if (board.active && board.active.encounter.id !== encounterId) {
      setFeedback(
        `${board.active.encounter.patientName} is still in the room. Complete or hold that consultation first.`
      );
      return;
    }
    callPatientIn(encounterId);
    setFeedback(null);
    onGoToSheet(encounterId);
  };

  const handleWithdraw = (alert: LiveAlert) => {
    const order = alert.refId ? LabOrderDatabase.getOrder(alert.refId) : undefined;
    if (!order) return;
    const withdrawn = withdrawLabOrder(order, doctor, "Withdrawn by the ordering doctor from the live board");
    setFeedback(
      withdrawn
        ? `${order.id} withdrawn — reception will no longer bill for it.`
        : `${order.id} has already been paid for; reception has to handle the refund.`
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <LivePulse board={board} now={now} />

      {InsuranceEngineService.getClaims()
        .filter((c) => InsuranceEngineService.checkThresholdWarning(c).isWarning)
        .map((c) => {
          const warn = InsuranceEngineService.checkThresholdWarning(c);
          return (
            <div key={c.id} className="bg-amber-50 border border-amber-300 text-amber-900 text-[12.5px] px-4 py-3 rounded-none flex items-center justify-between font-medium">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-700 shrink-0" />
                <span className="font-bold text-amber-800">Pre-auth threshold:</span>
                <span>{c.patientName} ({c.mrn}) — {warn.message}</span>
              </div>
              <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2.5 py-1 rounded-full font-mono">
                {warn.percentageConsumed}% Limit
              </span>
            </div>
          );
        })}

      {feedback && (
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] text-[12.5px] px-3.5 py-2.5 rounded-none flex items-start gap-2">
          <span className="flex-1">{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-bold">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* ── Live queue ───────────────────────────────────────────────── */}
        <section className="xl:col-span-2 bg-white border border-[#DDE2EC] rounded-none overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold text-[#0F172A]">My live queue</h3>
            <span className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
              live
            </span>
          </div>

          {board.active && (
            <div className="px-4 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-blue-100 font-extrabold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    In the room now
                  </div>
                  <div className="text-[14px] font-bold text-white truncate mt-0.5">{board.active.encounter.patientName}</div>
                  <div className="text-[11px] font-mono text-blue-200">
                    {board.active.encounter.umr} · {board.active.encounter.opNumber}
                  </div>
                </div>
                <div className="text-right bg-white/10 backdrop-blur-xs px-2.5 py-1.5 rounded-none border border-white/20">
                  <div className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">Consulting</div>
                  <div className="text-[16px] font-bold font-mono text-white">
                    {formatElapsed(encounterArrivalIso(board.active.encounter) || board.active.encounter.timestamps?.arrival, now)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => onGoToSheet(board.active!.encounter.id)}
                  className="px-3 py-1.5 rounded-none bg-white text-blue-700 text-[12px] font-bold hover:bg-blue-50 transition-colors shadow-xs cursor-pointer"
                >
                  Open consultation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    holdPatient(board.active!.encounter.id);
                    setFeedback(`${board.active!.encounter.patientName} put back in the queue.`);
                  }}
                  className="px-3 py-1.5 rounded-none bg-white/15 text-white text-[12px] font-semibold hover:bg-white/25 transition-colors border border-white/20 cursor-pointer"
                >
                  Put on hold
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 divide-y divide-[#F1F5F9] max-h-[420px] overflow-y-auto">
            {board.queue.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-[#94A3B8]">
                Nobody is waiting for you right now.
              </p>
            ) : (
              board.queue.map((entry, index) => {
                const overdue = entry.waitingMinutes >= LONG_WAIT_MINUTES;
                return (
                  <div
                    key={entry.encounter.id}
                    className={`px-4 py-3 transition-colors border-l-[4px] hover:bg-slate-50/80 ${
                      overdue
                        ? "border-l-rose-500 bg-rose-50/25"
                        : index === 0
                        ? "border-l-blue-500 bg-blue-50/20"
                        : "border-l-amber-400 bg-amber-50/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none ${
                              index === 0
                                ? "bg-amber-100 text-amber-900 border border-amber-300 font-extrabold"
                                : index === 1
                                ? "bg-slate-100 text-slate-700 font-bold"
                                : "text-[#94A3B8]"
                            }`}
                          >
                            #{index + 1}
                          </span>
                          <span className="text-[13px] font-bold text-gray-900 truncate">
                            {entry.encounter.patientName}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-[1px] rounded-none border ${
                              entry.isNewPatient ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]" : "bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]"
                            }`}
                          >
                            {entry.isNewPatient ? "New" : "Revisit"}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-[#64748B] mt-0.5 line-clamp-1">
                          {entry.encounter.chiefComplaint || "No chief complaint recorded"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div
                          className={`text-[11.5px] font-mono font-bold px-2 py-0.5 rounded-full border inline-block ${
                            overdue
                              ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {formatElapsed(encounterArrivalIso(entry.encounter) || entry.encounter.timestamps?.arrival || entry.encounter.registrationTime, now)}
                        </div>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5">waiting</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Btn variant="primary" size="xs" onClick={() => handleCallIn(entry.encounter.id)}>
                        Call in
                      </Btn>
                      <Btn variant="ghost" size="xs" onClick={() => onOpenPatient(entry.encounter.id)}>
                        Review first
                      </Btn>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ── Alerts ───────────────────────────────────────────────────── */}
        <section className="xl:col-span-3 bg-white border border-[#DDE2EC] rounded-none overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-[13.5px] font-semibold text-[#0F172A]">
                Needs my attention
                {needsAction.length > 0 && (
                  <span className="ml-2 text-[10px] font-bold bg-[#FEE2E2] text-[#B91C1C] px-1.5 py-0.5 rounded-full">
                    {needsAction.length}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#64748B]">
                Live from reception, the laboratory and the pharmacy.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-[#64748B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAcknowledged}
                  onChange={() => setShowAcknowledged(value => !value)}
                  className="w-3.5 h-3.5 accent-[#1B4FD8]"
                />
                Show cleared
              </label>
              {needsAction.length > 0 && (
                <button
                  type="button"
                  onClick={() => acknowledgeAll(board.alerts)}
                  className="text-[11px] text-[#1B4FD8] font-semibold hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 divide-y divide-[#F1F5F9] max-h-[560px] overflow-y-auto">
            {visibleAlerts.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCircle2 size={26} className="mx-auto mb-2 text-[#86EFAC]" />
                <p className="text-[12.5px] font-semibold text-[#334155]">Nothing needs you right now</p>
                <p className="text-[11.5px] text-[#94A3B8] mt-1">
                  New appointments, lab results, billing hold-ups and pharmacy movements appear here as they happen.
                </p>
              </div>
            ) : (
              visibleAlerts.map(alert => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  now={now}
                  onOpenPatient={onOpenPatient}
                  onCallIn={handleCallIn}
                  onWithdraw={handleWithdraw}
                  onAcknowledge={() => acknowledgeAlert(alert)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Pulse strip ──────────────────────────────────────────────────────────────

function LivePulse({ board, now }: { board: ReturnType<typeof buildDoctorLiveBoard>; now: number }) {
  const { pulse } = board;
  const tiles: {
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    cardStyle: string;
    numStyle: string;
    labelStyle: string;
  }[] = [
    {
      label: "Waiting",
      value: String(pulse.waiting),
      icon: Hourglass,
      cardStyle: "bg-gradient-to-br from-amber-50/90 to-amber-100/30 border-amber-200 border-t-[3px] border-t-amber-500",
      numStyle: pulse.waiting > 4 ? "text-rose-700" : "text-amber-900",
      labelStyle: "text-amber-800",
    },
    {
      label: "Longest wait",
      value: pulse.longestWaitMinutes ? `${pulse.longestWaitMinutes}m` : "--",
      hint: pulse.averageWaitMinutes ? `avg ${pulse.averageWaitMinutes}m` : undefined,
      icon: AlertTriangle,
      cardStyle: "bg-gradient-to-br from-rose-50/90 to-rose-100/30 border-rose-200 border-t-[3px] border-t-rose-500",
      numStyle: pulse.longestWaitMinutes >= LONG_WAIT_MINUTES ? "text-rose-700" : "text-rose-900",
      labelStyle: "text-rose-800",
    },
    {
      label: "Seen today",
      value: String(pulse.completedToday),
      icon: CheckCircle2,
      cardStyle: "bg-gradient-to-br from-emerald-50/90 to-emerald-100/30 border-emerald-200 border-t-[3px] border-t-emerald-500",
      numStyle: "text-emerald-900",
      labelStyle: "text-emerald-800",
    },
    {
      label: "Results ready",
      value: String(pulse.resultsReady),
      icon: BarChart3,
      cardStyle: "bg-gradient-to-br from-blue-50/90 to-blue-100/30 border-blue-200 border-t-[3px] border-t-blue-500",
      numStyle: pulse.resultsReady > 0 ? "text-blue-700 font-extrabold" : "text-blue-900",
      labelStyle: "text-blue-800",
    },
    {
      label: "Lab in progress",
      value: String(pulse.labInProgress),
      hint: pulse.labAwaitingPayment ? `${pulse.labAwaitingPayment} unpaid` : undefined,
      icon: FlaskConical,
      cardStyle: "bg-gradient-to-br from-violet-50/90 to-violet-100/30 border-violet-200 border-t-[3px] border-t-violet-500",
      numStyle: "text-violet-900",
      labelStyle: "text-violet-800",
    },
    {
      label: "At pharmacy",
      value: String(pulse.rxAwaitingPharmacy),
      hint: pulse.rxDispensed ? `${pulse.rxDispensed} dispensed` : undefined,
      icon: Pill,
      cardStyle: "bg-gradient-to-br from-teal-50/90 to-teal-100/30 border-teal-200 border-t-[3px] border-t-teal-500",
      numStyle: "text-teal-900",
      labelStyle: "text-teal-800",
    },
  ];

  return (
    <div className="bg-white border border-[#DDE2EC] rounded-none px-4 py-3 shadow-xs">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[13.5px] font-bold text-[#0F172A] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Clinic Pulse Right Now
        </h3>
        <span className="text-[11px] font-mono text-[#64748B] bg-slate-100 px-2 py-0.5 rounded-none border border-slate-200">
          {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tiles.map(tile => {
          const IconComponent = tile.icon;
          return (
            <div key={tile.label} className={`border rounded-none px-3 py-2.5 shadow-xs transition-transform hover:-translate-y-0.5 ${tile.cardStyle}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[20px] font-extrabold leading-none tabular-nums ${tile.numStyle}`}>{tile.value}</span>
                <IconComponent size={16} className={tile.labelStyle} />
              </div>
              <div className={`text-[11.5px] font-bold mt-2 ${tile.labelStyle}`}>{tile.label}</div>
              {tile.hint && <div className="text-[10px] opacity-75 font-medium mt-0.5 truncate">{tile.hint}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── One alert ────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  now,
  onOpenPatient,
  onCallIn,
  onWithdraw,
  onAcknowledge,
}: {
  alert: LiveAlert;
  now: number;
  onOpenPatient: (encounterId: string) => void;
  onCallIn: (encounterId: string) => void;
  onWithdraw: (alert: LiveAlert) => void;
  onAcknowledge: () => void;
}) {
  const style = SEVERITY_STYLES[alert.severity];
  return (
    <div
      className={`px-4 py-3 ${alert.acknowledged ? "opacity-55" : ""}`}
      style={alert.acknowledged ? undefined : { backgroundColor: alert.severity === "info" ? undefined : style.bg }}
    >
      <div className="flex items-start gap-3">
        {(() => {
          const KindIcon = KIND_ICONS[alert.kind];
          return (
            <span
              className="w-8 h-8 rounded-none flex items-center justify-center shrink-0"
              style={{ backgroundColor: alert.severity === "info" ? "#F1F5F9" : "#FFFFFF", color: style.text, border: `1px solid ${style.border}` }}
            >
              <KindIcon size={15} />
            </span>
          );
        })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-semibold text-gray-900">{alert.title}</span>
            {alert.severity !== "info" && (
              <span
                className="text-[10px] font-semibold px-1.5 py-[1px] rounded-none border"
                style={{ color: style.text, borderColor: style.border, backgroundColor: "#FFFFFF" }}
              >
                {style.label}
              </span>
            )}
            {alert.acknowledged && (
              <span className="text-[9.5px] font-bold uppercase text-[#94A3B8]">cleared</span>
            )}
          </div>
          <p className="text-[11.5px] text-[#475569] mt-0.5 break-words">{alert.detail}</p>
          <div className="text-[10.5px] text-[#94A3B8] mt-1 font-mono">
            {alert.umr} · {formatElapsed(alert.at, now)} ago
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {alert.kind === "new-patient" && alert.encounterId && (
              <>
                <Btn variant="primary" size="xs" onClick={() => onCallIn(alert.encounterId!)}>
                  Call in
                </Btn>
                <Btn variant="ghost" size="xs" onClick={() => onOpenPatient(alert.encounterId!)}>
                  Open record
                </Btn>
              </>
            )}
            {alert.kind === "waiting-long" && alert.encounterId && (
              <Btn variant="primary" size="xs" onClick={() => onCallIn(alert.encounterId!)}>
                Call in now
              </Btn>
            )}
            {(alert.kind === "lab-critical" || alert.kind === "lab-result") && alert.encounterId && (
              <Btn variant="primary" size="xs" onClick={() => onOpenPatient(alert.encounterId!)}>
                Review results
              </Btn>
            )}
            {alert.kind === "lab-awaiting-payment" && (
              <>
                {alert.encounterId && (
                  <Btn variant="ghost" size="xs" onClick={() => onOpenPatient(alert.encounterId!)}>
                    Open record
                  </Btn>
                )}
                {alert.actionable && (
                  <Btn variant="outline" size="xs" onClick={() => onWithdraw(alert)}>
                    Withdraw order
                  </Btn>
                )}
              </>
            )}
            {alert.kind === "rx-rejected" && alert.encounterId && (
              <Btn variant="primary" size="xs" onClick={() => onOpenPatient(alert.encounterId!)}>
                Rewrite prescription
              </Btn>
            )}

            {!alert.acknowledged && (
              <button
                type="button"
                onClick={onAcknowledge}
                className="text-[11px] text-[#64748B] font-semibold hover:text-[#334155] px-1.5"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

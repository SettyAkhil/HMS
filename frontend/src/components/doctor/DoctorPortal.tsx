import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Users } from "lucide-react"
import ConsultationCharges from "./ConsultationCharges"
import { Icon } from "../icons"
import { Btn, StatusBadge } from "../shared"
import ApplyLeaveModal from "../hrms/ApplyLeaveModal"
import { db, DBOPEncounter } from "../../services/db"
import {
  ConsultationRecord,
  DoctorAccount,
  DoctorNotification,
  DoctorPortalDatabase,
  formatBytes,
  getAllDoctorAccounts,
  getDoctorById,
  ParsedLabTest,
  ParsedMedication,
  readPrescriptionFile,
} from "../../services/doctorPortalDb"
import {
  dispatchableHalves,
  dispatchConsultation,
  DispatchResult,
  DispatchTargets,
} from "../../services/consultationDispatch"
import { LabOrderDatabase, priceForTest } from "../../services/labOrdersDb"
import {
  checkPrescriptionAiStatus,
  splitPrescriptionFile,
  splitPrescriptionText,
  localSplit,
  PrescriptionSplit,
} from "../../lib/prescriptionAI"
import {
  buildTurn,
  ConsultationNoteSummary,
  diarizeTranscript,
  formatTranscript,
  setTurnSpeaker,
  Speaker,
  summariseConsultation,
  TranscriptTurn,
  transcribeAudioWithWhisper,
  WHISPER_LANGUAGES,
} from "../../lib/medicalVoiceAI"
import { formatElapsed, useLiveClinic } from "../../hooks/useLiveClinic"
import {
  buildDoctorLiveBoard,
  LONG_WAIT_MINUTES,
} from "../../services/doctorLiveFeed"
import { TONE, gradient } from "./doctorTheme"

/**
 * The per-doctor portal.
 *
 * One doctor signs in and sees only their own patients. For each one they get the
 * context they need before speaking (admit card for a first visit, prior
 * consultations and medication for a revisit), then write ONE prescription sheet
 * -- typed, drawn on the whiteboard, or photographed -- which the AI splits into
 * medicines (-> pharmacy) and investigations (-> reception billing -> laboratory).
 *
 * The split is always reviewed and editable before dispatch: it is a first pass
 * over a doctor's handwriting, not an authority on what the patient receives.
 */

import PrescriptionWhiteboard from "./PrescriptionWhiteboard"
import LiveBoard from "./LiveBoard"

/**
 * Four steps, in the order a consultation actually happens.
 *
 * `voice` and `sheet` are deliberately two steps rather than one. What is spoken
 * in the room is history, examination and advice; what is prescribed is written,
 * drawn or handed over on paper. Keeping them apart is not a layout preference
 * -- it is what stops a misheard word in a recording from turning into a
 * dispensed drug.
 */
type PortalTab = "patient" | "voice" | "sheet" | "review"
type SheetMode = "type" | "write" | "upload"

const TABS: {
  key: PortalTab
  stepNum: string
  short: string
  label: string
  hint: string
}[] = [
  {
    key: "patient",
    stepNum: "1",
    short: "Patient",
    label: "Patient History & Vitals",
    hint: "Admit card, vitals and past medical history",
  },
  {
    key: "voice",
    stepNum: "2",
    short: "Consultation",
    label: "Consultation & Notes",
    hint: "Record the conversation, separate the speakers, summarise the note",
  },
  {
    key: "sheet",
    stepNum: "3",
    short: "Prescription",
    label: "Prescription Sheet",
    hint: "Write, draw or upload the prescription -- the only source of orders",
  },
  {
    key: "review",
    stepNum: "4",
    short: "Review",
    label: "Review & Send",
    hint: "Check medicines and investigations before they leave the room",
  },
]

/**
 * A prescription the doctor photographed, scanned or picked off disk.
 *
 * `kind` is what separates something the portal can render inline from a PDF or
 * an undecodable file, which gets a file card instead of an `<img>` that would
 * render as a broken image and read as "the upload failed".
 */
interface UploadedRx {
  name: string
  size: number
  type: string
  dataUrl: string
  kind?: "image" | "document"
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(",")
  const mime = /:(.*?);/.exec(meta)?.[1] || "image/png"
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

const EMPTY_MEDICATION: ParsedMedication = {
  name: "",
  strength: "",
  dosage: "",
  frequency: "",
  route: "Oral",
  duration: "",
  instructions: "",
  quantity: 1,
}

export default function DoctorPortal({
  doctor: initialDoctor,
  onOpenErVisit,
}: {
  doctor: DoctorAccount
  onOpenErVisit?: (visitId: number) => void
}) {
  const [doctor, setDoctor] = useState<DoctorAccount>(initialDoctor)
  useEffect(() => {
    setDoctor(initialDoctor)
  }, [initialDoctor?.id])
  // One clock and one data revision for the whole portal: `revision` covers
  // changes made here, on another screen, or in another tab (reception billing,
  // the pharmacy, the lab); `now` ticks every second for the waiting timers.
  const { revision, now } = useLiveClinic()
  const [view, setView] = useState<"live" | "patient">("live")
  const [tab, setTab] = useState<PortalTab>("patient")
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(
    null,
  )
  const [inboxTab, setInboxTab] = useState<InboxTab>("queue")
  // Result of taking an unclaimed patient -- shown in the inbox, not a blocking alert().
  const [inboxNotice, setInboxNotice] = useState<{ ok: boolean ;text: string } | null>(null)

  // The spoken consultation. Held as attributed turns rather than one blob of
  // text so a speaker can be corrected after the fact without re-running a
  // guess over the whole transcript.
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])
  const [voiceDuration, setVoiceDuration] = useState(0)

  // Consultation sheet
  const [sheetMode, setSheetMode] = useState<SheetMode>("type")
  const [sheetText, setSheetText] = useState("")
  const [whiteboardImage, setWhiteboardImage] = useState<string | null>(null)
  const [uploadedRx, setUploadedRx] = useState<UploadedRx | null>(null)
  const [video, setVideo] = useState<{
    name: string
    size: number
    type: string
    objectUrl: string
  } | null>(null)

  // AI split, then the doctor's edits on top of it
  const [split, setSplit] = useState<PrescriptionSplit | null>(null)
  const [medications, setMedications] = useState<ParsedMedication[]>([])
  const [labTests, setLabTests] = useState<ParsedLabTest[]>([])
  const [diagnosis, setDiagnosis] = useState("")
  const [advice, setAdvice] = useState("")
  const [splitting, setSplitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(
    null,
  )
  // Whether server-side OCR is usable. A typed sheet falls back to the browser
  // splitter, but a photographed one cannot, so this is checked once up front
  // and shown on the sheet rather than discovered on a failed upload.
  const [aiStatus, setAiStatus] = useState<{
    online: boolean
    reason?: string
  } | null>(null)

  const rxInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const videoUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    checkPrescriptionAiStatus().then((status) => {
      if (!cancelled) setAiStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Object URLs are session-scoped; revoke the previous one so replacing a video
  // repeatedly doesn't leak the old blobs for the life of the tab.
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    }
  }, [])

  // Real-time live separation whenever the doctor types or updates the prescription sheet
  useEffect(() => {
    if (sheetMode !== "type") return
    const trimmed = sheetText.trim()
    if (!trimmed) {
      if (split) {
        setSplit(null)
        setMedications([])
        setLabTests([])
      }
      return
    }

    // 1. Instant local split (0ms synchronous preview)
    const instant = localSplit(sheetText)
    setSplit(instant)
    setMedications(instant.medications)
    setLabTests(instant.labTests)
    if (instant.diagnosis) setDiagnosis(instant.diagnosis)
    if (instant.advice) setAdvice(instant.advice)

    if (consultation) {
      DoctorPortalDatabase.updateConsultation(consultation.id, {
        rawText: sheetText,
        aiEngine: instant.engine,
        summary: instant.summary,
        diagnosis: instant.diagnosis || diagnosis,
        advice: instant.advice || advice,
        medications: instant.medications,
        labTests: instant.labTests,
        unclassified: instant.unclassified,
      })
    }

    // 2. Debounced backend AI refinement if reachable (500ms)
    const timer = setTimeout(async () => {
      try {
        const refined = await splitPrescriptionText(sheetText)
        if (refined && (refined.medications.length > 0 || refined.labTests.length > 0)) {
          setSplit(refined)
          setMedications(refined.medications)
          setLabTests(refined.labTests)
          if (refined.diagnosis) setDiagnosis(refined.diagnosis)
          if (refined.advice) setAdvice(refined.advice)
        }
      } catch {
        // Keeps the instant local split
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [sheetText, sheetMode])

  const notifications = useMemo(
    () => DoctorPortalDatabase.getNotifications(doctor.id),
    [doctor.id, revision],
  )
  // Visits this doctor has finished: everything assigned, minus the open queue.
  const finished = useMemo(() => {
    const open = new Set(notifications.map((n) => n.encounterId))
    return DoctorPortalDatabase.getNotifications(doctor.id, true).filter((n) => !open.has(n.encounterId))
  }, [doctor.id, notifications, revision])
  const unreadCount = useMemo(
    () =>
      DoctorPortalDatabase.getNotifications(doctor.id).filter((n) => !n.read)
        .length,
    [doctor.id, revision],
  )
  const unassigned = useMemo(
    () => DoctorPortalDatabase.getUnassigned(doctor.id),
    [doctor.id, revision],
  )

  // Taking an unassigned patient assigns them and opens them straight away, so
  // the click that claims the patient is also the click that starts the visit.
  const claimPatient = (notification: DoctorNotification) => {
    const result = DoctorPortalDatabase.claimEncounter(
      doctor.id,
      notification.encounterId,
    )
    setInboxNotice({ ok: result.ok, text: result.message })
    window.setTimeout(() => setInboxNotice(null), 4000)
    if (!result.ok) return
    setInboxTab("queue")
    openPatient(notification)
  }

  /**
   * The visit the doctor is working on.
   *
   * Falls back to the full list, closed visits included, rather than only the
   * open inbox. Dispatching moves the encounter to `Awaiting Billing`, which is
   * not an open status, so looking only at the inbox made the patient vanish
   * from under the doctor the instant they pressed send -- taking the
   * confirmation, the prescription id and the lab order id with it, so a
   * dispatch that had in fact succeeded looked exactly like one that failed.
   */
  const selected: DoctorNotification | undefined = useMemo(() => {
    if (!selectedEncounterId) return undefined
    return (
      notifications.find((n) => n.encounterId === selectedEncounterId) ||
      DoctorPortalDatabase.getNotifications(doctor.id, true).find(
        (n) => n.encounterId === selectedEncounterId,
      )
    )
  }, [notifications, selectedEncounterId, doctor.id, revision])

  const context = useMemo(
    () =>
      selected
        ? DoctorPortalDatabase.getPatientContext(
            selected.umr,
            selected.encounterId,
          )
        : null,
    [selected, revision],
  )

  const consultation: ConsultationRecord | undefined = useMemo(
    () =>
      selected
        ? DoctorPortalDatabase.getConsultationForEncounter(selected.encounterId)
        : undefined,
    [selected, revision],
  )

  const patientLabOrders = useMemo(
    () => (selected ? LabOrderDatabase.getOrdersForPatient(selected.umr) : []),
    [selected, revision],
  )

  // The clinical note is derived from the turns on every change, never stored as
  // a separate editable copy -- so it cannot drift away from the conversation it
  // claims to summarise. Only the doctor's turn corrections change it.
  const voiceSummary: ConsultationNoteSummary | null = useMemo(
    () =>
      transcript.length
        ? summariseConsultation(transcript, {
            durationSeconds: voiceDuration,
            patientName: selected?.patientName,
          })
        : null,
    [transcript, voiceDuration, selected?.patientName],
  )

  /** Writes the conversation and its note into the visit's clinical record. */
  const persistVoice = useCallback(
    (turns: TranscriptTurn[], durationSeconds: number) => {
      if (!consultation) return
      if (!turns.length) {
        DoctorPortalDatabase.updateConsultation(consultation.id, {
          voice: undefined,
        })
        return
      }
      DoctorPortalDatabase.updateConsultation(consultation.id, {
        voice: {
          turns,
          summary: summariseConsultation(turns, {
            durationSeconds,
            patientName: selected?.patientName,
          }),
          durationSeconds,
          recordedAt:
            consultation.voice?.recordedAt || new Date().toISOString(),
        },
      })
    },
    [consultation, selected?.patientName],
  )

  const handleTranscript = useCallback(
    (turns: TranscriptTurn[], durationSeconds?: number) => {
      const seconds = durationSeconds ?? voiceDuration
      setTranscript(turns)
      if (durationSeconds !== undefined) setVoiceDuration(durationSeconds)
      persistVoice(turns, seconds)
    },
    [persistVoice, voiceDuration],
  )

  // Recomputed on data changes and at most twice a minute, not on every clock
  // tick -- the header only needs the count, and the board recomputes its own.
  const attentionCount = useMemo(
    () => buildDoctorLiveBoard(doctor, now).actionable.length,
    [doctor, revision, Math.floor(now / 30000)],
  )

  const resetSheet = useCallback(() => {
    setSheetMode("type")
    setSheetText("")
    setTranscript([])
    setVoiceDuration(0)
    setWhiteboardImage(null)
    setUploadedRx(null)
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    videoUrlRef.current = null
    setVideo(null)
    setSplit(null)
    setMedications([])
    setLabTests([])
    setDiagnosis("")
    setAdvice("")
    setError(null)
    setDispatchResult(null)
  }, [])

  const openPatient = (
    notification: DoctorNotification,
    landOn: PortalTab = "patient",
  ) => {
    setSelectedEncounterId(notification.encounterId)
    DoctorPortalDatabase.markRead([notification.id])
    resetSheet()
    setView("patient")
    setTab(landOn)

    const encounter = db.getEncounterById(notification.encounterId)
    if (!encounter) return
    const record = DoctorPortalDatabase.openConsultation(encounter, doctor)

    // Reopening a visit restores whatever was drafted for it, so a doctor who
    // navigates away mid-consultation doesn't lose the sheet.
    setSheetText(record.rawText)
    setWhiteboardImage(record.whiteboardImage || null)
    setUploadedRx(
      record.uploadedPrescription?.dataUrl
        ? {
            name: record.uploadedPrescription.name,
            size: record.uploadedPrescription.size,
            type: record.uploadedPrescription.type,
            dataUrl: record.uploadedPrescription.dataUrl,
            kind:
              record.uploadedPrescription.type === "application/pdf"
                ? "document"
                : "image",
          }
        : null,
    )
    setTranscript(record.voice?.turns || [])
    setVoiceDuration(record.voice?.durationSeconds || 0)
    setDiagnosis(record.diagnosis)
    setAdvice(record.advice)
    setMedications(record.medications)
    setLabTests(record.labTests)
    if (record.medications.length || record.labTests.length) {
      setSplit({
        diagnosis: record.diagnosis,
        advice: record.advice,
        summary: record.summary,
        medications: record.medications,
        labTests: record.labTests,
        unclassified: record.unclassified,
        engine: record.aiEngine,
        ocrText: record.rawText,
      })
    }
    if (record.whiteboardImage) setSheetMode("write")
    else if (record.uploadedPrescription) setSheetMode("upload")
  }

  /** Opens a patient straight from the live board, which only knows the visit id. */
  const openEncounter = (
    encounterId: string,
    landOn: PortalTab = "patient",
  ) => {
    const notification = DoctorPortalDatabase.getNotifications(
      doctor.id,
      true,
    ).find((n) => n.encounterId === encounterId)
    if (!notification) return
    if (!notifications.some((n) => n.encounterId === encounterId)) {
      // The visit is already finished; reveal it rather than silently doing nothing.
      setInboxTab("finished")
    }
    openPatient(notification, landOn)
  }

  const startConsultation = () => {
    if (!selected) return
    const existingEnc = db.getEncounterById(selected.encounterId)
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    db.updateEncounter(selected.encounterId, {
      status: "Under Consultation",
      timestamps: {
        ...(existingEnc?.timestamps || {
          arrival: new Date().toISOString(),
        }),
        // Record consultation start only once at the actual start of consultation
        consultationStart: existingEnc?.timestamps?.consultationStart || nowTime,
      },
    })
    setTab("voice")
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  const handleVideoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const objectUrl = URL.createObjectURL(file)
    videoUrlRef.current = objectUrl
    setVideo({ name: file.name, size: file.size, type: file.type, objectUrl })

    if (consultation) {
      // Only the metadata is persisted. A consultation video is tens of
      // megabytes; inlining it as base64 would blow the whole storage quota and
      // take the rest of the chart down with it, so the file stays a blob URL
      // for this session and the record notes what was attached.
      DoctorPortalDatabase.updateConsultation(consultation.id, {
        video: {
          name: file.name,
          type: file.type,
          size: file.size,
          recordedAt: new Date().toISOString(),
        },
      })
    }
    event.target.value = ""
  }

  /**
   * Takes a photographed or scanned prescription and digitises it.
   *
   * Uploading *is* the action -- the doctor has handed over the sheet, so the
   * split runs immediately rather than waiting behind a second button, and any
   * failure is reported instead of swallowed. The earlier version dropped PDFs
   * on the floor (they cannot go through a canvas) and caught its own errors
   * into a comment, so a doctor who uploaded one saw nothing happen at all.
   */
  const handleRxUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ""
    setError(null)
    setSheetMode("upload")

    let attachment: UploadedRx
    try {
      const { dataUrl, kind } = await readPrescriptionFile(file)
      attachment = {
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        kind,
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `${file.name} could not be read: ${err.message}`
          : `${file.name} could not be read. Try a JPG or PNG photo of the sheet.`,
      )
      return
    }

    setUploadedRx(attachment)
    if (consultation) {
      DoctorPortalDatabase.updateConsultation(consultation.id, {
        uploadedPrescription: {
          ...attachment,
          recordedAt: new Date().toISOString(),
        },
      })
    }
    await runSplitOn({ source: "upload", attachment })
  }

  const handleWhiteboardCommit = useCallback(
    (dataUrl: string | null) => {
      setWhiteboardImage(dataUrl)
      if (consultation) {
        DoctorPortalDatabase.updateConsultation(consultation.id, {
          whiteboardImage: dataUrl || undefined,
        })
      }
    },
    [consultation],
  )

  // ── AI split ──────────────────────────────────────────────────────────────
  // Orders come from the prescription sheet and from nowhere else. The voice
  // transcript is never fed to the splitter: a doctor does not read a
  // prescription out at the patient, and keyword-matching a conversation for
  // drug names invents orders nobody wrote.

  /**
   * Digitises one prescription sheet into medicines and investigations.
   *
   * `source` is passed explicitly rather than read off `sheetMode`, because the
   * upload handler calls this in the same tick it switches modes and would
   * otherwise race its own state update.
   */
  const runSplitOn = async (
    options: {
      source?: SheetMode
      attachment?: UploadedRx | null
      whiteboardDataUrl?: string | null
      goToReview?: boolean
    } = {},
  ) => {
    if (!selected || !consultation) return
    const source = options.source || sheetMode
    const attachment =
      options.attachment !== undefined ? options.attachment : uploadedRx
    const wbData = options.whiteboardDataUrl || whiteboardImage

    setError(null)
    setSplitting(true)

    // Watchdog safety timeout: never let splitting hang beyond 10 seconds
    const watchdog = setTimeout(() => {
      setSplitting(false)
    }, 10_000)

    try {
      let result: PrescriptionSplit
      if (source === "upload" && attachment) {
        result = await splitPrescriptionFile(
          dataUrlToBlob(attachment.dataUrl),
          attachment.name,
        )
      } else if (source === "write" && wbData) {
        result = await splitPrescriptionFile(
          dataUrlToBlob(wbData),
          "whiteboard-prescription.jpg",
        )
      } else if (sheetText.trim()) {
        result = await splitPrescriptionText(sheetText)
      } else {
        setError(
          "Write, type or upload the prescription sheet before digitising it.",
        )
        return
      }

      setSplit(result)
      setMedications(result.medications)
      setLabTests(result.labTests)
      if (result.diagnosis) setDiagnosis(result.diagnosis)
      if (result.advice) setAdvice(result.advice)
      if (result.ocrText && !sheetText.trim()) setSheetText(result.ocrText)

      DoctorPortalDatabase.updateConsultation(consultation.id, {
        rawText: result.ocrText || sheetText,
        aiEngine: result.engine,
        summary: result.summary,
        diagnosis: result.diagnosis || diagnosis,
        advice: result.advice || advice,
        medications: result.medications,
        labTests: result.labTests,
        unclassified: result.unclassified,
      })

      if (result.degradedReason) setError(result.degradedReason)
      // A split that read nothing leaves the doctor on the sheet, where the fix
      // is; only a split with something in it is worth a trip to the review tab.
      if (
        options.goToReview !== false &&
        (result.medications.length || result.labTests.length)
      ) {
        setTab("review")
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The prescription could not be digitised.",
      )
    } finally {
      clearTimeout(watchdog)
      setSplitting(false)
    }
  }

  const runSplit = (options?: { whiteboardDataUrl?: string; source?: SheetMode }) =>
    runSplitOn({
      source: options?.source || sheetMode,
      whiteboardDataUrl: options?.whiteboardDataUrl,
      goToReview: false,
    })

  /**
   * What is still waiting to go out, judged from the edited tables on screen
   * rather than the last saved record -- the doctor may have just added a
   * medicine to a sheet that only had investigations on it.
   */
  const pending = useMemo(() => {
    if (!consultation)
      return { pharmacy: false, lab: false, unreadSheet: false }
    return dispatchableHalves({
      ...consultation,
      medications,
      labTests,
      uploadedPrescription: uploadedRx
        ? { ...uploadedRx, recordedAt: new Date().toISOString() }
        : consultation.uploadedPrescription,
      whiteboardImage: whiteboardImage || undefined,
    })
  }, [consultation, medications, labTests, uploadedRx, whiteboardImage])

  const canDispatch = pending.pharmacy || pending.lab

  /**
   * Sends the sheet, or just one half of it.
   *
   * A consultation often produces only medicines or only investigations, and the
   * two go to different departments, so neither waits on the other: `targets`
   * picks a half, and omitting it sends whatever is still outstanding.
   */
  const handleDispatch = (targets: DispatchTargets = {}) => {
    if (!consultation || !selected) return
    const cleanedMedications = medications.filter((m) => m.name.trim())
    const cleanedLabTests = labTests.filter((t) => t.name.trim())

    const saved = DoctorPortalDatabase.saveConsultation({
      ...consultation,
      rawText: sheetText,
      diagnosis,
      advice,
      medications: cleanedMedications,
      labTests: cleanedLabTests,
      summary: split?.summary || "",
      aiEngine: split?.engine || "manual",
      whiteboardImage: whiteboardImage || undefined,
      uploadedPrescription: uploadedRx
        ? { ...uploadedRx, recordedAt: new Date().toISOString() }
        : consultation.uploadedPrescription,
      voice:
        transcript.length && voiceSummary
          ? {
              turns: transcript,
              summary: voiceSummary,
              durationSeconds: voiceDuration,
              recordedAt:
                consultation.voice?.recordedAt || new Date().toISOString(),
            }
          : consultation.voice,
    })

    const result = dispatchConsultation(saved, doctor, targets)
    setDispatchResult(result)
    if (result.errors.length) setError(result.errors.join(" "))
  }

  /**
   * Digitise the sheet and send it in one action.
   *
   * The split runs first and its result is dispatched directly, rather than
   * relying on the state it sets -- a React state update is not visible to the
   * same tick, and the previous version worked around that by re-splitting the
   * text locally, which is how spoken words ended up being scanned for drugs.
   */
  const handleDigitiseAndSend = async () => {
    if (!consultation || !selected) return
    await runSplitOn({ goToReview: false })
    setTab("review")
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col lg:h-full bg-[#F0F2F5] lg:overflow-hidden">
      <PortalHeader
        doctor={doctor}
        unreadCount={unreadCount}
        waitingCount={notifications.filter((n) => n.status !== "Under Consultation").length}
        inRoomCount={notifications.filter((n) => n.status === "Under Consultation").length}
        unclaimedCount={unassigned.length}
        seenTodayCount={finished.filter((n) => isToday(n.arrivedAt)).length}
        attentionCount={attentionCount}
        now={now}
        view={view}
        onView={(next) => {
          setView(next)
          if (next === "patient" && !selected && notifications.length)
            openPatient(notifications[0])
        }}
        onSwitchDoctor={(newDocId) => {
          const nextDoc = getDoctorById(newDocId)
          if (nextDoc) {
            setDoctor(nextDoc)
            setSelectedEncounterId(null)
          }
        }}
      />

      {/* Below lg the inbox stacks above the workspace (capped height) and the
        page scrolls as one column instead of squeezing the workspace. */}
      <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
        <PatientInbox
          notifications={notifications}
          unassigned={unassigned}
          finished={finished}
          onClaim={claimPatient}
          selectedEncounterId={view === "patient" ? selectedEncounterId : null}
          tab={inboxTab}
          onTab={setInboxTab}
          notice={inboxNotice}
          onDismissNotice={() => setInboxNotice(null)}
          onSelect={openPatient}
          onMarkAllRead={() => DoctorPortalDatabase.markAllRead(doctor.id)}
          now={now}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {view === "live" ? (
            <LiveBoard
              doctor={doctor}
              now={now}
              revision={revision}
              onOpenPatient={(encounterId) => openEncounter(encounterId)}
              onGoToSheet={(encounterId) => openEncounter(encounterId, "sheet")}
              onOpenErVisit={onOpenErVisit}
            />
          ) : !selected ? (
            <EmptyWorkspace
              unreadCount={unreadCount}
              onBackToBoard={() => setView("live")}
            />
          ) : (
            <>
              <PatientBanner
                notification={selected}
                consultation={consultation}
                onStartConsultation={startConsultation}
              />

              {/* Step rail */}
              <ol className="bg-white border-b border-[#E2E8F0] px-4 lg:px-5 py-2.5 flex items-center gap-1 overflow-x-auto">
                {TABS.map((t, index) => {
                  const isActive = tab === t.key
                  const currentIndex = TABS.findIndex((x) => x.key === tab)
                  const isPast = index < currentIndex
                  const badge =
                    t.key === "voice"
                      ? transcript.length
                      : t.key === "review"
                        ? medications.length + labTests.length
                        : 0

                  return (
                    <li
                      key={t.key}
                      className="flex items-center gap-1 min-w-max"
                    >
                      {index > 0 && (
                        <span
                          aria-hidden
                          className={`w-6 h-px ${
                            isPast || isActive ? "bg-[#1B4FD8]" : "bg-[#E2E8F0]"
                          }`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setTab(t.key)}
                        title={t.hint}
                        aria-current={isActive ? "step" : undefined}
                        className={`group flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[#1B4FD8] border-[#1B4FD8] text-white"
                            : isPast
                              ? "bg-white border-[#BFDBFE] text-[#1E40AF] hover:bg-[#EFF6FF]"
                              : "bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : isPast
                                ? "bg-[#DBEAFE] text-[#1D4ED8]"
                                : "bg-[#F1F5F9] text-[#94A3B8]"
                          }`}
                        >
                          {isPast ? "✓" : t.stepNum}
                        </span>
                        <span className="text-[12px] font-semibold whitespace-nowrap">
                          <span className="lg:hidden">{t.short}</span>
                          <span className="hidden lg:inline">{t.label}</span>
                        </span>
                        {badge > 0 && (
                          <span
                            className={`text-[10px] font-bold font-mono px-1.5 rounded-full ${
                              isActive
                                ? "bg-white text-[#1B4FD8]"
                                : "bg-[#EFF6FF] text-[#1B4FD8]"
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>

              {error && (
                <div className="mx-5 mt-4 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12.5px] px-3.5 py-2.5 rounded flex items-start gap-2">
                  <span className="font-bold">⚠</span>
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="font-bold text-[#B45309]"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5">
                {tab === "patient" && context && (
                  <PatientContextPanel
                    notification={selected}
                    context={context}
                    labOrders={patientLabOrders}
                    onProceed={startConsultation}
                  />
                )}

                {tab === "voice" && (
                  <ConsultationConversation
                    key={`voice-${selected.encounterId}`}
                    notification={selected}
                    doctor={doctor}
                    turns={transcript}
                    durationSeconds={voiceDuration}
                    summary={voiceSummary}
                    onTurns={handleTranscript}
                    onBack={() => setTab("patient")}
                    onProceed={() => setTab("sheet")}
                  />
                )}

                {tab === "sheet" && (
                  <PrescriptionSheetStep
                    // Re-keyed per visit so panel state (the optional video
                    // disclosure) starts fresh for each patient.
                    key={selected.encounterId}
                    notification={selected}
                    doctor={doctor}
                    voiceSummary={voiceSummary}
                    aiStatus={aiStatus}
                    sheetMode={sheetMode}
                    onSheetMode={setSheetMode}
                    sheetText={sheetText}
                    onSheetText={(value) => {
                      setSheetText(value)
                      if (consultation)
                        DoctorPortalDatabase.updateConsultation(
                          consultation.id,
                          { rawText: value },
                        )
                    }}
                    whiteboardImage={whiteboardImage}
                    onWhiteboardCommit={handleWhiteboardCommit}
                    uploadedRx={uploadedRx}
                    onRemoveUploadedRx={() => {
                      setUploadedRx(null)
                      if (consultation)
                        DoctorPortalDatabase.updateConsultation(
                          consultation.id,
                          { uploadedPrescription: undefined },
                        )
                    }}
                    video={video}
                    persistedVideo={consultation?.video}
                    rxInputRef={rxInputRef}
                    videoInputRef={videoInputRef}
                    onRxUpload={handleRxUpload}
                    onVideoSelected={handleVideoSelected}
                    onRemoveVideo={() => {
                      if (videoUrlRef.current)
                        URL.revokeObjectURL(videoUrlRef.current)
                      videoUrlRef.current = null
                      setVideo(null)
                      if (consultation)
                        DoctorPortalDatabase.updateConsultation(
                          consultation.id,
                          { video: undefined },
                        )
                    }}
                    splitting={splitting}
                    split={split}
                    medications={medications}
                    labTests={labTests}
                    onRunSplit={runSplit}
                    onDigitiseAndSend={handleDigitiseAndSend}
                    onBackToVoice={() => setTab("voice")}
                    onStartFresh={() => {
                      setSheetMode("type")
                      setSheetText("")
                      setWhiteboardImage(null)
                      setUploadedRx(null)
                      setSplit(null)
                      setMedications([])
                      setLabTests([])
                      setError(null)
                      if (consultation) {
                        DoctorPortalDatabase.updateConsultation(
                          consultation.id,
                          {
                            rawText: "",
                            whiteboardImage: undefined,
                            uploadedPrescription: undefined,
                            medications: [],
                            labTests: [],
                            unclassified: [],
                          },
                        )
                      }
                    }}
                  />
                )}

                {tab === "review" && (
                  <ReviewAndDispatch
                    split={split}
                    splitting={splitting}
                    diagnosis={diagnosis}
                    advice={advice}
                    onDiagnosis={setDiagnosis}
                    onAdvice={setAdvice}
                    medications={medications}
                    labTests={labTests}
                    onMedications={setMedications}
                    onLabTests={setLabTests}
                    voiceSummary={voiceSummary}
                    consultation={consultation}
                    canDispatch={canDispatch}
                    pending={pending}
                    dispatchResult={dispatchResult}
                    onDispatch={handleDispatch}
                    onBackToSheet={() => setTab("sheet")}
                    onNextPatient={() => {
                      const nextWaiting = notifications.find(
                        (n) =>
                          n.encounterId !== selected.encounterId &&
                          n.status !== "Consultation Completed" &&
                          n.status !== "Under Consultation",
                      )
                      if (nextWaiting) {
                        openPatient(nextWaiting)
                      } else {
                        setView("live")
                      }
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

type InboxTab = "queue" | "unclaimed" | "finished"

function isToday(iso: string): boolean {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  const d = new Date(t)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

const doctorInitials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/i, "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")

function PortalHeader({
  doctor,
  unreadCount,
  waitingCount,
  inRoomCount,
  unclaimedCount,
  seenTodayCount,
  attentionCount,
  now,
  view,
  onView,
  onSwitchDoctor,
}: {
  doctor: DoctorAccount
  unreadCount: number
  waitingCount: number
  inRoomCount: number
  unclaimedCount: number
  seenTodayCount: number
  attentionCount: number
  now: number
  view: "live" | "patient"
  onView: (view: "live" | "patient") => void
  onSwitchDoctor?: (doctorId: string) => void
}) {
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const allDoctors = useMemo(() => getAllDoctorAccounts(), [])
  const stats: { label: string ;value: number ;tone: string }[] = [
    { label: "Waiting", value: waitingCount, tone: waitingCount ? "text-[#C2410C]" : "text-[#0F172A]" },
    { label: "In room", value: inRoomCount, tone: inRoomCount ? "text-[#1D4ED8]" : "text-[#0F172A]" },
    { label: "Unclaimed", value: unclaimedCount, tone: unclaimedCount ? "text-[#B45309]" : "text-[#0F172A]" },
    { label: "Seen today", value: seenTodayCount, tone: "text-[#0F172A]" },
  ]

  return (
    <div className="bg-white border-b border-[#DDE2EC] px-4 lg:px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-3 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1B4FD8] to-[#1E3A8A] text-white flex items-center justify-center text-[15px] font-bold shrink-0">
          {doctorInitials(doctor.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[15.5px] font-bold text-[#0F172A] leading-tight truncate">{doctor.name}</h1>
            <select
              value={doctor.id}
              onChange={(e) => onSwitchDoctor?.(e.target.value)}
              aria-label="Switch Doctor Workspace"
              className="h-6 px-2 text-[11px] font-semibold border border-[#CBD5E1] rounded-none bg-[#F8FAFC] hover:bg-white text-[#1E293B] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1B4FD8]"
            >
              <optgroup label="Switch Doctor Workspace">
                {allDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.specialty} · {doc.room})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="text-[12px] text-[#64748B] truncate mt-0.5">
            {doctor.specialty} · {doctor.room} · {doctor.qualification}
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-stretch divide-x divide-[#EEF1F6] rounded-none border border-[#EEF1F6] bg-[#F8FAFC]">
        {stats.map((st) => (
          <div key={st.label} className="px-3 py-1.5 text-center min-w-[70px]">
            <div className={`text-[16px] font-bold leading-none tabular-nums ${st.tone}`}>{st.value}</div>
            <div className="text-[10.5px] text-[#64748B] mt-1">{st.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <div className="flex p-0.5 rounded-none bg-[#F1F5F9]" role="tablist" aria-label="Workspace view">
          {[
            { key: "live" as const, label: "Live board", badge: attentionCount },
            { key: "patient" as const, label: "Patient", badge: 0 },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={view === option.key}
              onClick={() => onView(option.key)}
              className={`h-8 px-3 text-[12.5px] font-semibold rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${
                view === option.key
                  ? "bg-white text-[#1B4FD8] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-[#64748B] hover:text-[#334155]"
              }`}
            >
              {option.key === "live" && <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />}
              {option.label}
              {option.badge > 0 && (
                <span className="text-[10px] font-bold bg-[#FEE2E2] text-[#B91C1C] px-1.5 rounded-full">{option.badge}</span>
              )}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <span className="h-8 px-2.5 rounded-none bg-[#EFF6FF] text-[#1D4ED8] text-[12px] font-semibold inline-flex items-center gap-1.5" title="New appointments you have not opened yet">
            <Icon.Bell className="w-3.5 h-3.5" /> {unreadCount} new
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsLeaveModalOpen(true)}
          className="h-8 px-3 text-[12.5px] font-semibold rounded-none border border-[#DDE2EC] bg-white text-[#334155] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 cursor-pointer"
          title="Apply for clinical or personal leave"
        >
          <Icon.Calendar className="w-3.5 h-3.5 text-[#64748B]" /> Apply leave
        </button>
        <div className="hidden sm:block text-right pl-1">
          <div className="text-[13px] font-semibold text-[#0F172A] tabular-nums leading-tight">
            {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-[10.5px] text-[#94A3B8]">
            {new Date(now).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>
      </div>

      {isLeaveModalOpen && (
        <ApplyLeaveModal
          isOpen={isLeaveModalOpen}
          onClose={() => setIsLeaveModalOpen(false)}
          loggedInStaffId={doctor.staffId}
          loggedInStaffName={doctor.name}
          isSelfService={true}
        />
      )}
    </div>
  )
}

// ── Inbox ────────────────────────────────────────────────────────────────────

/** Where the patient physically is, in the doctor's terms. */
function queueState(status: DoctorNotification["status"]): { label: string ;className: string } | null {
  switch (status) {
    case "Doctor Assigned":
      return { label: "With the nurse · vitals pending", className: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]" }
    case "In Queue":
    case "Vitals Recorded":
    case "Awaiting Consultation":
      return { label: "Ready for you", className: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]" }
    case "Under Consultation":
      return { label: "In your room", className: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]" }
    default:
      return null
  }
}

function PatientInbox({
  notifications,
  unassigned,
  finished,
  onClaim,
  selectedEncounterId,
  tab,
  onTab,
  notice,
  onDismissNotice,
  onSelect,
  onMarkAllRead,
  now,
}: {
  notifications: DoctorNotification[]
  unassigned: DoctorNotification[]
  finished: DoctorNotification[]
  onClaim: (notification: DoctorNotification) => void
  selectedEncounterId: string | null
  tab: InboxTab
  onTab: (tab: InboxTab) => void
  notice: { ok: boolean ;text: string } | null
  onDismissNotice: () => void
  onSelect: (notification: DoctorNotification) => void
  onMarkAllRead: () => void
  now: number
}) {
  const [query, setQuery] = useState("")
  const lists: Record<InboxTab, DoctorNotification[]> = { queue: notifications, unclaimed: unassigned, finished }
  const q = query.trim().toLowerCase()
  const shown = lists[tab].filter(
    (n) =>
      !q ||
      n.patientName.toLowerCase().includes(q) ||
      n.umr.toLowerCase().includes(q) ||
      (n.opNumber || "").toLowerCase().includes(q) ||
      (n.chiefComplaint || "").toLowerCase().includes(q),
  )
  const empty: Record<InboxTab, { title: string ;text: string }> = {
    queue: { title: "No patients waiting", text: "Patients appointed to you appear here the moment reception assigns them." },
    unclaimed: { title: "Nobody unclaimed", text: "Patients in your specialty who have no doctor yet appear here for you to take." },
    finished: { title: "No finished visits", text: "Visits you complete are kept here for reference." },
  }

  return (
    <aside className="w-full lg:w-[340px] max-h-[50dvh] lg:max-h-none flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#DDE2EC] flex flex-col min-h-0">
      <div className="px-3.5 pt-3 pb-2.5 border-b border-[#EEF1F6] space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-[#0F172A]">My patients</h2>
          {tab === "queue" && notifications.some((n) => !n.read) && (
            <button type="button" onClick={onMarkAllRead} className="text-[11.5px] text-[#1B4FD8] font-medium hover:underline cursor-pointer">
              Mark all read
            </button>
          )}
        </div>
        <div className="relative">
          <Icon.Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, UMR, OP no. or complaint"
            aria-label="Search my patients"
            className="w-full h-9 pl-8 pr-3 rounded-none border border-[#DDE2EC] bg-[#F8FAFC] text-[12.5px] focus:outline-none focus:border-[#1B4FD8] focus:bg-white"
          />
        </div>
        <div className="flex p-1 rounded-none bg-[#F1F5F9] gap-1" role="tablist" aria-label="Patient lists">
          {(
            [
              ["queue", "My queue", notifications.length, notifications.length > 0 ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-slate-200 text-slate-600"],
              ["unclaimed", "Unclaimed", unassigned.length, unassigned.length > 0 ? "bg-[#FEF3C7] text-[#B45309]" : "bg-slate-200 text-slate-600"],
              ["finished", "Finished", finished.length, "bg-slate-200 text-slate-600"],
            ] as const
          ).map(([key, label, count, badgeCls]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={`flex-1 h-8 rounded-none text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                tab === key
                  ? "bg-white text-[#0F172A] shadow-sm ring-1 ring-black/5"
                  : "text-[#64748B] hover:text-[#334155] hover:bg-white/50"
              }`}
            >
              {label}
              <span className={`text-[10.5px] tabular-nums px-1.5 py-0.5 rounded-full font-bold ${badgeCls}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`mx-3 mt-3 rounded-none border px-3 py-2 text-[12px] flex items-start gap-2 ${
            notice.ok ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]" : "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]"
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={onDismissNotice} className="font-bold cursor-pointer" aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users size={24} className="mx-auto text-[#CBD5E1]" />
            <p className="text-[12.5px] font-semibold text-[#334155] mt-2">{q ? `No match for "${query.trim()}"` : empty[tab].title}</p>
            <p className="text-[11.5px] text-[#94A3B8] mt-1">{q ? "Try a UMR, an OP number or part of the name." : empty[tab].text}</p>
          </div>
        ) : (
          shown.map((notification) => {
            const active = notification.encounterId === selectedEncounterId
            const state = tab === "finished" ? null : queueState(notification.status)
            const waitingMinutes = Math.max(0, Math.floor((now - (Date.parse(notification.arrivedAt) || now)) / 60000))
            const inRoom = notification.status === "Under Consultation"
            const isOverdue = tab === "queue" && waitingMinutes >= LONG_WAIT_MINUTES
            const isReady = notification.status === "In Queue" || notification.status === "Vitals Recorded" || notification.status === "Awaiting Consultation"
            const isNurse = notification.status === "Doctor Assigned"

            const avatarBg = inRoom
              ? gradient(TONE.blue)
              : isOverdue
              ? gradient(TONE.red)
              : isReady
              ? gradient(TONE.green)
              : isNurse
              ? gradient(TONE.amber)
              : tab === "unclaimed"
              ? gradient(TONE.orange)
              : gradient(TONE.slate)

            const card = (
              <>
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white shadow-xs"
                    style={{ background: avatarBg }}
                  >
                    {notification.patientName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {!notification.read && tab === "queue" && (
                        <span className="w-2 h-2 rounded-full bg-[#2563EB] ring-2 ring-blue-300 animate-pulse shrink-0" aria-label="New" />
                      )}
                      <span className="font-bold text-[13px] text-[#0F172A] truncate">{notification.patientName}</span>
                      <span
                        className={`ml-auto text-[10px] font-semibold px-1.5 py-[1px] rounded-none border shrink-0 ${
                          notification.isNewPatient ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]" : "bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]"
                        }`}
                      >
                        {notification.isNewPatient ? "New" : "Revisit"}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#64748B] mt-0.5 truncate">
                      {[notification.umr, notification.opNumber, `${notification.age || "—"}${notification.sex?.[0] || ""}`, tab !== "queue" ? notification.dept : ""].filter(Boolean).join(" · ")}
                    </div>
                    <p className="text-[12px] text-[#334155] mt-1 line-clamp-2">{notification.chiefComplaint || "No chief complaint recorded"}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {inRoom ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE] animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                          In Room
                        </span>
                      ) : state ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${state.className}`}>
                          {state.label}
                        </span>
                      ) : null}

                      {tab === "finished" && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                          {notification.status}
                        </span>
                      )}

                      <span
                        className={`ml-auto text-[10.5px] tabular-nums ${
                          tab === "finished"
                            ? "text-[#64748B] bg-slate-100 px-2 py-0.5 rounded-full"
                            : inRoom
                            ? "bg-[#DBEAFE] text-[#1D4ED8] font-bold px-2 py-0.5 rounded-full border border-[#BFDBFE]"
                            : isOverdue
                            ? "bg-[#FEE2E2] text-[#B91C1C] font-bold px-2 py-0.5 rounded-full border border-[#FECACA] animate-pulse"
                            : isReady
                            ? "bg-[#DCFCE7] text-[#15803D] font-medium px-2 py-0.5 rounded-full border border-[#BBF7D0]"
                            : "bg-[#F8FAFC] text-[#475569] font-medium px-2 py-0.5 rounded-full border border-[#E2E8F0]"
                        }`}
                      >
                        {tab === "finished"
                          ? Number.isFinite(Date.parse(notification.arrivedAt))
                            ? new Date(notification.arrivedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                            : ""
                          : `${inRoom ? "in room" : "wait"} ${formatElapsed(notification.arrivedAt, now)}`}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )
            return tab === "unclaimed" ? (
              <div key={notification.id} className="rounded-none border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7]/20 p-3 shadow-xs">
                {card}
                <button
                  type="button"
                  onClick={() => onClaim(notification)}
                  className="mt-2.5 w-full h-8 rounded-none bg-[#1B4FD8] text-white text-[12px] font-semibold hover:bg-[#1740B4] cursor-pointer shadow-xs transition-colors"
                >
                  Take patient
                </button>
              </div>
            ) : (
              <button
                key={notification.id}
                type="button"
                onClick={() => onSelect(notification)}
                className={`w-full text-left rounded-none border px-3 py-2.5 transition-all cursor-pointer border-l-[4px] ${
                  active
                    ? "bg-white border-[#2563EB] ring-2 ring-[#2563EB]/30 shadow-sm"
                    : inRoom
                    ? "border-l-[#2563EB] bg-[#F0F7FF] border-[#BFDBFE] hover:shadow-xs"
                    : isOverdue
                    ? "border-l-[#DC2626] bg-[#FEF2F2]/40 border-[#FECACA] hover:shadow-xs"
                    : isReady
                    ? "border-l-[#16A34A] bg-[#F0FDF4]/30 border-[#BBF7D0] hover:shadow-xs"
                    : isNurse
                    ? "border-l-[#D97706] bg-[#FFFBEB]/30 border-[#FDE68A] hover:shadow-xs"
                    : "border-l-[#64748B] bg-white border-[#EEF1F6] hover:border-[#DDE2EC] hover:bg-[#FAFBFD]"
                }`}
              >
                {card}
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

function EmptyWorkspace({
  unreadCount,
  onBackToBoard,
}: {
  unreadCount: number
  onBackToBoard: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto rounded-none bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center">
          <Icon.Stethoscope className="w-6 h-6 text-[#1B4FD8]" />
        </div>
        <h2 className="mt-4 text-[16px] font-semibold text-[#0F172A]">Select a patient to begin</h2>
        <p className="text-[12.5px] text-[#64748B] mt-1.5">
          {unreadCount > 0
            ? `${unreadCount} new appointment${unreadCount === 1 ? "" : "s"} waiting on the left. Opening one shows their symptoms, plus an admit card if they are new or their full history if they have been here before.`
            : "Patients appointed to you appear in the list on the left, with their symptoms attached."}
        </p>
        <button
          type="button"
          onClick={onBackToBoard}
          className="mt-4 h-9 px-4 rounded-none border border-[#DDE2EC] bg-white text-[12.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
        >
          Back to the live board
        </button>
      </div>
    </div>
  )
}

// ── Patient banner ───────────────────────────────────────────────────────────

function PatientBanner({
  notification,
  consultation,
  onStartConsultation,
}: {
  notification: DoctorNotification
  consultation?: ConsultationRecord
  onStartConsultation: () => void
}) {
  const dispatched = consultation?.dispatch === "Dispatched"
  return (
    <div className="bg-white border-b border-[#DDE2EC] px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[14px] text-white shadow-sm flex-shrink-0"
          style={{ background: gradient(TONE.blue) }}
        >
          {notification.patientName
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-bold text-gray-900 truncate">
              {notification.patientName}
            </h2>
            <span
              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${
                notification.isNewPatient
                  ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                  : "bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]"
              }`}
            >
              {notification.isNewPatient ? "New Patient" : "Revisit"}
            </span>
            <StatusBadge status={notification.status} />
          </div>
          <div className="text-[11.5px] text-[#64748B] font-mono flex items-center gap-2 flex-wrap mt-0.5">
            <span>
              {notification.umr} · {notification.opNumber} · {notification.age}{" "}
              yrs {notification.sex} · {notification.dept} · {notification.room}
            </span>
            {notification.vitals && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                  <span className="font-bold text-[#2563EB]">BP:</span>
                  {notification.vitals.bp || "--"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#FFF1F2] text-[#9F1239] px-2 py-0.5 rounded border border-[#FECDD3]">
                  <span className="font-bold text-[#E11D48]">Pulse:</span>
                  {notification.vitals.pulse || "--"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#ECFDF5] text-[#065F46] px-2 py-0.5 rounded border border-[#A7F3D0]">
                  <span className="font-bold text-[#059669]">SpO₂:</span>
                  {notification.vitals.spo2 || "--"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {dispatched ? (
          <span className="text-[12px] font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-1.5 rounded-full">
            Orders sent
          </span>
        ) : notification.status === "Under Consultation" ? (
          <span className="text-[12px] font-semibold text-[#1B4FD8] bg-[#EFF6FF] border border-[#BFDBFE] px-3 py-1.5 rounded-full">
            In consultation
          </span>
        ) : (
          <Btn variant="primary" size="sm" onClick={onStartConsultation}>
            Start Consultation
          </Btn>
        )}
      </div>
    </div>
  )
}

// ── Tab 1: patient context ───────────────────────────────────────────────────

function PatientContextPanel({
  notification,
  context,
  labOrders,
  onProceed,
  hideProceedButton = false,
}: {
  notification: DoctorNotification
  context: NonNullable<ReturnType<typeof DoctorPortalDatabase.getPatientContext>>
  labOrders: ReturnType<typeof LabOrderDatabase.getOrdersForPatient>
  onProceed: () => void
  hideProceedButton?: boolean
}) {
  const { patient, previousVisits, consultations, isNewPatient } = context

  return (
    <div className="space-y-4 w-full">
      <section className="bg-white border border-[#DDE2EC] rounded">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-[#DDE2EC] flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-gray-900">
              {isNewPatient ? "New Patient Admit Card" : "Patient Record"}
            </h3>
            <span className="text-[11px] text-[#94A3B8]">
              {isNewPatient
                ? "First visit on record"
                : `${previousVisits.length} previous visit(s)`}
            </span>
          </div>
          {!hideProceedButton && (
            <Btn
              variant="primary"
              size="sm"
              onClick={onProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-all"
            >
              ⚡ Start Consultation →
            </Btn>
          )}
        </div>

        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4">
          {[
            { label: "Name", value: notification.patientName },
            { label: "UMR (permanent)", value: notification.umr },
            { label: "OP Number", value: notification.opNumber },
            { label: "Queue token", value: notification.token || "--" },
            {
              label: "Age / Sex",
              value: `${notification.age} yrs · ${notification.sex}`,
            },
            {
              label: "Blood group",
              value: patient?.bloodGroup || "Not recorded",
            },
            { label: "Phone", value: notification.phone || "Not recorded" },
            { label: "Department", value: notification.dept },
            { label: "Address", value: patient?.address || "Not recorded" },
            {
              label: "Registered on",
              value: patient
                ? new Date(patient.createdAt).toLocaleDateString()
                : "--",
            },
          ].map((field) => (
            <div key={field.label}>
              <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold">
                {field.label}
              </div>
              <div className="text-[12.5px] text-gray-900 font-medium break-words">
                {field.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-[#DDE2EC] rounded">
        <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold text-gray-900">
            Presenting complaint &amp; symptoms
          </h3>
          <span className="text-[10.5px] text-[#94A3B8]">
            Recorded by reception at booking
          </span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-gray-800">
            {notification.chiefComplaint ||
              "No chief complaint recorded at registration."}
          </p>
          {notification.symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {notification.symptoms.map((symptom) => (
                <span
                  key={symptom}
                  className="text-[11.5px] bg-[#FEF3C7] text-[#92400E] px-2 py-1 rounded border border-[#FDE68A]"
                >
                  {symptom}
                </span>
              ))}
            </div>
          )}
          {notification.aiReasoning && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3">
              <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold mb-1">
                Triage reasoning · {notification.aiConfidence}% confidence
              </div>
              <p className="text-[12px] text-[#475569]">
                {notification.aiReasoning}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#F1F5F9] mt-1">
            <h4 className="text-[12px] font-bold text-gray-900">
              Baseline vitals
            </h4>
            <span className="text-[10.5px] text-[#94A3B8]">
              {notification.vitalsBy
                ? `Recorded by ${notification.vitalsBy}${
                    notification.vitalsAt ? ` at ${notification.vitalsAt}` : ""
                  }`
                : notification.vitals && (notification.vitals.bp || notification.vitals.pulse || notification.vitals.spo2)
                  ? "Recorded at registration"
                  : "Not taken yet — patient is still with the OP nurse"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "BP", value: notification.vitals?.bp },
              { label: "Pulse", value: notification.vitals?.pulse },
              { label: "Temp", value: notification.vitals?.temp },
              { label: "SpO₂", value: notification.vitals?.spo2 },
              { label: "Weight", value: notification.vitals?.weight },
            ].map((vital) => (
              <div
                key={vital.label}
                className="bg-[#F8FAFC] border border-[#E2E8F0] rounded px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[#94A3B8] font-bold">
                  {vital.label}
                </div>
                <div className="text-[13px] font-mono font-semibold text-gray-900">
                  {vital.value || "--"}
                </div>
              </div>
            ))}
          </div>

          {/* What the OP nurse wrote when handing the patient over. It is the
              only thing anyone has observed about this patient before the doctor
              walks in, so it belongs next to the readings rather than nowhere. */}
          {notification.vitals?.notes?.trim() && (
            <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-[#0369A1] font-bold">
                Nurse note
              </div>
              <p className="text-[12.5px] text-[#0C4A6E] mt-0.5">
                {notification.vitals.notes}
              </p>
            </div>
          )}
        </div>
      </section>

      {isNewPatient ? (
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-4">
          <h3 className="text-[13px] font-bold text-[#15803D]">
            First visit — no prior history
          </h3>
          <p className="text-[12.5px] text-[#166534] mt-1">
            This patient has no earlier encounter on record, so there is no
            previous consultation, medication or investigation to review. The
            admit card above is everything on file.
          </p>
        </div>
      ) : (
        <>
          <section className="bg-white border border-[#DDE2EC] rounded">
            <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
              <h3 className="text-[13px] font-bold text-gray-900">
                Previous consultations
              </h3>
            </div>
            {previousVisits.length === 0 ? (
              // Registered as a returning patient, but nothing earlier is on this
              // system -- say so rather than showing an empty box.
              <p className="px-4 py-4 text-[12px] text-[#64748B] italic">
                No previous OP consultation records are available for this patient.
              </p>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {previousVisits.map((visit) => (
                  <PreviousVisitRow key={visit.id} visit={visit} />
                ))}
              </div>
            )}
          </section>

          {consultations.length > 0 && (
            <section className="bg-white border border-[#DDE2EC] rounded">
              <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
                <h3 className="text-[13px] font-bold text-gray-900">
                  Prescription sheets on file
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {consultations.map((record) => (
                  <div
                    key={record.id}
                    className="border border-[#E2E8F0] rounded overflow-hidden"
                  >
                    {(record.whiteboardImage ||
                      record.uploadedPrescription?.dataUrl) && (
                      <img
                        src={
                          record.whiteboardImage ||
                          record.uploadedPrescription?.dataUrl
                        }
                        alt={`Prescription sheet from ${new Date(record.createdAt).toLocaleDateString()}`}
                        className="w-full h-32 object-cover object-top bg-white"
                      />
                    )}
                    <div className="px-3 py-2">
                      <div className="text-[11.5px] font-semibold text-gray-900">
                        {new Date(record.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        {record.doctorName} · {record.medications.length}{" "}
                        medicine(s) · {record.labTests.length} test(s)
                      </div>
                      {record.video && (
                        <div className="text-[10.5px] text-[#94A3B8] mt-0.5">
                          🎥 {record.video.name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {labOrders.length > 0 && (
        <section className="bg-white border border-[#DDE2EC] rounded">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
            <h3 className="text-[13px] font-bold text-gray-900">
              Laboratory orders &amp; results
            </h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {labOrders.map((order) => (
              <div key={order.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[12px] font-semibold text-gray-900 font-mono">
                    {order.id}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={order.status} />
                    <span
                      className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
                        order.billing.status === "Paid"
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : "bg-[#FEF3C7] text-[#92400E]"
                      }`}
                    >
                      {order.billing.status === "Paid"
                        ? "Billed"
                        : "Awaiting payment"}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 space-y-1">
                  {order.tests.map((test) => (
                    <div
                      key={test.id}
                      className="flex items-center justify-between text-[11.5px]"
                    >
                      <span className="text-[#475569]">{test.name}</span>
                      <span
                        className={`font-mono ${
                          test.flag === "Critical"
                            ? "text-[#B91C1C] font-bold"
                            : "text-gray-800"
                        }`}
                      >
                        {test.result
                          ? `${test.result} ${test.resultUnit || ""}`
                          : test.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!hideProceedButton && (
        <div className="flex justify-between items-center pt-2 border-t border-[#E2E8F0]">
          <div className="text-[11.5px] text-[#64748B]">
            Read the history and vitals before you call the patient in.
          </div>
          <Btn variant="primary" size="sm" onClick={onProceed}>
            Start the consultation →
          </Btn>
        </div>
      )}
    </div>
  )
}

function PreviousVisitRow({ visit }: { visit: DBOPEncounter }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-semibold text-gray-900">
              {visit.diagnosis || "No diagnosis recorded"}
            </span>
            {visit.icd10 && (
              <span className="text-[10.5px] font-mono bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded">
                {visit.icd10}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">
            {new Date(
              visit.timestamps?.arrival || visit.registrationTime,
            ).toLocaleDateString()}{" "}
            · {visit.opNumber} · {visit.assignedDoctor || "Unassigned"} ·{" "}
            {visit.dept}
          </div>
        </div>
        <span className="text-[11px] text-[#1B4FD8] font-semibold flex-shrink-0">
          {open ? "Hide" : "View"}
        </span>
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3">
            <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold mb-1.5">
              Medication then
            </div>
            {visit.prescription?.length ? (
              <ul className="space-y-1">
                {visit.prescription.map((med, index) => (
                  <li key={index} className="text-[11.5px] text-[#334155]">
                    <span className="font-semibold">{med.medicine}</span>
                    <span className="text-[#64748B]">
                      {[med.dosage, med.frequency, med.duration]
                        .filter(Boolean)
                        .join(" · ")}
                      {med.instructions ? ` — ${med.instructions}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-[#94A3B8]">None recorded</p>
            )}
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3">
            <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold mb-1.5">
              Investigations then
            </div>
            {visit.investigations?.length ? (
              <ul className="space-y-1">
                {visit.investigations.map((test) => (
                  <li key={test} className="text-[11.5px] text-[#334155]">
                    {test}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-[#94A3B8]">None recorded</p>
            )}
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3">
            <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold mb-1.5">
              Assessment &amp; advice
            </div>
            <p className="text-[11.5px] text-[#334155]">
              {visit.assessment || "No assessment recorded"}
            </p>
            {visit.advice && (
              <p className="text-[11.5px] text-[#64748B] mt-1.5">
                {visit.advice}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: consultation sheet ────────────────────────────────────────────────

// ── Step 2: the spoken consultation ──────────────────────────────────────────

/** How long a silence ends one speaker's turn and starts another's. */
const TURN_GAP_MS = 1500

const SPEAKER_STYLE: Record<Speaker, {
  label: string
  chip: string
  bubble: string
  rail: string
  initial: string
}> = {
  doctor: {
    label: "Doctor",
    chip: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]",
    bubble: "bg-[#F8FAFF] border-[#DBEAFE]",
    rail: "bg-[#1B4FD8]",
    initial: "D",
  },
  patient: {
    label: "Patient",
    chip: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]",
    bubble: "bg-[#F8FEF9] border-[#DCFCE7]",
    rail: "bg-[#16A34A]",
    initial: "P",
  },
}

/**
 * Records the consultation, separates the two voices, and summarises the note.
 *
 * Speaker separation is the hard part and no browser API does it, so this works
 * three ways at once, strongest first:
 *
 *  1. The doctor holds the Doctor/Patient switch while someone is talking. That
 *     is a human in the room, and it overrides everything else.
 *  2. In Auto, each utterance is scored on how it is phrased -- who it is about,
 *     whether it asks or answers -- and a pause longer than `TURN_GAP_MS` is
 *     taken as the floor changing hands.
 *  3. Whatever is left, the doctor fixes with one click on the turn. Low-
 *     confidence turns are marked, so the ones worth checking are obvious
 *     instead of hidden in a wall of text.
 *
 * Nothing here becomes a medicine or an investigation. This step captures what
 * was said; step 3 captures what was prescribed.
 */
function ConsultationConversation({
  notification,
  doctor,
  turns,
  durationSeconds,
  summary,
  onTurns,
  onBack,
  onProceed,
}: {
  notification: DoctorNotification
  doctor: DoctorAccount
  turns: TranscriptTurn[]
  durationSeconds: number
  summary: ConsultationNoteSummary | null
  onTurns: (turns: TranscriptTurn[], durationSeconds?: number) => void
  onBack: () => void
  onProceed: () => void
}) {
  const [sttEngine, setSttEngine] = useState<"whisper" | "webspeech">("whisper")
  const [whisperLanguage, setWhisperLanguage] = useState("auto")
  const [transcribingWhisper, setTranscribingWhisper] = useState(false)
  const [listening, setListening] = useState(false)
  const [speakerMode, setSpeakerMode] = useState<"auto" | Speaker>("auto")
  const [speakerViewFilter, setSpeakerViewFilter] = useState<"all" | "doctor" | "patient">("all")
  const [language, setLanguage] =
    useState<"auto" | "en-IN" | "te-IN" | "hi-IN" | "ta-IN" | "kn-IN">("auto")
  const [elapsed, setElapsed] = useState(durationSeconds)
  const [interim, setInterim] = useState("")
  const [micError, setMicError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [noteView, setNoteView] = useState<"note" | "soap">("note")

  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const startedAtRef = useRef<number>(0)
  const lastUtteranceAtRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // These are read inside the recogniser's callbacks, which are installed once
  // and would otherwise close over the state as it was when recording started.
  // The live transcript as the recogniser's callbacks see it. They are installed
  // once, so they cannot read `turns` directly. The ref runs ahead of props
  // during a burst of speech (see `commitUtterance`) and is re-synced the moment
  // the parent changes the list for any other reason -- a speaker corrected, a
  // turn removed, another patient opened -- so a correction is never undone by
  // the next thing the patient says.
  const turnsRef = useRef(turns)
  const emittedRef = useRef(turns)
  if (turns !== emittedRef.current) {
    turnsRef.current = turns
    emittedRef.current = turns
  }
  const speakerModeRef = useRef(speakerMode)
  speakerModeRef.current = speakerMode

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      try {
        recognitionRef.current?.stop()
      } catch {
        /* already stopped */
      }
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop()
        }
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (listening)
      transcriptEndRef.current?.scrollIntoView({ block: "nearest" })
  }, [turns.length, interim, listening])

  const speechSupported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    )

  const commitUtterance = useCallback(
    (rawText: string) => {
      const now = Date.now()
      const sinceLast = now - (lastUtteranceAtRef.current || now)
      const previous = turnsRef.current[turnsRef.current.length - 1]

      const previousSpeaker =
        sinceLast > TURN_GAP_MS ? undefined : previous?.speaker

      const turn = buildTurn(rawText, {
        atMs: now - startedAtRef.current,
        previousSpeaker,
        forcedSpeaker:
          speakerModeRef.current === "auto" ? null : speakerModeRef.current,
      })
      if (!turn) return

      lastUtteranceAtRef.current = now
      const next = [...turnsRef.current, turn]
      turnsRef.current = next
      emittedRef.current = next
      onTurns(next, Math.round((now - startedAtRef.current) / 1000))
    },
    [onTurns],
  )

  // ── Whisper Large V3 Audio Transcription ──────────────────────────────────

  const processAudioWithWhisper = async (audioBlob: Blob, recordingDuration: number) => {
    setTranscribingWhisper(true)
    setMicError(null)
    try {
      const rawText = await transcribeAudioWithWhisper(audioBlob, whisperLanguage)
      if (!rawText.trim()) {
        setMicError("Whisper STT processed the audio but found no spoken text.")
        return
      }
      const parsedTurns = diarizeTranscript(rawText)
      if (parsedTurns.length > 0) {
        const updatedTurns = [...turnsRef.current, ...parsedTurns]
        turnsRef.current = updatedTurns
        emittedRef.current = updatedTurns
        onTurns(updatedTurns, elapsed + recordingDuration)
      } else {
        setMicError("Speech recognized by Whisper, but could not split into consultation turns.")
      }
    } catch (err: any) {
      setMicError(err.message || "Failed to transcribe audio recording with Whisper Large V3.")
    } finally {
      setTranscribingWhisper(false)
    }
  }

  const stopWhisper = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    const finalDuration = Math.round((Date.now() - startedAtRef.current) / 1000)
    setListening(false)

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || "audio/webm",
        })
        processAudioWithWhisper(audioBlob, finalDuration)
      }
      mediaRecorderRef.current.stop()
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [elapsed, whisperLanguage])

  const startWhisper = useCallback(async () => {
    setMicError(null)
    audioChunksRef.current = []
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicError("Microphone access blocked. Please allow microphone permission or upload an audio file.")
      return
    }

    startedAtRef.current = Date.now()
    const recorder = new MediaRecorder(streamRef.current)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data)
      }
    }

    recorder.start(1000)
    setListening(true)
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
  }, [])

  const handleAudioFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMicError(null)
    setTranscribingWhisper(true)
    try {
      await processAudioWithWhisper(file, 0)
    } catch (err: any) {
      setMicError(err.message || "Error reading audio file.")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // ── WebSpeech Browser Native Handlers ─────────────────────────────────────

  const stopWebSpeech = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setInterim("")
    setListening(false)
  }, [])

  const startWebSpeech = useCallback(async () => {
    setMicError(null)
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setMicError(
        "This browser has no WebSpeech recognition. Switch engine to Whisper Large V3 AI above.",
      )
      setPasteOpen(true)
      return
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
    } catch {
      setMicError(
        "The microphone is blocked. Allow it for this site, or paste the conversation below.",
      )
      setPasteOpen(true)
      return
    }

    startedAtRef.current = Date.now() - elapsed * 1000
    lastUtteranceAtRef.current = 0

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language === "auto" ? "en-IN" : language

    recognition.onresult = (event: any) => {
      let pending = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) commitUtterance(result[0].transcript)
        else pending += result[0].transcript
      }
      setInterim(pending)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        try {
          recognition.start()
        } catch {
          /* browser refused restart */
        }
      }
    }
    recognition.onerror = (event: any) => {
      if (
        event?.error === "not-allowed" ||
        event?.error === "service-not-allowed"
      ) {
        setMicError(
          "Speech recognition was denied. Paste or type the conversation below instead.",
        )
        stopWebSpeech()
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
  }, [commitUtterance, elapsed, language, stopWebSpeech])

  const toggleRecording = () => {
    if (listening) {
      if (sttEngine === "whisper") stopWhisper()
      else stopWebSpeech()
    } else {
      if (sttEngine === "whisper") startWhisper()
      else startWebSpeech()
    }
  }

  const stop = sttEngine === "whisper" ? stopWhisper : stopWebSpeech
  const start = sttEngine === "whisper" ? startWhisper : startWebSpeech


  const reassign = (turnId: string, speaker: Speaker) =>
    onTurns(setTurnSpeaker(turns, turnId, speaker))
  const removeTurn = (turnId: string) =>
    onTurns(turns.filter((t) => t.id !== turnId))

  const importPasted = () => {
    const parsed = diarizeTranscript(pasteText)
    if (!parsed.length) return
    onTurns([...turns, ...parsed])
    setPasteText("")
    setPasteOpen(false)
  }

  const clearAll = () => {
    stop()
    setElapsed(0)
    onTurns([], 0)
  }

  const copyNote = () => {
    if (!summary) return
    const note = [
      `Consultation note -- ${notification.patientName} (${notification.umr}), ${doctor.name}`,
      `Recorded ${summary.durationFormatted} · ${summary.language}`,
      "",
      `Chief complaint: ${summary.chiefComplaint || "--"}`,
      `S: ${summary.soap.subjective}`,
      `O: ${summary.soap.objective}`,
      `A: ${summary.soap.assessment}`,
      `P: ${summary.soap.plan}`,
      "",
      "Transcript",
      formatTranscript(turns),
    ].join("\n")
    navigator.clipboard?.writeText(note)
  }

  const uncertain = turns.filter(
    (t) => t.basis !== "manual" && t.basis !== "label" && t.confidence < 0.5,
  ).length
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Engine Selection Bar */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#334155] uppercase tracking-wide text-[10.5px]">STT Engine:</span>
          <div className="inline-flex border border-[#CBD5E1] p-0.5 bg-white">
            <button
              type="button"
              onClick={() => {
                if (listening) stop()
                setSttEngine("whisper")
              }}
              className={`px-3 py-1 font-semibold text-[11.5px] transition-colors cursor-pointer ${
                sttEngine === "whisper"
                  ? "bg-[#1B4FD8] text-white"
                  : "text-[#475569] hover:bg-[#F1F5F9]"
              }`}
            >
              Whisper Large V3 AI (99+ Languages)
            </button>
            <button
              type="button"
              onClick={() => {
                if (listening) stop()
                setSttEngine("webspeech")
              }}
              className={`px-3 py-1 font-semibold text-[11.5px] transition-colors cursor-pointer ${
                sttEngine === "webspeech"
                  ? "bg-[#1B4FD8] text-white"
                  : "text-[#475569] hover:bg-[#F1F5F9]"
              }`}
            >
              Live Browser WebSpeech
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#64748B] text-[11.5px]">
          {sttEngine === "whisper" ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#1E40AF]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Neural Multilingual STT (Whisper Large V3) Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#475569]">
              Live Browser Recognition
            </span>
          )}
        </div>
      </div>

      {/* Recorder */}
      <section className="bg-white border border-[#E2E8F0] rounded-none shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={transcribingWhisper}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                listening
                  ? "bg-[#DC2626] text-white shadow-lg shadow-red-200"
                  : "bg-[#1B4FD8] text-white hover:bg-[#1E40AF] shadow-md"
              }`}
              aria-label={listening ? "Stop recording" : "Start recording"}
            >
              {listening && (
                <span className="absolute inset-0 rounded-full bg-[#DC2626] animate-ping opacity-40" />
              )}
              <span className="relative text-lg">{listening ? "■" : "●"}</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[14px] font-bold text-[#0F172A]">
                  Consultation conversation
                </h2>
                <span className="text-[9.5px] font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-1.5 py-0.5 rounded-none">
                  {sttEngine === "whisper" ? "Whisper Large V3 STT" : "Browser WebSpeech"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#64748B] mt-0.5">
                {transcribingWhisper
                  ? "Transcribing audio with Whisper Large V3 AI..."
                  : listening
                    ? sttEngine === "whisper"
                      ? "Recording audio... Click stop when finished to transcribe with Whisper Large V3."
                      : "Listening live... speak normally, speakers are separated as you talk."
                    : turns.length
                      ? `${turns.length} exchanges captured. Correct any speaker below.`
                      : "Record what is said in the room or upload an audio clip. Medicines and tests come from step 3."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              className={`font-mono text-[15px] font-bold tabular-nums px-3 py-1.5 rounded-none border ${
                listening
                  ? "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]"
                  : "bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]"
              }`}
            >
              {mmss}
            </div>

            {sttEngine === "whisper" ? (
              <select
                value={whisperLanguage}
                onChange={(event) => setWhisperLanguage(event.target.value)}
                disabled={listening || transcribingWhisper}
                title="Whisper Large V3 language model setting"
                className="text-[12px] font-semibold border border-[#E2E8F0] rounded-none px-2.5 py-2 bg-white text-[#334155] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:border-[#1B4FD8]"
              >
                {WHISPER_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as typeof language)
                }
                disabled={listening}
                title="Recognition language."
                className="text-[12px] font-semibold border border-[#E2E8F0] rounded-none px-2.5 py-2 bg-white text-[#334155] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:border-[#1B4FD8]"
              >
                <option value="auto">Auto (English-India)</option>
                <option value="en-IN">English</option>
                <option value="te-IN">తెలుగు Telugu</option>
                <option value="hi-IN">हिंदी Hindi</option>
                <option value="ta-IN">தமிழ் Tamil</option>
                <option value="kn-IN">ಕನ್ನಡ Kannada</option>
              </select>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAudioFileUpload}
              accept="audio/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={listening || transcribingWhisper}
              title="Upload an audio recording file (.mp3, .wav, .m4a, .webm)"
              className="text-[12px] font-semibold border border-[#E2E8F0] rounded-none px-3 py-2 bg-white text-[#334155] hover:bg-[#F8FAFC] cursor-pointer disabled:opacity-50"
            >
              Upload Audio
            </button>

            <button
              type="button"
              onClick={() => setPasteOpen((open) => !open)}
              className="text-[12px] font-semibold border border-[#E2E8F0] rounded-none px-3 py-2 bg-white text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
            >
              Type / paste
            </button>


            {turns.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[12px] font-semibold border border-[#FECACA] rounded-none px-3 py-2 bg-white text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Who is speaking */}
        <div className="px-5 py-3 bg-[#FAFBFC] border-t border-[#F1F5F9] flex flex-wrap items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Who is speaking
          </span>
          <div className="flex bg-white border border-[#E2E8F0] rounded-none p-0.5">
            {[
              {
                key: "auto" as const,
                label: "Auto-detect",
                hint: "Separate the two voices from how each sentence is phrased and where the pauses fall",
              },
              {
                key: "doctor" as const,
                label: "Doctor",
                hint: "Everything captured is mine until I switch back",
              },
              {
                key: "patient" as const,
                label: "Patient",
                hint: "Everything captured is the patient's until I switch back",
              },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setSpeakerMode(option.key)
                  if (option.key === "doctor") setSpeakerViewFilter("doctor")
                  else if (option.key === "patient") setSpeakerViewFilter("patient")
                  else setSpeakerViewFilter("all")
                }}
                title={option.hint}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-none transition-colors cursor-pointer ${
                  speakerMode === option.key
                    ? option.key === "patient"
                      ? "bg-[#16A34A] text-white"
                      : "bg-[#1B4FD8] text-white"
                    : "text-[#64748B] hover:text-[#334155]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-[#64748B] flex-1 min-w-[220px]">
            {speakerMode === "auto"
              ? "Auto-detect is a good first pass, not a transcriptionist — anything it is unsure of is flagged for you below."
              : `Holding ${SPEAKER_STYLE[speakerMode].label} — every utterance is attributed to ${
                  speakerMode === "doctor" ? "you" : "the patient"
                } until you switch.`}
          </p>
          {!speechSupported && (
            <span className="text-[11px] font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-1 rounded">
              No speech recognition in this browser
            </span>
          )}
        </div>

        {micError && (
          <div className="px-5 py-2.5 bg-[#FFFBEB] border-t border-[#FDE68A] text-[12px] text-[#92400E]">
            {micError}
          </div>
        )}

        {pasteOpen && (
          <div className="px-5 py-4 border-t border-[#F1F5F9] bg-white space-y-2">
            <label className="text-[11.5px] font-semibold text-[#334155]">
              One line per utterance. Prefix with{" "}
              <span className="font-mono">Doctor:</span> or{" "}
              <span className="font-mono">Patient:</span> to set the speaker;
              anything unlabelled is separated the same way a recording is.
            </label>
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={5}
              placeholder={
                "Since when has this been going on?\nI have had fever since 3 days, doctor.\nAny cough or throat pain?\nMy throat pain is there from yesterday."
              }
              className="w-full border border-[#E2E8F0] rounded-none p-3 text-[12.5px] leading-relaxed focus:outline-none focus:border-[#1B4FD8] text-[#0F172A]"
            />
            <div className="flex gap-2">
              <Btn
                variant="primary"
                size="sm"
                onClick={importPasted}
                disabled={!pasteText.trim()}
              >
                Add to the conversation
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                onClick={() => setPasteOpen(false)}
              >
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Transcript */}
        <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-none shadow-sm flex flex-col min-h-[420px]">
          <header className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-bold text-[#0F172A]">
                Separated transcript
              </h3>
              
              {/* Filter view tabs */}
              <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded-none p-0.5">
                <button
                  type="button"
                  onClick={() => setSpeakerViewFilter("all")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-colors cursor-pointer ${
                    speakerViewFilter === "all"
                      ? "bg-white text-[#0F172A] shadow-2xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  All ({turns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSpeakerViewFilter("doctor")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-colors cursor-pointer ${
                    speakerViewFilter === "doctor"
                      ? "bg-[#1B4FD8] text-white shadow-2xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  Doctor ({turns.filter((t) => t.speaker === "doctor").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSpeakerViewFilter("patient")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-colors cursor-pointer ${
                    speakerViewFilter === "patient"
                      ? "bg-[#16A34A] text-white shadow-2xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  Patient ({turns.filter((t) => t.speaker === "patient").length})
                </button>
              </div>
            </div>
            {uncertain > 0 && (
              <span className="text-[11px] font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded">
                {uncertain} to check
              </span>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[560px]">
            {(() => {
              const displayedTurns = turns.filter((turn) => {
                if (speakerViewFilter === "doctor") return turn.speaker === "doctor"
                if (speakerViewFilter === "patient") return turn.speaker === "patient"
                return true
              })

              if (displayedTurns.length === 0 && !interim) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 px-6">
                    <div className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-3">
                      <Icon.Stethoscope className="w-5 h-5 text-[#94A3B8]" />
                    </div>
                    <p className="text-[13px] font-semibold text-[#334155]">
                      {speakerViewFilter === "doctor"
                        ? "No doctor conversation recorded yet"
                        : speakerViewFilter === "patient"
                          ? "No patient conversation recorded yet"
                          : "Nothing recorded yet"}
                    </p>
                    <p className="text-[11.5px] text-[#94A3B8] mt-1 max-w-xs">
                      {speakerViewFilter !== "all"
                        ? `Click "All" or speak as ${speakerViewFilter === "doctor" ? "Doctor" : "Patient"} to view conversation.`
                        : "Press record and talk to the patient as you normally would. Each utterance lands here under whoever said it."}
                    </p>
                  </div>
                )
              }

              return (
                <>
                  {displayedTurns.map((turn) => {
                    const style = SPEAKER_STYLE[turn.speaker]
                    const shaky =
                      turn.basis !== "manual" &&
                      turn.basis !== "label" &&
                      turn.confidence < 0.5
                    const other: Speaker =
                      turn.speaker === "doctor" ? "patient" : "doctor"
                    const mine = turn.speaker === "doctor"
                    return (
                      <article
                        key={turn.id}
                        className={`flex gap-2.5 ${
                          mine ? "" : "flex-row-reverse"
                        }`}
                      >
                      <div
                        className={`w-7 h-7 rounded-full ${style.rail} text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}
                        title={style.label}
                      >
                        {style.initial}
                      </div>

                      <div
                        className={`min-w-0 max-w-[85%] ${
                          mine ? "" : "flex flex-col items-end"
                        }`}
                      >
                        <div
                          className={`border rounded-none px-3 py-2 ${style.bubble} ${
                            mine ? "" : ""
                          } ${
                            shaky
                              ? "border-dashed border-[#FCD34D] bg-[#FFFDF5]"
                              : ""
                          }`}
                        >
                          <p className="text-[12.5px] text-[#0F172A] leading-relaxed break-words text-left">
                            {turn.text}
                          </p>
                        </div>

                        <div
                          className={`flex items-center gap-2 mt-1 flex-wrap ${
                            mine ? "" : "justify-end"
                          }`}
                        >
                          <span
                            className={`text-[9.5px] font-bold uppercase tracking-wide border px-1.5 rounded-none ${style.chip}`}
                          >
                            {style.label}
                          </span>

                          {/* How sure the attribution is, as a bar rather than a
                              bare number -- a doctor scanning the column needs to
                              spot the shaky ones, not read percentages. */}
                          {turn.basis === "manual" || turn.basis === "label" ? (
                            <span className="text-[9.5px] text-[#15803D] font-semibold">
                              ✓ confirmed
                            </span>
                          ) : (
                            <span
                              className="flex items-center gap-1"
                              title={turn.cues.join(", ") || "turn order only"}
                            >
                              <span className="w-8 h-1 rounded-full bg-[#E2E8F0] overflow-hidden">
                                <span
                                  className={`block h-full rounded-full ${
                                    shaky ? "bg-[#F59E0B]" : "bg-[#94A3B8]"
                                  }`}
                                  style={{
                                    width: `${Math.round(turn.confidence * 100)}%`,
                                  }}
                                />
                              </span>
                              <span
                                className={`text-[9.5px] font-mono ${
                                  shaky
                                    ? "text-[#B45309] font-bold"
                                    : "text-[#94A3B8]"
                                }`}
                              >
                                {turn.cues[0] || "turn order"}
                              </span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => reassign(turn.id, other)}
                            title={`Move this line to the ${other}`}
                            className="text-[10px] font-semibold text-[#64748B] hover:text-[#1B4FD8] border border-[#E2E8F0] hover:border-[#1B4FD8] rounded px-1.5 py-px transition-colors cursor-pointer"
                          >
                            → {SPEAKER_STYLE[other].label}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTurn(turn.id)}
                            title="Remove this line"
                            className="text-[10px] font-semibold text-[#94A3B8] hover:text-[#B91C1C] cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}

                {interim && (
                  <div className="flex gap-2.5 opacity-60">
                    <div className="w-7 h-7 rounded-full bg-[#CBD5E1] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      …
                    </div>
                    <p className="text-[12.5px] text-[#64748B] italic border border-dashed border-[#E2E8F0] rounded-none px-3 py-2">
                      {interim}
                    </p>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )
          })()}
          </div>
        </section>

        {/* Clinical note */}
        <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-none shadow-sm sticky top-4">
          <header className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold text-[#0F172A]">
              Doctor's note
            </h3>
            <div className="flex items-center gap-2">
              {summary && (
                <button
                  type="button"
                  onClick={copyNote}
                  title="Copy the note and the transcript"
                  className="text-[11px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
                >
                  Copy
                </button>
              )}
              <div className="flex bg-[#F1F5F9] rounded-none p-0.5">
                {[
                  { key: "note" as const, label: "Note" },
                  { key: "soap" as const, label: "SOAP" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setNoteView(option.key)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-colors cursor-pointer ${
                      noteView === option.key
                        ? "bg-white text-[#1B4FD8] shadow-sm"
                        : "text-[#64748B]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {!summary ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[12.5px] font-semibold text-[#334155]">
                The note writes itself
              </p>
              <p className="text-[11.5px] text-[#94A3B8] mt-1">
                Complaint, history, examination and advice are pulled from the
                conversation as it is recorded.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                <span className="font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-1.5 py-0.5 rounded">
                  {summary.language}
                </span>
                <span className="font-mono bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                  {summary.durationFormatted}
                </span>
                <span className="font-mono bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] px-1.5 py-0.5 rounded">
                  {Math.round(summary.patientShare * 100)}% patient
                </span>
              </div>

              {noteView === "note" ? (
                <div className="space-y-2.5">
                  <NoteField
                    label="Chief complaint"
                    value={summary.chiefComplaint}
                    emphasis
                  />
                  {summary.symptoms.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        Symptoms heard
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {summary.symptoms.map((symptom) => (
                          <span
                            key={symptom.term}
                            title={symptom.saidAs}
                            className="text-[11px] font-semibold bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] px-2 py-0.5 rounded-full"
                          >
                            {symptom.term}
                            {symptom.onset && (
                              <span className="font-normal text-[#16A34A]">
                                {" "}
                                · {symptom.onset}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <NoteField
                    label="History"
                    value={summary.historyOfPresentIllness}
                  />
                  <NoteField
                    label="Examination spoken"
                    value={summary.doctorObservations.join(" ")}
                  />
                  <NoteField
                    label="Impression"
                    value={summary.assessment}
                    emphasis
                  />
                  <NoteField
                    label="Advice given"
                    value={summary.advice.join(" ")}
                  />
                  <NoteField label="Follow-up" value={summary.followUp} />
                </div>
              ) : (
                <div className="space-y-2">
                  {([
                    ["S", "Subjective", summary.soap.subjective],
                    ["O", "Objective", summary.soap.objective],
                    ["A", "Assessment", summary.soap.assessment],
                    ["P", "Plan", summary.soap.plan],
                  ] as const).map(([letter, label, text]) => (
                    <div key={letter} className="flex gap-2.5">
                      <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {letter}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                          {label}
                        </div>
                        <p className="text-[12px] text-[#334155] leading-relaxed">
                          {text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* What the conversation did not cover. Prompts, not scores. */}
              {Object.values(summary.coverage).some((covered) => !covered) && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-none p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">
                    Not heard in this conversation
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {([
                      ["symptoms", "the complaint"],
                      ["onset", "how long for"],
                      ["examination", "examination findings"],
                      ["advice", "advice"],
                      ["followUp", "follow-up"],
                    ] as const)
                      .filter(([key]) => !summary.coverage[key])
                      .map(([key, label]) => (
                        <span
                          key={key}
                          className="text-[11px] text-[#92400E] bg-white border border-[#FDE68A] px-2 py-0.5 rounded-full"
                        >
                          {label}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-none p-2.5 leading-relaxed">
                <span className="font-semibold text-[#334155]">
                  Nothing here is an order.
                </span>{" "}
                Medicines and investigations are read from the prescription
                sheet in the next step — never from this recording.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-none px-4 py-3 shadow-sm">
        <Btn variant="outline" size="sm" onClick={onBack}>
          ← Patient history
        </Btn>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-[#64748B]">
            {turns.length
              ? "Note saved to the patient's record."
              : "You can prescribe without recording."}
          </span>
          <Btn variant="primary" size="sm" onClick={onProceed}>
            Prescription sheet →
          </Btn>
        </div>
      </div>
    </div>
  )
}

function NoteField({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </span>
      <p
        className={`text-[12px] leading-relaxed mt-0.5 ${
          value
            ? emphasis
              ? "text-[#0F172A] font-semibold"
              : "text-[#334155]"
            : "text-[#CBD5E1] italic"
        }`}
      >
        {value || "not stated"}
      </p>
    </div>
  )
}

const CLINICAL_ORDER_SETS = [
  {
    id: "uri",
    title: "Acute URI / Bronchitis",
    icon: "🫁",
    text: "Diagnosis: Acute Upper Respiratory Tract Infection\n\nRx:\nAzithromycin 500mg OD 3 days after food\nParacetamol 650mg TDS 5 days\nCetirizine 10mg HS 5 days\n\nInvestigations:\nComplete Blood Count (CBC)\nChest X-Ray PA View\n\nAdvice: Steam inhalation twice daily, warm saline gargles.",
  },
  {
    id: "diabetes",
    title: "T2 Diabetes Review",
    icon: "🩸",
    text: "Diagnosis: Type 2 Diabetes Mellitus - Routine Review\n\nRx:\nMetformin 500mg BD after meals\nTeneligliptin 20mg OD before breakfast\n\nInvestigations:\nHbA1c\nFasting Blood Sugar (FBS)\nPostprandial Blood Sugar (PPBS)\nLipid Profile\nSerum Creatinine\n\nAdvice: 30 min daily walk, low glycemic diet, daily BP log.",
  },
  {
    id: "htn",
    title: "Essential Hypertension",
    icon: "🫀",
    text: "Diagnosis: Primary Essential Hypertension\n\nRx:\nTelmisartan 40mg OD morning\nAmlodipine 5mg OD\n\nInvestigations:\nECG 12-Lead\nSerum Electrolytes\nKidney Function Test (KFT)\n\nAdvice: Low salt diet (<3g/day), monitor BP twice weekly.",
  },
  {
    id: "gastro",
    title: "Acute Gastroenteritis",
    icon: "🧪",
    text: "Diagnosis: Acute Gastroenteritis with Mild Dehydration\n\nRx:\nORS Sachet 1 packet in 1L drinking water\nOfloxacin + Ornidazole BD 3 days\nDicyclomine 20mg SOS for abdominal pain\nOndansetron 4mg SOS for nausea\n\nInvestigations:\nStool Routine & Microscopy\nSerum Electrolytes\n\nAdvice: Soft diet (rice/curd/toast), maintain oral hydration.",
  },
]

const QUICK_MED_CHIPS = [
  "Paracetamol 650mg TDS 5 days",
  "Amoxicillin 500mg TDS 5 days",
  "Azithromycin 500mg OD 3 days",
  "Pantoprazole 40mg OD before food",
  "Cetirizine 10mg HS 5 days",
  "Metformin 500mg BD after food",
  "Ondansetron 4mg SOS",
  "Ibuprofen 400mg BD after food",
]

const QUICK_LAB_CHIPS = [
  "Complete Blood Count (CBC)",
  "Liver Function Test (LFT)",
  "Kidney Function Test (KFT)",
  "HbA1c (Glycated Hemoglobin)",
  "Chest X-Ray PA View",
  "ECG 12-Lead",
  "Lipid Profile",
  "Urine Routine & Microscopy",
]

/**
 * Step 3: the prescription sheet -- the one and only source of orders.
 *
 * Whatever the doctor produces here (typed, drawn, or a photo of the paper they
 * just handed over) is digitised into medicines and investigations. An upload
 * runs the split the moment the file lands, because handing over the sheet *is*
 * the instruction; making the doctor press a second button to make an uploaded
 * prescription count was the difference between "it works" and "nothing
 * happened".
 */
function PrescriptionSheetStep({
  notification,
  doctor,
  voiceSummary,
  aiStatus,
  sheetMode,
  onSheetMode,
  sheetText,
  onSheetText,
  whiteboardImage,
  onWhiteboardCommit,
  uploadedRx,
  onRemoveUploadedRx,
  video,
  persistedVideo,
  rxInputRef,
  videoInputRef,
  onRxUpload,
  onVideoSelected,
  onRemoveVideo,
  splitting,
  split,
  medications,
  labTests,
  onRunSplit,
  onDigitiseAndSend,
  onBackToVoice,
  onStartFresh,
}: {
  notification: DoctorNotification
  doctor: DoctorAccount
  voiceSummary: ConsultationNoteSummary | null
  aiStatus: { online: boolean ;reason?: string } | null
  sheetMode: SheetMode
  onSheetMode: (mode: SheetMode) => void
  sheetText: string
  onSheetText: (value: string) => void
  whiteboardImage: string | null
  onWhiteboardCommit: (dataUrl: string | null) => void
  uploadedRx: UploadedRx | null
  onRemoveUploadedRx: () => void
  video: { name: string ;size: number ;type: string ;objectUrl: string } | null
  persistedVideo?: ConsultationRecord["video"]
  rxInputRef: React.RefObject<HTMLInputElement | null>
  videoInputRef: React.RefObject<HTMLInputElement | null>
  onRxUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onVideoSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveVideo: () => void
  splitting: boolean
  split: PrescriptionSplit | null
  medications: ParsedMedication[]
  labTests: ParsedLabTest[]
  onRunSplit: (options?: { whiteboardDataUrl?: string; source?: SheetMode }) => void
  onDigitiseAndSend: () => void
  onBackToVoice: () => void
  onStartFresh: () => void
}) {
  const hasVideo = !!video || !!persistedVideo
  const [videoOpen, setVideoOpen] = useState(hasVideo)
  const [dragging, setDragging] = useState(false)

  const modes: { key: SheetMode ;label: string ;hint: string ;glyph: string }[] = [
    {
      key: "type",
      label: "Type it",
      hint: "Keyboard, with order sets",
      glyph: "⌨",
    },
    { key: "write", label: "Write it", hint: "Pen or stylus", glyph: "✎" },
    {
      key: "upload",
      label: "Upload it",
      hint: "Photo or scan of the paper",
      glyph: "⇪",
    },
  ]

  const append = (line: string) =>
    onSheetText(sheetText ? `${sheetText}\n${line}` : line)

  const ready =
    (sheetMode === "type" && sheetText.trim().length > 0) ||
    (sheetMode === "write" && !!whiteboardImage) ||
    (sheetMode === "upload" && !!uploadedRx)

  const orderCount = medications.length + labTests.length

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file || !rxInputRef.current) return
    // Route a dropped file through the same handler as the picker, so the
    // upload, the persistence and the split all behave identically.
    const transfer = new DataTransfer()
    transfer.items.add(file)
    rxInputRef.current.files = transfer.files
    rxInputRef.current.dispatchEvent(new Event("change", { bubbles: true }))
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Context carried forward from the conversation */}
      {voiceSummary?.chiefComplaint && (
        <div className="bg-[#F8FAFF] border border-[#DBEAFE] rounded-none px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
            From the consultation
          </span>
          <span className="text-[12.5px] text-[#0F172A] font-semibold">
            {voiceSummary.chiefComplaint}
          </span>
          {voiceSummary.assessment && (
            <span className="text-[12px] text-[#475569]">
              · {voiceSummary.assessment}
            </span>
          )}
          <button
            type="button"
            onClick={onBackToVoice}
            className="ml-auto text-[11.5px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
          >
            Open the note
          </button>
        </div>
      )}

      {aiStatus && !aiStatus.online && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-none px-4 py-3 flex flex-wrap items-start gap-x-3 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#92400E] mt-0.5">
            Reading offline
          </span>
          <p className="text-[12px] text-[#92400E] flex-1 min-w-[260px] leading-relaxed">
            A photographed prescription cannot be read right now (
            {aiStatus.reason}) — there is no OCR in the browser. Type the sheet
            instead and it will still be split into medicines and
            investigations.
          </p>
          <button
            type="button"
            onClick={() => onSheetMode("type")}
            className="text-[11.5px] font-semibold text-[#92400E] underline cursor-pointer"
          >
            Switch to typing
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* The sheet */}
        <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-none shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-bold text-[#0F172A]">
                Prescription sheet
              </h2>
              <p className="text-[11.5px] text-[#64748B] mt-0.5">
                {notification.patientName} · {notification.age}y{" "}
                {notification.sex} ·{" "}
                <span className="font-mono">{notification.umr}</span> ·{" "}
                {doctor.name}
              </p>
            </div>
          </header>

          {/* Three equal ways to produce the sheet. Cards rather than a toggle:
              the doctor picks a working method here, and uploading a photo of
              the paper they just signed is a first-class one, not a fallback. */}
          <div className="px-4 pt-3 grid grid-cols-3 gap-2">
            {modes.map((mode) => {
              const active = sheetMode === mode.key
              const filled =
                (mode.key === "type" && sheetText.trim().length > 0) ||
                (mode.key === "write" && !!whiteboardImage) ||
                (mode.key === "upload" && !!uploadedRx)
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => onSheetMode(mode.key)}
                  className={`relative text-left border rounded-none px-3 py-2.5 transition-all cursor-pointer ${
                    active
                      ? "border-[#1B4FD8] bg-[#F8FAFF] ring-1 ring-[#1B4FD8]/20"
                      : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[15px] leading-none ${
                        active ? "text-[#1B4FD8]" : "text-[#94A3B8]"
                      }`}
                    >
                      {mode.glyph}
                    </span>
                    <span
                      className={`text-[12.5px] font-bold ${
                        active ? "text-[#1B4FD8]" : "text-[#334155]"
                      }`}
                    >
                      {mode.label}
                    </span>
                    {filled && (
                      <span className="ml-auto text-[9px] font-bold text-[#15803D] bg-[#DCFCE7] px-1.5 rounded-full">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-[#94A3B8] mt-0.5">
                    {mode.hint}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="p-4 space-y-3">
            {sheetMode === "type" && (
              <>
                <textarea
                  value={sheetText}
                  onChange={(event) => onSheetText(event.target.value)}
                  rows={14}
                  spellCheck={false}
                  placeholder={
                    "Diagnosis: Acute pharyngitis\n\nRx:\nAzithromycin 500mg OD 3 days after food\nParacetamol 650mg TDS 5 days\n\nInvestigations:\nComplete Blood Count (CBC)\n\nAdvice: warm saline gargles, review in 5 days"
                  }
                  className="w-full border border-[#E2E8F0] rounded-none p-4 text-[13px] font-mono leading-relaxed focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/10 text-[#0F172A] bg-[#FCFCFD]"
                />

                <details className="group">
                  <summary className="text-[11.5px] font-semibold text-[#1B4FD8] cursor-pointer list-none select-none">
                    <span className="group-open:hidden">
                      + Order sets and quick lines
                    </span>
                    <span className="hidden group-open:inline">
                      − Hide order sets
                    </span>
                  </summary>
                  <div className="mt-2.5 space-y-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                        Order sets
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {CLINICAL_ORDER_SETS.map((set) => (
                          <button
                            key={set.id}
                            type="button"
                            onClick={() =>
                              onSheetText(
                                sheetText
                                  ? `${sheetText}\n\n${set.text}`
                                  : set.text,
                              )
                            }
                            className="text-[11.5px] font-semibold bg-white border border-[#E2E8F0] hover:border-[#1B4FD8] hover:text-[#1B4FD8] text-[#475569] px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                          >
                            {set.icon} {set.title}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                        Medicines
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_MED_CHIPS.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => append(chip)}
                            className="text-[11px] font-medium bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] hover:bg-[#DCFCE7] px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                        Investigations
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_LAB_CHIPS.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => append(chip)}
                            className="text-[11px] font-medium bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7] px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              </>
            )}

            {sheetMode === "write" && (
              <PrescriptionWhiteboard
                header={{
                  patientName: notification.patientName,
                  umr: notification.umr,
                  opNumber: notification.opNumber,
                  age: notification.age,
                  sex: notification.sex,
                  doctorName: doctor.name,
                  date: new Date().toLocaleDateString(),
                }}
                onCommit={onWhiteboardCommit}
                onDigitise={(dataUrl) => {
                  onWhiteboardCommit(dataUrl)
                  onRunSplit({ whiteboardDataUrl: dataUrl, source: "write" })
                }}
                isDigitising={splitting}
              />
            )}

            {sheetMode === "upload" && (
              <>
                <input
                  ref={rxInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  className="hidden"
                  onChange={onRxUpload}
                />
                {uploadedRx ? (
                  <div className="space-y-3">
                    {uploadedRx.kind === "document" ? (
                      <div className="border border-[#E2E8F0] rounded-none bg-[#F8FAFC] p-8 text-center">
                        <div className="text-3xl mb-2">📄</div>
                        <div className="text-[13px] font-bold text-[#334155]">
                          {uploadedRx.name}
                        </div>
                        <p className="text-[11.5px] text-[#64748B] mt-1">
                          A PDF cannot be previewed here, but it is attached to
                          the visit and was sent for reading.
                        </p>
                      </div>
                    ) : (
                      <img
                        src={uploadedRx.dataUrl}
                        alt={`Prescription for ${notification.patientName}`}
                        className="w-full max-h-[460px] object-contain bg-[#F8FAFC] border border-[#E2E8F0] rounded-none"
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-none px-3 py-2">
                      <span className="text-[#475569] font-medium truncate">
                        {uploadedRx.name} · {formatBytes(uploadedRx.size)}
                        {splitting && (
                          <span className="ml-2 text-[#1B4FD8] font-semibold">
                            reading…
                          </span>
                        )}
                      </span>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => onRunSplit()}
                          disabled={splitting}
                          className="text-[#1B4FD8] font-semibold hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          Read again
                        </button>
                        <button
                          type="button"
                          onClick={() => rxInputRef.current?.click()}
                          className="text-[#1B4FD8] font-semibold hover:underline cursor-pointer"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={onRemoveUploadedRx}
                          className="text-[#B91C1C] font-semibold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => rxInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className={`w-full border-2 border-dashed rounded-none p-12 text-center transition-colors cursor-pointer ${
                      dragging
                        ? "border-[#1B4FD8] bg-[#EFF6FF]"
                        : "border-[#CBD5E1] hover:border-[#1B4FD8] hover:bg-[#F8FAFF]"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-[#EFF6FF] flex items-center justify-center mx-auto mb-3">
                      <Icon.Plus className="w-5 h-5 text-[#1B4FD8]" />
                    </div>
                    <div className="text-[13.5px] font-bold text-[#334155]">
                      Drop the prescription here, or click to choose
                    </div>
                    <div className="text-[11.5px] text-[#94A3B8] mt-1">
                      JPG, PNG or PDF · it is read and split into medicines and
                      investigations straight away
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Optional video, kept below the sheet so it never competes with it */}
          <div className="border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => setVideoOpen((open) => !open)}
              className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-[#334155]">
                  Consultation video
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-wide bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] px-1.5 py-0.5 rounded-none">
                  Optional
                </span>
                {hasVideo && (
                  <span className="text-[10.5px] font-semibold text-[#15803D]">
                    attached
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#64748B] font-semibold">
                {videoOpen ? "Hide" : hasVideo ? "Show" : "Attach"}
              </span>
            </button>

            {videoOpen && (
              <div className="px-4 pb-4">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={onVideoSelected}
                />
                {video ? (
                  <div className="space-y-2">
                    <video
                      src={video.objectUrl}
                      controls
                      className="w-full max-h-72 bg-black rounded-none"
                    />
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-[#475569] font-medium truncate">
                        {video.name} · {formatBytes(video.size)}
                      </span>
                      <button
                        type="button"
                        onClick={onRemoveVideo}
                        className="text-[#B91C1C] font-semibold hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full border border-dashed border-[#CBD5E1] rounded-none p-4 text-center text-[12px] font-semibold text-[#475569] hover:border-[#1B4FD8] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    Upload a consultation video
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* What was read off the sheet */}
        <section className="xl:col-span-5 space-y-4 sticky top-4">
          <div className="bg-white border border-[#E2E8F0] rounded-none shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-bold text-[#0F172A]">
                  Read off the sheet
                </h3>
                {(medications.length > 0 || labTests.length > 0) && (
                  <span className="text-[10px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] px-2 py-0.5 rounded-full flex items-center gap-1">
                    ✓ Live Separated
                  </span>
                )}
              </div>
              {split && (
                <span
                  title="Which engine produced this split"
                  className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                    isAiEngine(split.engine)
                      ? "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                      : "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]"
                  }`}
                >
                  {ENGINE_LABELS[split.engine] || split.engine}
                </span>
              )}
            </header>

            <div className="p-4 space-y-3">
              {splitting && (
                <div className="flex items-center gap-2 text-[12px] text-[#1B4FD8] font-semibold">
                  <span className="w-3 h-3 rounded-full border-2 border-[#1B4FD8] border-t-transparent animate-spin" />
                  Digitising the sheet…
                </div>
              )}

              <OrderGroup
                tone="emerald"
                title="Medicines"
                destination="Pharmacy"
                count={medications.length}
                empty="Nothing recognised yet. Write or upload the sheet, then digitise it."
              >
                {medications.map((medication, index) => (
                  <li
                    key={index}
                    className="bg-white border border-[#DCFCE7] rounded-none px-2.5 py-2 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[12px] font-bold text-[#0F172A]">
                        {medication.name}
                      </span>
                      {medication.strength && (
                        <span className="text-[11.5px] text-[#64748B] ml-1">
                          {medication.strength}
                        </span>
                      )}
                      <div className="text-[10.5px] text-[#15803D] font-semibold mt-0.5">
                        {[
                          medication.frequency,
                          medication.duration,
                          medication.instructions,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "as directed"}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#F0FDF4] text-[#15803D] px-1.5 py-0.5 rounded-none flex-shrink-0">
                      ×{medication.quantity}
                    </span>
                  </li>
                ))}
              </OrderGroup>

              <OrderGroup
                tone="amber"
                title="Investigations"
                destination="Billing → Lab"
                count={labTests.length}
                empty="No investigations on this sheet."
              >
                {labTests.map((test, index) => (
                  <li
                    key={index}
                    className="bg-white border border-[#FDE68A] rounded-none px-2.5 py-2 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[12px] font-bold text-[#0F172A]">
                        {test.name}
                      </span>
                      <div className="text-[10.5px] text-[#92400E] font-semibold mt-0.5">
                        {test.category}
                        {test.urgency === "STAT" && (
                          <span className="text-[#DC2626]"> · STAT</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10.5px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-none flex-shrink-0">
                      Lab Order
                    </span>
                  </li>
                ))}
              </OrderGroup>

              {split?.diagnosis && (
                <div className="bg-[#F0FDF4] border border-[#DCFCE7] rounded-none p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#15803D] mb-0.5">
                    Provisional Diagnosis
                  </div>
                  <div className="text-[11.5px] font-semibold text-[#0F172A]">
                    {split.diagnosis}
                  </div>
                </div>
              )}

              {split?.advice && (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-none p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-0.5">
                    Patient Advice &amp; Follow-up
                  </div>
                  <div className="text-[11.5px] text-[#334155] leading-relaxed whitespace-pre-line">
                    {split.advice}
                  </div>
                </div>
              )}

              {split?.unclassified.length ? (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-none p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                    Could not be placed — file these by hand
                  </div>
                  <ul className="space-y-0.5">
                    {split.unclassified.map((line, index) => (
                      <li
                        key={index}
                        className="text-[11px] text-[#475569] font-mono"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="px-4 py-3 border-t border-[#F1F5F9] bg-[#FAFBFC] flex flex-wrap items-center gap-2">
              <Btn
                variant="outline"
                size="sm"
                onClick={() => onRunSplit()}
                disabled={!ready || splitting}
              >
                {splitting
                  ? "Digitising…"
                  : orderCount
                    ? "Digitise again"
                    : "Digitise the sheet"}
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                onClick={onDigitiseAndSend}
                disabled={!ready || splitting}
              >
                Review &amp; send →
              </Btn>
              <button
                type="button"
                onClick={onStartFresh}
                className="ml-auto text-[11.5px] font-semibold text-[#64748B] hover:text-[#B91C1C] cursor-pointer"
              >
                Clear sheet
              </button>
            </div>
          </div>

          {/* Where the two halves of this sheet go. Stated on the screen where
              the sheet is written, because the routing is the part of the
              workflow a doctor cannot see from their own desk -- particularly
              that an unpaid investigation never reaches the laboratory. */}
          <div className="bg-white border border-[#E2E8F0] rounded-none shadow-sm p-4">
            <h3 className="text-[12px] font-bold text-[#0F172A] mb-3">
              When you send this
            </h3>
            <ol className="space-y-3">
              {[
                {
                  tone: "#15803D",
                  bg: "#DCFCE7",
                  step: "Medicines",
                  to: "Pharmacy queue",
                  detail:
                    "Arrives with the patient's details and a one-line clinical summary. The pharmacist verifies an image-sourced sheet against the original.",
                  count: medications.length,
                },
                {
                  tone: "#92400E",
                  bg: "#FEF3C7",
                  step: "Investigations",
                  to: "Reception billing → Laboratory",
                  detail:
                    "The lab cannot see the order until reception collects payment — an unpaid investigation is invisible to them by design.",
                  count: labTests.length,
                },
                {
                  tone: "#1D4ED8",
                  bg: "#DBEAFE",
                  step: "This visit",
                  to: labTests.length
                    ? "Awaiting Billing"
                    : "Consultation Completed",
                  detail: labTests.length
                    ? "Closed out as awaiting billing, because there are investigations to pay for."
                    : "Closed out as completed — nothing to bill.",
                  count: null as number | null,
                },
              ].map((row) => (
                <li key={row.step} className="flex gap-2.5">
                  <span
                    className="w-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: row.tone }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11.5px] font-bold text-[#0F172A]">
                        {row.step}
                      </span>
                      {row.count !== null && (
                        <span
                          className="text-[9.5px] font-mono font-bold px-1.5 rounded-full"
                          style={{ backgroundColor: row.bg, color: row.tone }}
                        >
                          {row.count}
                        </span>
                      )}
                      <span className="text-[11px] text-[#64748B]">
                        → {row.to}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[#94A3B8] leading-relaxed mt-0.5">
                      {row.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Btn variant="outline" size="sm" onClick={onBackToVoice}>
              ← Consultation notes
            </Btn>
            <span className="text-[11px] text-[#94A3B8]">
              Every line is editable in the next step.
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

// "vision": the model read the sheet's image and split it in one pass
// (split_prescription_file in the backend) -- an AI split like "llm", not one
// of the weaker fallbacks the amber styling below warns about.
const isAiEngine = (engine: string) => engine === "llm" || engine === "vision"

const ENGINE_LABELS: Record<string, string> = {
  llm: "AI model",
  vision: "AI model",
  smart_ocr: "Smart OCR",
  heuristic: "Keyword match",
  browser: "Offline match",
  unavailable: "Not digitised",
  manual: "Entered by hand",
}

function OrderGroup({
  tone,
  title,
  destination,
  count,
  empty,
  children,
}: {
  tone: "emerald" | "amber"
  title: string
  destination: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  const palette =
    tone === "emerald"
      ? {
          head: "text-[#15803D]",
          pill: "bg-[#DCFCE7] text-[#15803D]",
          box: "bg-[#F8FEF9] border-[#DCFCE7]",
        }
      : {
          head: "text-[#92400E]",
          pill: "bg-[#FEF3C7] text-[#92400E]",
          box: "bg-[#FFFDF5] border-[#FDE68A]",
        }

  return (
    <div className={`border rounded-none p-3 ${palette.box}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-[12px] font-bold ${palette.head}`}>
            {title}
          </span>
          <span
            className={`text-[10px] font-mono font-bold px-1.5 rounded-full ${palette.pill}`}
          >
            {count}
          </span>
        </div>
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
          {destination}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-[#94A3B8] italic">{empty}</p>
      ) : (
        <ul className="space-y-1.5 max-h-52 overflow-y-auto">{children}</ul>
      )}
    </div>
  )
}

// ── Tab 3: review and dispatch ───────────────────────────────────────────────

function ReviewAndDispatch({
  split,
  splitting,
  diagnosis,
  advice,
  onDiagnosis,
  onAdvice,
  medications,
  labTests,
  onMedications,
  onLabTests,
  voiceSummary,
  consultation,
  canDispatch,
  pending,
  dispatchResult,
  onDispatch,
  onBackToSheet,
  onGoToCharges,
  onNextPatient,
}: {
  split: PrescriptionSplit | null
  splitting: boolean
  diagnosis: string
  advice: string
  onDiagnosis: (value: string) => void
  onAdvice: (value: string) => void
  medications: ParsedMedication[]
  labTests: ParsedLabTest[]
  onMedications: (value: ParsedMedication[]) => void
  onLabTests: (value: ParsedLabTest[]) => void
  voiceSummary: ConsultationNoteSummary | null
  consultation?: ConsultationRecord
  canDispatch: boolean
  pending: { pharmacy: boolean ;lab: boolean ;unreadSheet: boolean }
  dispatchResult: DispatchResult | null
  onDispatch: (targets?: DispatchTargets) => void
  onBackToSheet: () => void
  onGoToCharges?: () => void
  onNextPatient?: () => void
}) {
  const labTotal = labTests.reduce(
    (sum, test) => sum + priceForTest(test.name),
    0,
  )
  const alreadyDispatched = consultation?.dispatch === "Dispatched"
  // Each half locks on its own receipt. Medicines already at the pharmacy must
  // not be edited here -- the pharmacist is looking at them -- but investigations
  // that have not gone anywhere yet are still the doctor's to change.
  const pharmacySent = !!consultation?.prescriptionId
  const labSent = !!consultation?.labOrderId
  const medicineCount = medications.filter((m) => m.name.trim()).length
  const labTestCount = labTests.filter((t) => t.name.trim()).length

  if (!split && !medications.length && !labTests.length) {
    return (
      <div className="max-w-xl bg-white border border-[#DDE2EC] rounded p-8 text-center">
        <div className="text-3xl mb-2">🤖</div>
        <h3 className="text-[14px] font-bold text-gray-900">
          Nothing to review yet
        </h3>
        <p className="text-[12.5px] text-[#64748B] mt-1.5">
          {splitting
            ? "The sheet is being digitised…"
            : "Write, draw or upload the prescription sheet first — the medicines and the investigations read off it appear here for you to check."}
        </p>
        <div className="mt-4">
          <Btn variant="outline" size="sm" onClick={onBackToSheet}>
            ← Back to the prescription sheet
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full">
      {split && (
        <div
          className={`border rounded px-4 py-3 ${
            isAiEngine(split.engine)
              ? "bg-[#EFF6FF] border-[#BFDBFE]"
              : "bg-[#FFFBEB] border-[#FDE68A]"
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-bold text-gray-900">
              Extracted Items
            </span>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white border border-[#CBD5E1] text-[#475569]">
              {isAiEngine(split.engine)
                ? "AI Model"
                : split.engine === "smart_ocr"
                  ? "Smart OCR Engine"
                  : split.engine === "heuristic"
                    ? "Keyword match"
                    : split.engine === "browser"
                      ? "Offline keyword match"
                      : split.engine}
            </span>
          </div>
          <p className="text-[12px] text-[#475569] mt-1">
            {split.summary ||
              `${medications.length} medicine(s) and ${labTests.length} investigation(s) identified.`}
          </p>
          {split.engine !== "llm" && (
            <p className="text-[11.5px] text-[#92400E] mt-1">
              The language model was not reachable, so this split came from
              keyword matching. Check every row before dispatching.
            </p>
          )}
          {split.unclassified.length > 0 && (
            <div className="mt-2 bg-white border border-[#E2E8F0] rounded p-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-[#94A3B8] font-bold mb-1">
                Could not be placed — add these by hand
              </div>
              <ul className="space-y-0.5">
                {split.unclassified.map((line, index) => (
                  <li
                    key={index}
                    className="text-[11.5px] text-[#475569] font-mono"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <section className="bg-white border border-[#DDE2EC] rounded p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-1">
            Diagnosis
          </label>
          <input
            value={diagnosis}
            onChange={(event) => onDiagnosis(event.target.value)}
            disabled={alreadyDispatched}
            placeholder="Clinical diagnosis"
            className="w-full border border-[#DDE2EC] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B4FD8] disabled:bg-[#F8FAFC]"
          />
          {/* The note is offered, never written in: an impression pulled out of a
              recording is a suggestion, and the diagnosis on the chart is the
              doctor's. */}
          {!alreadyDispatched &&
            voiceSummary?.assessment &&
            voiceSummary.assessment !== diagnosis && (
              <button
                type="button"
                onClick={() => onDiagnosis(voiceSummary.assessment)}
                className="mt-1 text-[11px] text-[#1B4FD8] font-semibold hover:underline text-left cursor-pointer"
              >
                Use from the note: "{voiceSummary.assessment}"
              </button>
            )}
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-1">
            Advice
          </label>
          <textarea
            value={advice}
            onChange={(event) => onAdvice(event.target.value)}
            disabled={alreadyDispatched}
            rows={2}
            placeholder="General advice / follow-up instructions"
            className="w-full border border-[#DDE2EC] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B4FD8] disabled:bg-[#F8FAFC] resize-y"
          />
          {!alreadyDispatched &&
            voiceSummary &&
            (voiceSummary.advice.length > 0 || voiceSummary.followUp) && (
              <button
                type="button"
                onClick={() =>
                  onAdvice(
                    [...voiceSummary.advice, voiceSummary.followUp]
                      .filter(Boolean)
                      .join(" "),
                  )
                }
                className="mt-1 text-[11px] text-[#1B4FD8] font-semibold hover:underline text-left cursor-pointer"
              >
                Use the advice you gave in the room
              </button>
            )}
        </div>
      </section>

      {voiceSummary && (
        <section className="bg-white border border-[#DDE2EC] rounded">
          <header className="px-4 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[13px] font-bold text-gray-900">
              Consultation note
            </h3>
            <span className="text-[10.5px] font-mono text-[#94A3B8]">
              {voiceSummary.durationFormatted} · {voiceSummary.language} ·{" "}
              {voiceSummary.turnCount} exchanges
            </span>
          </header>
          <p className="px-4 py-3 text-[12.5px] text-[#475569] leading-relaxed">
            {voiceSummary.narrative}
          </p>
          <p className="px-4 pb-3 text-[11px] text-[#94A3B8]">
            Filed with this visit. The orders below come from the prescription
            sheet, not from the recording.
          </p>
        </section>
      )}

      {/* Medicines -> pharmacy */}
      <section className="bg-white border border-[#DDE2EC] rounded">
        <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-[13px] font-bold text-gray-900">
              💊 Medicines → Pharmacy
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Digitised and summarised with the patient's details for the
              pharmacist.
            </p>
          </div>
          {!pharmacySent && (
            <Btn
              variant="outline"
              size="xs"
              onClick={() =>
                onMedications([...medications, { ...EMPTY_MEDICATION }])
              }
            >
              + Add medicine
            </Btn>
          )}
        </div>

        {medications.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[#94A3B8]">
            No medicines on this sheet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F8FAFC] text-[10.5px] uppercase tracking-wide text-[#94A3B8]">
                <tr>
                  {[
                    "Medicine",
                    "Strength",
                    "Dose",
                    "Frequency",
                    "Duration",
                    "Qty",
                    "Instructions",
                    "",
                  ].map((header) => (
                    <th
                      key={header}
                      className="text-left font-bold px-3 py-2 whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {medications.map((medication, index) => {
                  const update = (
                    field: keyof ParsedMedication,
                    value: string | number,
                  ) =>
                    onMedications(
                      medications.map((m, i) =>
                        i === index ? { ...m, [field]: value } : m,
                      ),
                    )
                  const cell =
                    "w-full bg-transparent border border-transparent hover:border-[#DDE2EC] focus:border-[#1B4FD8] focus:bg-white rounded px-1.5 py-1 focus:outline-none disabled:hover:border-transparent"
                  return (
                    <tr key={index}>
                      <td className="px-3 py-1.5 min-w-[170px]">
                        <input
                          value={medication.name}
                          disabled={pharmacySent}
                          onChange={(e) => update("name", e.target.value)}
                          className={`${cell} font-semibold text-gray-900`}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-24">
                        <input
                          value={medication.strength}
                          disabled={pharmacySent}
                          onChange={(e) => update("strength", e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-24">
                        <input
                          value={medication.dosage}
                          disabled={pharmacySent}
                          onChange={(e) => update("dosage", e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-28">
                        <input
                          value={medication.frequency}
                          disabled={pharmacySent}
                          onChange={(e) => update("frequency", e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-24">
                        <input
                          value={medication.duration}
                          disabled={pharmacySent}
                          onChange={(e) => update("duration", e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-16">
                        <input
                          type="number"
                          min={1}
                          value={medication.quantity}
                          disabled={pharmacySent}
                          onChange={(e) =>
                            update(
                              "quantity",
                              Math.max(1, parseInt(e.target.value, 10) || 1),
                            )
                          }
                          className={`${cell} font-mono`}
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[150px]">
                        <input
                          value={medication.instructions}
                          disabled={pharmacySent}
                          onChange={(e) =>
                            update("instructions", e.target.value)
                          }
                          className={cell}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-8">
                        {!pharmacySent && (
                          <button
                            type="button"
                            onClick={() =>
                              onMedications(
                                medications.filter((_, i) => i !== index),
                              )
                            }
                            title="Remove"
                            className="text-[#B91C1C] font-bold px-1"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Lab tests -> reception billing -> lab */}
        <section className="bg-white border border-[#DDE2EC] rounded">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-[13px] font-bold text-gray-900">
                🧪 Lab tests → Reception billing → Laboratory
              </h3>
              <p className="text-[11px] text-[#64748B]">
                The lab sees these only once reception has collected payment.
              </p>
            </div>
            {!labSent && (
              <Btn
                variant="outline"
                size="xs"
                onClick={() =>
                  onLabTests([
                    ...labTests,
                    { name: "", category: "Pathology", urgency: "Routine" },
                  ])
                }
              >
                + Add test
              </Btn>
            )}
          </div>

          {labTests.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[#94A3B8]">
              No investigations on this sheet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8FAFC] text-[10.5px] uppercase tracking-wide text-[#94A3B8]">
                  <tr>
                    {["Investigation", "Category", "Urgency", "Order Status", ""].map(
                      (header) => (
                        <th
                          key={header}
                          className="text-left font-bold px-3 py-2 whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {labTests.map((test, index) => {
                    const update = (
                      field: keyof ParsedLabTest,
                      value: string,
                    ) =>
                      onLabTests(
                        labTests.map((t, i) =>
                          i === index ? { ...t, [field]: value } : t,
                        ),
                      )
                    const cell =
                      "w-full bg-transparent border border-transparent hover:border-[#DDE2EC] focus:border-[#1B4FD8] focus:bg-white rounded px-1.5 py-1 focus:outline-none"
                    return (
                      <tr key={index}>
                        <td className="px-3 py-1.5 min-w-[240px]">
                          <input
                            value={test.name}
                            disabled={labSent}
                            onChange={(e) => update("name", e.target.value)}
                            className={`${cell} font-semibold text-gray-900`}
                          />
                        </td>
                        <td className="px-3 py-1.5 w-36">
                          <select
                            value={test.category}
                            disabled={labSent}
                            onChange={(e) => update("category", e.target.value)}
                            className={`${cell} cursor-pointer`}
                          >
                            {[
                              "Pathology",
                              "Radiology",
                              "Cardiology",
                              "Other",
                              ].map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 w-28">
                          <select
                            value={test.urgency}
                            disabled={labSent}
                            onChange={(e) => update("urgency", e.target.value)}
                            className={`${cell} cursor-pointer ${
                              test.urgency === "STAT"
                                ? "text-[#DC2626] font-bold"
                                : ""
                            }`}
                          >
                            <option value="Routine">Routine</option>
                            <option value="STAT">STAT</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5 w-28 font-medium text-[#475569]">
                          <span className="text-[11px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded">
                            {labSent ? "Sent to Billing" : "Ready"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 w-8">
                          {!labSent && (
                            <button
                              type="button"
                              onClick={() =>
                                onLabTests(
                                  labTests.filter((_, i) => i !== index),
                                )
                              }
                              title="Remove"
                              className="text-[#B91C1C] font-bold px-1"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      {/* Dispatch -- each half on its own button, because a consultation often
          produces only one of them and neither should wait on the other. */}
      <section className="bg-white border border-[#DDE2EC] rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
          <h3 className="text-[13px] font-bold text-gray-900">
            Send the orders
          </h3>
          <p className="text-[11px] text-[#64748B]">
            Medicines and investigations travel separately. Send whichever this
            sheet has — or one now and the other after you have added it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F1F5F9]">
          <DispatchHalf
            title="Medicines"
            destination="Pharmacy"
            tone="emerald"
            count={medicineCount}
            sent={pharmacySent}
            sentLabel={consultation?.prescriptionId}
            pending={pending.pharmacy}
            emptyLabel={
              pending.unreadSheet
                ? "Sheet could not be read"
                : "No medicines on this sheet"
            }
            note={
              pending.unreadSheet
                ? "Nothing could be digitised. Sending puts the original image in front of the pharmacist to read."
                : undefined
            }
            onSend={() => onDispatch({ pharmacy: true, lab: false })}
          />
          <DispatchHalf
            title="Investigations"
            destination="Reception billing → Laboratory"
            tone="amber"
            count={labTestCount}
            sent={labSent}
            sentLabel={consultation?.labOrderId}
            pending={pending.lab}
            emptyLabel="No investigations on this sheet"
            note={
              labTestCount > 0 && !labSent
                ? "Sent to reception for patient lab billing."
                : undefined
            }
            onSend={() => onDispatch({ pharmacy: false, lab: true })}
          />
        </div>

        <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#DDE2EC] flex flex-wrap items-center justify-between gap-3">
          <Btn variant="outline" size="sm" onClick={onBackToSheet}>
            ← Prescription sheet
          </Btn>

          <div className="flex items-center gap-2 flex-wrap">
            {dispatchResult &&
              !dispatchResult.errors.length &&
              onNextPatient && (
                <Btn variant="outline" size="sm" onClick={onNextPatient}>
                  Call next patient →
                </Btn>
              )}
            {pending.pharmacy && pending.lab ? (
              <Btn variant="primary" size="sm" onClick={() => onDispatch()}>
                Send both →
              </Btn>
            ) : !canDispatch ? (
              // "All sent" and "nothing to send" look identical from the button's
              // point of view and mean opposite things to the doctor.
              pharmacySent || labSent ? (
                <span className="text-[12px] font-semibold text-[#15803D]">
                  ✓ Everything on this sheet has been sent
                </span>
              ) : (
                <span className="text-[12px] text-[#94A3B8]">
                  Nothing to send yet — add a medicine or an investigation
                  above.
                </span>
              )
            ) : null}
          </div>
        </div>
      </section>

      {dispatchResult && !dispatchResult.errors.length && (
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-4">
          <h3 className="text-[13px] font-bold text-[#15803D] mb-2">
            ✓{" "}
            {dispatchResult.sentToPharmacy && dispatchResult.sentToLab
              ? "Both halves sent"
              : dispatchResult.sentToPharmacy
                ? "Medicines sent to pharmacy"
                : "Investigations sent for billing"}
          </h3>
          <ul className="space-y-1 text-[12.5px] text-[#166534]">
            {dispatchResult.sentToPharmacy && dispatchResult.prescriptionId && (
              <li>
                <span className="font-mono font-bold">
                  {dispatchResult.prescriptionId}
                </span>{" "}
                — {dispatchResult.medicineCount} medicine(s) are in the pharmacy
                queue with the patient's details and a summary.
              </li>
            )}
            {dispatchResult.sentToLab && dispatchResult.labOrderId && (
              <li>
                <span className="font-mono font-bold">
                  {dispatchResult.labOrderId}
                </span>{" "}
                — {dispatchResult.labTestCount} investigation(s) sent to reception
                for patient lab billing. They reach the laboratory as soon as
                payment is collected at reception.
              </li>
            )}
            {pending.pharmacy && (
              <li className="text-[#92400E]">
                The medicines on this sheet have not been sent yet.
              </li>
            )}
            {pending.lab && (
              <li className="text-[#92400E]">
                The investigations on this sheet have not been sent yet.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/** One destination on the review screen: what it gets, whether it has it yet. */
function DispatchHalf({
  title,
  destination,
  tone,
  count,
  sent,
  sentLabel,
  pending,
  emptyLabel,
  note,
  onSend,
}: {
  title: string
  destination: string
  tone: "emerald" | "amber"
  count: number
  sent: boolean
  sentLabel?: string
  pending: boolean
  emptyLabel: string
  note?: string
  onSend: () => void
}) {
  const palette =
    tone === "emerald"
      ? { text: "text-[#15803D]", pill: "bg-[#DCFCE7] text-[#15803D]" }
      : { text: "text-[#92400E]", pill: "bg-[#FEF3C7] text-[#92400E]" }

  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[12.5px] font-bold ${palette.text}`}>
          {title}
        </span>
        <span
          className={`text-[10px] font-mono font-bold px-1.5 rounded-full ${palette.pill}`}
        >
          {count}
        </span>
        <span className="text-[11px] text-[#64748B]">→ {destination}</span>
      </div>

      {note && (
        <p className="text-[11px] text-[#64748B] leading-relaxed">{note}</p>
      )}

      {sent ? (
        <div className="flex items-center gap-2 mt-auto pt-1">
          <span className="text-[12px] font-semibold text-[#15803D]">
            ✓ Sent
          </span>
          {sentLabel && (
            <span className="text-[11px] font-mono text-[#64748B]">
              {sentLabel}
            </span>
          )}
        </div>
      ) : pending ? (
        <div className="mt-auto pt-1">
          <Btn variant="primary" size="sm" onClick={onSend}>
            Send to {destination.split(" → ")[0].toLowerCase()} →
          </Btn>
        </div>
      ) : (
        <p className="text-[11.5px] text-[#94A3B8] italic mt-auto pt-1">
          {emptyLabel}
        </p>
      )}
    </div>
  )
}

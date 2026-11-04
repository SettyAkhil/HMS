import React, { useEffect, useMemo, useState } from "react"
import type { Branding } from "../../lib/branding"
import { db, PLACEHOLDER_PHONE } from "../../services/db"
import { qrSvg } from "../../lib/qr"
import { fetchCardToken, lastCardLinkProblem, publicCardUrl, serverCardPatient, type CardLinkProblem } from "../patientRecord/patientRecord"

/**
 * The patient's OP card: one card for life, used at every department.
 *
 * It deliberately carries nothing visit-specific -- no department, doctor,
 * OP number or visit status -- because the same card comes back for every
 * visit to any department, and any of those would be wrong by the next one.
 * Its one scan point is a QR code holding the card's no-login link (an
 * unguessable per-card token, never the UMR): a phone camera or a 2-D desk
 * scanner opens the patient's complete record (see PatientRecordPage).
 *
 * Printed at ID-card size (CR80, 85.6 × 54 mm). The on-screen preview renders
 * the very same HTML in an iframe, so what reception sees is what prints.
 */

/** The patient code the card stands for (its UMR, normalised). */
export function cardBarcodeValue(umr: string): string {
  return (umr || "").trim().toUpperCase()
}

export type OpCardData = {
  patientName: string
  umr: string
  age?: number | string | null
  sex?: string | null
  bloodGroup?: string | null
  phone?: string | null
  /** When the UMR was issued. */
  registeredOn?: string | null
}

type CardBranding = Pick<Branding, "hospitalName" | "hospitalLogo" | "helpline">

/** Card data from the patient master, falling back to what the caller knows. */
export function opCardDataFor(umr: string, fallback: Partial<OpCardData> & { patientName: string }): OpCardData {
  const p = db.getPatientByUmr(umr)
  const blood = (p?.bloodGroup || fallback.bloodGroup || "").trim()
  return {
    patientName: p?.name || fallback.patientName,
    umr,
    age: p?.age ?? fallback.age ?? null,
    sex: p?.sex || fallback.sex || null,
    bloodGroup: blood && !/^(unknown|n\/?a|-|—)$/i.test(blood) ? blood : null,
    phone: [p?.phone, fallback.phone].find((x) => x && x !== PLACEHOLDER_PHONE) || null,
    registeredOn: p?.createdAt || fallback.registeredOn || null,
  }
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function fmtDate(v?: string | null): string {
  if (!v) return ""
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
}

/**
 * The complete card as a standalone HTML document. `screenZoom` enlarges it
 * for the on-screen preview only; print is always true size.
 */
export function opCardHtml(
  card: OpCardData,
  branding: CardBranding,
  screenZoom = 1,
  /** The card's no-login link (see fetchCardToken). Without it, no QR. */
  qrLink: string | null = null,
  /** Why there is no link, when there is none. */
  qrProblem: CardLinkProblem | "loading" | null = null,
): string {
  const logo = branding.hospitalLogo?.src
    ? `<img class="logo" src="${esc(branding.hospitalLogo.src)}" alt=""/>`
    : `<div class="mark">${esc(initials(branding.hospitalName) || "H")}</div>`
  const facts = [
    card.age != null && card.age !== "" ? `${esc(card.age)} yrs` : "",
    card.sex ? esc(card.sex) : "",
  ].filter(Boolean)
  const registered = fmtDate(card.registeredOn)
  // The card's single scan point: opens this card's no-login record page.
  const qr = qrLink ? qrSvg(qrLink, { size: 120, ecc: "M" }) : ""

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Patient card · ${esc(card.patientName)} · ${esc(card.umr)}</title>
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  @media screen { html { zoom: ${screenZoom}; } body { padding: 0; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #0f172a; font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { width: 85.6mm; height: 54mm; border-radius: 3mm; overflow: hidden; position: relative;
    border: 0.25mm solid #cbd5e1; display: flex; flex-direction: column; background: #fff; }
  @media print { .card { border-radius: 0; border: none; } }
  .band { background: linear-gradient(100deg, #1b4fd8 0%, #1e3a8a 100%); color: #fff;
    padding: 2.2mm 3.2mm; display: flex; align-items: center; gap: 2mm; }
  .logo { height: 7mm; max-width: 18mm; object-fit: contain; background: #fff; border-radius: 1mm; padding: .4mm; }
  .mark { width: 7mm; height: 7mm; border-radius: 1.2mm; background: rgba(255,255,255,.18);
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 8pt; }
  .hosp { font-weight: 700; font-size: 8.6pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kind { font-size: 5.4pt; letter-spacing: .14em; text-transform: uppercase; opacity: .85; margin-top: .3mm; }
  .grow { flex: 1; min-width: 0; }
  .help { font-size: 5.2pt; text-align: right; opacity: .9; line-height: 1.25; }
  .help b { display: block; font-size: 6.4pt; letter-spacing: .02em; }
  .body { flex: 1; display: flex; gap: 3mm; padding: 2.6mm 3.2mm 2.4mm; min-height: 0; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: 10.5pt; font-weight: 800; line-height: 1.12; letter-spacing: -.01em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .facts { display: flex; flex-wrap: wrap; gap: 1mm; margin-top: 1.3mm; }
  .chip { font-size: 6.2pt; font-weight: 600; color: #334155; background: #f1f5f9; border-radius: .8mm; padding: .35mm 1.2mm; }
  .chip.blood { color: #b91c1c; background: #fef2f2; }
  .phone { font-size: 6.8pt; color: #475569; margin-top: 1.2mm; }
  .spacer { flex: 1; }
  .lbl { font-size: 5.2pt; font-weight: 700; color: #64748b; letter-spacing: .12em; text-transform: uppercase; }
  .umr { font: 800 11pt ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #1b4fd8; letter-spacing: .02em; margin-top: .2mm; }
  .since { font-size: 5.6pt; color: #64748b; margin-top: .4mm; }
  .hint { font-size: 5pt; color: #94a3b8; margin-top: 1mm; letter-spacing: .02em; }
  .qr { flex-shrink: 0; width: 31mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr svg { display: block; width: 31mm; height: 31mm; }
  .noqr { width: 29mm; height: 29mm; border: .3mm dashed #cbd5e1; border-radius: 1.5mm; display: flex; align-items: center;
    justify-content: center; text-align: center; font-size: 5.4pt; color: #94a3b8; padding: 2mm; }
  .qrcap { font-size: 5.6pt; font-weight: 700; color: #1b4fd8; letter-spacing: .06em; text-transform: uppercase; margin-top: -.6mm; }
</style></head><body>
<div class="card">
  <div class="band">
    ${logo}
    <div class="grow"><div class="hosp">${esc(branding.hospitalName)}</div><div class="kind">Patient card</div></div>
    ${branding.helpline ? `<div class="help">Helpline<b>${esc(branding.helpline)}</b></div>` : ""}
  </div>
  <div class="body">
    <div class="who">
      <div class="name">${esc(card.patientName)}</div>
      ${facts.length || card.bloodGroup ? `<div class="facts">${facts.map((f) => `<span class="chip">${f}</span>`).join("")}${card.bloodGroup ? `<span class="chip blood">${esc(card.bloodGroup)}</span>` : ""}</div>` : ""}
      ${card.phone ? `<div class="phone">${esc(card.phone)}</div>` : ""}
      <div class="spacer"></div>
      <div class="lbl">UMR</div>
      <div class="umr">${esc(card.umr)}</div>
      ${registered ? `<div class="since">Patient since ${esc(registered)}</div>` : ""}
      <div class="hint">Show this card at every visit</div>
    </div>
    ${qr ? `<div class="qr">${qr}<div class="qrcap">Scan for record</div></div>` : `<div class="qr"><div class="noqr">${esc(QR_PROBLEM_TEXT[qrProblem ?? "offline"])}</div></div>`}
  </div>
</div>
</body></html>`
}

const QR_PROBLEM_TEXT: Record<CardLinkProblem | "loading", string> = {
  loading: "Preparing QR…",
  offline: "QR needs the hospital server — it is unreachable",
  signin: "QR needs a server sign-in — sign out and in again",
  conflict: "UMR clash on the server — see reception",
  deleted: "This patient was removed from hospital records",
  unknown: "QR could not be issued — try again",
}

/**
 * Details sent with the card-link request so the server can check the card is
 * for the person it has under that UMR. Only for patients registered at this
 * desk -- the per-browser UMR counter is the only way two people share a UMR.
 * Patients this browser copied from the server carry the server's own id, and
 * their locally-held copy may be incomplete, so the id is trusted as is.
 */
function detailsOf(card: OpCardData) {
  if (!db.getPatientByUmr(card.umr)) return undefined
  return {
    name: card.patientName,
    age: card.age ?? null,
    sex: card.sex ?? null,
    phone: card.phone ?? null,
    bloodGroup: card.bloodGroup ?? null,
  }
}

/** The card with the server's details laid over the desk's copy, once known. */
export function withServerDetails(card: OpCardData): OpCardData {
  const p = serverCardPatient(card.umr)
  if (!p) return card
  const str = (v: unknown) => (v == null ? "" : String(v).trim())
  const name = [str(p.name), str(p.middle_name), str(p.last_name)].filter(Boolean).join(" ")
  const blood = str(p.blood_group)
  return {
    ...card,
    patientName: name || card.patientName,
    age: p.age != null && str(p.age) ? (p.age as number) : card.age,
    sex: str(p.gender) || card.sex,
    bloodGroup: blood && !/^(unknown|n\/?a|-|—)$/i.test(blood) ? blood : null,
    phone: str(p.phone) || null,
    registeredOn: card.registeredOn || str(p.created_at) || null,
  }
}

/** The card's no-login link (or why there is none): the given token, or one fetched for this card. */
export function useCardLink(
  card: OpCardData,
  knownToken?: string | null,
): { link: string | null ;problem: CardLinkProblem | "loading" | null } {
  const [state, setState] = useState<{ token: string | null ;problem: CardLinkProblem | "loading" | null }>(
    knownToken ? { token: knownToken, problem: null } : { token: null, problem: "loading" },
  )
  const detailsKey = JSON.stringify([card.umr, card.patientName, card.phone])
  useEffect(() => {
    if (knownToken) {
      setState({ token: knownToken, problem: null })
      return
    }
    let alive = true
    setState({ token: null, problem: "loading" })
    if (card.umr)
      fetchCardToken(card.umr, false, detailsOf(card)).then((t) => {
        if (alive) setState({ token: t, problem: t ? null : lastCardLinkProblem() ?? "unknown" })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsKey, knownToken])
  return { link: state.token ? publicCardUrl(state.token) : null, problem: state.problem }
}

// Card size at 96 dpi: 85.6 mm × 54 mm.
const CARD_W = 323.5
const CARD_H = 204.1

/** On-screen card, rendered from the same HTML that prints. */
export function OpCardPreview({
  card,
  branding,
  zoom = 1.45,
  className,
  cardToken,
}: {
  card: OpCardData
  branding: CardBranding
  zoom?: number
  className?: string
  /** Known token (e.g. on the card page itself); otherwise fetched. */
  cardToken?: string | null
}) {
  const { link: qrLink, problem } = useCardLink(card, cardToken)
  // Once the server has answered, print its details rather than the desk's copy.
  const shown = useMemo(() => (qrLink ? withServerDetails(card) : card), [card, qrLink])
  const html = useMemo(() => opCardHtml(shown, branding, zoom, qrLink, problem), [shown, branding, zoom, qrLink, problem])
  return (
    <iframe
      title={`Patient card for ${card.patientName}`}
      srcDoc={html}
      className={className}
      // Display only: a focused iframe would swallow the keystrokes a desk
      // scanner "types", so the card can never take focus.
      tabIndex={-1}
      style={{
        pointerEvents: "none",
        width: Math.ceil(CARD_W * zoom) + 2,
        height: Math.ceil(CARD_H * zoom) + 2,
        border: 0,
        borderRadius: 4 * zoom,
        boxShadow: "0 10px 30px -12px rgba(15,23,42,.35), 0 2px 6px rgba(15,23,42,.08)",
        background: "#fff",
        display: "block",
      }}
    />
  )
}


/**
 * Everything a printed card needs: its link (fetched unless known), the
 * server's details laid over the desk's copy, or why there is no link.
 */
export async function prepareCard(
  card: OpCardData,
  knownToken?: string | null,
): Promise<{ card: OpCardData ;token: string | null ;link: string | null ;problem: CardLinkProblem | null }> {
  const token = knownToken ?? (await fetchCardToken(card.umr, false, detailsOf(card)))
  return {
    card: token ? withServerDetails(card) : card,
    token,
    link: token ? publicCardUrl(token) : null,
    problem: token ? null : lastCardLinkProblem() ?? "unknown",
  }
}

/**
 * Print the card and nothing else, at true card size, from a hidden
 * self-contained iframe -- the page around it can never reach the printer.
 */
export async function printOpCard(
  card: OpCardData,
  branding: CardBranding,
  knownToken?: string | null,
): Promise<{ withQr: boolean }> {
  const ready = await prepareCard(card, knownToken)
  const token = ready.token
  const html = opCardHtml(ready.card, branding, 1, ready.link, ready.problem)
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) {
    frame.remove()
    return { withQr: Boolean(token) }
  }
  doc.open()
  doc.write(html)
  doc.close()
  const go = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500), { once: true })
      frame.contentWindow?.print()
    } finally {
      setTimeout(() => frame.remove(), 60_000)
    }
  }
  const img = doc.querySelector("img")
  if (img && !img.complete) {
    img.addEventListener("load", go, { once: true })
    img.addEventListener("error", go, { once: true })
  } else {
    setTimeout(go, 50)
  }
  return { withQr: Boolean(token) }
}

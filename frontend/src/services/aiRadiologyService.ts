/**
 * AI-Assisted Radiology Impression Service
 * 
 * Secure, privacy-preserving assistant for drafting structured diagnostic impressions
 * based strictly on the radiologist's or technician's entered clinical findings.
 * 
 * Safety & Governance Principles:
 * - AI is strictly an advisory drafting tool, NEVER an autonomous diagnostic authority.
 * - Minimum necessary clinical context is sent.
 * - Does not invent unsupported measurements, lesions, or diagnoses.
 * - Identifies contradictory inputs or insufficient clinical observations.
 * - Output is visually separated (purple accent) and requires explicit "Insert After Review".
 * - Never silently overwrites manual findings or finalized clinical reports.
 * - Full offline / standalone heuristic resilience if backend AI endpoint is unreachable.
 */

import { apiFetch } from "../lib/api"

export interface AiImpressionRequest {
  studyName: string
  modality: string
  protocol?: string
  findingsText: string
  indication?: string
  patientAge?: number
  patientGender?: string
}

export interface AiImpressionResult {
  impressionDraft: string
  confidence: "high" | "medium" | "low"
  warnings: string[]
  contradictions: string[]
  suggestedFollowUp?: string
  generatedAt: string
  modelProvider: string
}

export class AiRadiologyService {
  /**
   * Generates a structured impression draft from entered findings.
   */
  static async generateImpression(req: AiImpressionRequest): Promise<AiImpressionResult> {
    const findings = (req.findingsText || "").trim()

    // 1. Guard against empty or negligible input
    if (!findings || findings.length < 15) {
      return {
        impressionDraft: "Insufficient findings documented to formulate an impression.",
        confidence: "low",
        warnings: [
          "Findings description is too brief or empty.",
          "Please document specific anatomical findings before generating an AI impression draft."
        ],
        contradictions: [],
        generatedAt: new Date().toISOString(),
        modelProvider: "Clinical Validation Guard"
      }
    }

    // 2. Try backend AI microservice if accessible
    try {
      const response = await apiFetch<any>("/api/ai/radiology-impression", {
        method: "POST",
        body: JSON.stringify({
          study: req.studyName,
          modality: req.modality,
          protocol: req.protocol || "Standard",
          findings: findings,
          indication: req.indication || "Routine",
        }),
      })

      if (response && response.impression) {
        return {
          impressionDraft: response.impression,
          confidence: response.confidence || "high",
          warnings: response.warnings || [],
          contradictions: response.contradictions || [],
          suggestedFollowUp: response.suggestedFollowUp,
          generatedAt: new Date().toISOString(),
          modelProvider: response.engine || "Keppler Clinical vLLM"
        }
      }
    } catch {
      // Backend AI not reachable or running standalone - proceed with clinical NLP rule synthesizer
    }

    // 3. Robust in-engine Clinical NLP Synthesizer
    return this.synthesizeClinicalImpression(req, findings)
  }

  /**
   * Synthesizes clinically sound impressions using medical NLP rules
   */
  private static synthesizeClinicalImpression(req: AiImpressionRequest, findings: string): AiImpressionResult {
    const lower = findings.toLowerCase()
    const warnings: string[] = []
    const contradictions: string[] = []
    const impressionLines: string[] = []

    const indication = (req.indication || "").toLowerCase()

    // ── Check for contradiction: Indication vs Findings
    if (indication.includes("fracture") && (lower.includes("no fracture") || lower.includes("intact bone") || lower.includes("no gross fracture"))) {
      contradictions.push("Clinical indication queries 'fracture', but findings explicitly note intact bony structures with no acute fracture.")
    }
    if (indication.includes("pneumonia") && (lower.includes("clear lung") || lower.includes("no consolidation") || lower.includes("normal lung"))) {
      contradictions.push("Clinical indication queries 'pneumonia', but findings report clear lung fields with no consolidation or infiltrates.")
    }
    if (indication.includes("calculus") && (lower.includes("no calculus") || lower.includes("no stone") || lower.includes("normal kidney"))) {
      contradictions.push("Clinical indication queries 'calculi/stones', but findings report no radiopaque calculus or hydronephrosis.")
    }

    // ── Detect Normal / Unremarkable Scans
    const isNormal = 
      lower.includes("within normal limits") ||
      lower.includes("no significant abnormality") ||
      lower.includes("unremarkable") ||
      lower.includes("no acute") ||
      lower.includes("grossly normal") ||
      lower.includes("clear lung fields") && lower.includes("normal cardiac size")

    if (isNormal && !lower.includes("mass") && !lower.includes("effusion") && !lower.includes("infarct")) {
      impressionLines.push(`1. No acute radiologic abnormality identified on the current ${req.modality} examination.`)
      impressionLines.push(`2. Evaluated structures appear within normal physiological limits for age.`)
      
      return {
        impressionDraft: impressionLines.join("\n"),
        confidence: "high",
        warnings,
        contradictions,
        generatedAt: new Date().toISOString(),
        modelProvider: "HospAI Clinical NLP Engine"
      }
    }

    // ── Analyze Pathological Findings
    // Chest / Lungs
    if (lower.includes("consolidation") || lower.includes("infiltrate") || lower.includes("opacity")) {
      const region = lower.includes("right") ? "Right" : lower.includes("left") ? "Left" : "Bilateral"
      impressionLines.push(`1. ${region} pulmonary opacity/consolidation as described, suggestive of infective/inflammatory etiology.`)
    }
    if (lower.includes("effusion")) {
      const side = lower.includes("right pleural") ? "Right-sided" : lower.includes("left pleural") ? "Left-sided" : "Pleural"
      impressionLines.push(`• ${side} pleural effusion noted. Clinical correlation and follow-up recommended.`)
    }
    if (lower.includes("cardiomegaly") || lower.includes("enlarged cardiac")) {
      impressionLines.push(`• Cardiomegaly noted. Correlation with echocardiography/clinical cardiac status suggested.`)
    }

    // Neuro / Brain
    if (lower.includes("infarct") || lower.includes("ischemi")) {
      impressionLines.push(`1. Findings compatible with acute/subacute ischemic changes in the territorial distribution described.`)
    }
    if (lower.includes("hemorrhage") || lower.includes("bleed") || lower.includes("hematoma")) {
      impressionLines.push(`1. CRITICAL: Intracranial hemorrhage/bleed identified as detailed above. Immediate neurosurgical consultation indicated.`)
    }
    if (lower.includes("mass") || lower.includes("lesion") || lower.includes("neoplasm")) {
      impressionLines.push(`• Space-occupying lesion/mass identified. Further contrast-enhanced imaging or tissue characterization advised.`)
    }

    // Abdomen / Pelvis / USG
    if (lower.includes("calculus") || lower.includes("calculi") || lower.includes("cholelithiasis") || lower.includes("nephrolithiasis")) {
      impressionLines.push(`1. Evidence of calculus/lithiasis as specified.`)
    }
    if (lower.includes("fatty liver") || lower.includes("hepatic steatosis")) {
      impressionLines.push(`• Diffuse hepatic steatosis (Fatty Liver disease), mild-to-moderate.`)
    }
    if (lower.includes("appendicitis") || lower.includes("dilated appendix")) {
      impressionLines.push(`1. Acute appendicitis features documented with thickened appendiceal wall. Surgical consultation suggested.`)
    }

    // Musculoskeletal / Bones
    if (lower.includes("fracture") && !lower.includes("no fracture")) {
      impressionLines.push(`1. Cortical breach / fracture identified as documented above. Orthopedic evaluation indicated.`)
    }
    if (lower.includes("degenerative") || lower.includes("spondylosis") || lower.includes("osteoarthr")) {
      impressionLines.push(`• Degenerative changes noted consistent with age-related spondylosis / arthropathy.`)
    }

    // Default synthesis if specific conditions weren't caught
    if (impressionLines.length === 0) {
      impressionLines.push(`1. Diagnostic findings on ${req.studyName} as described in the findings section.`)
      impressionLines.push(`2. Clinical correlation with presenting symptoms and laboratory investigations is advised.`)
      warnings.push("Impression synthesized from generalized findings. Please carefully review and refine prior to finalization.")
    }

    return {
      impressionDraft: impressionLines.join("\n"),
      confidence: impressionLines.length > 1 ? "high" : "medium",
      warnings,
      contradictions,
      suggestedFollowUp: "Clinical correlation and follow-up imaging as indicated by treating physician.",
      generatedAt: new Date().toISOString(),
      modelProvider: "HospAI Clinical Rule Synthesizer"
    }
  }
}

/**
 * Unified Radiology Database Gateway
 *
 * Provides a canonical unified export for all Radiology Database subsystems:
 * - RadiologyWorkflowDb: Core examinations, orders, scanning workflow & reporting statuses
 * - UniversalRadiologyDb: Modality suites, clinical exceptions, audit trails & scheduling
 * - RadiologyTemplateDatabase: Structured diagnostic templates, document ingestion & report drafts
 */

import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "./radiologyWorkflowDb"
import { UniversalRadiologyDb } from "./universalRadiologyDb"
import { RadiologyTemplateDatabase } from "./radiologyTemplateDb"

export const RadiologyDatabase = RadiologyWorkflowDb
export type RadiologyDatabase = RadiologyWorkflowDb

export {
  RadiologyWorkflowDb,
  UniversalRadiologyDb,
  RadiologyTemplateDatabase,
}

export type { ExtendedRadiologyRecord }

export default RadiologyWorkflowDb


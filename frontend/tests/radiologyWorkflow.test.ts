/**
 * Comprehensive Automated Tests for Radiology Workflow & Reporting
 * 
 * Verifies:
 * 1. Pending billing prevents routine scan from starting when policy requires clearance.
 * 2. An authorized exception is recorded correctly with user, role, reason, ref, and timestamp.
 * 3. An authorized routine scan can be started once the exception is recorded.
 * 4. STAT/Emergency scans and Inpatients are exempt from pre-billing clearance and can start immediately.
 * 5. A previously completed scan (e.g. Diane Walsh, RAD-208) is preserved as completed (DONE),
 *    timestamps are preserved, never marked paid automatically, and flagged with hasBillingDiscrepancy = true.
 * 6. The Report button resolves the correct patient, UMR, encounter, examination, and order from stable study ID.
 * 7. Clicking Report twice does not create duplicate drafts (reopens existing draft).
 * 8. An existing draft reopens with its saved content.
 * 9. A finalized report opens read-only and accepts authorized amendments.
 * 10. Incorrect or missing study identifiers produce a clear error without crashing.
 * 11. Unauthorized roles (e.g. nurse, technician, clerk) cannot finalize official diagnostic reports or add amendments.
 * 12. Billing status remains synchronized with billing source of truth without fabricating financial authorizations.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Global browser mocks for Node environment
const memoryStore = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage.setItem) {
  globalThis.localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => { memoryStore.set(key, String(value)); },
    removeItem: (key: string) => { memoryStore.delete(key); },
    clear: () => { memoryStore.clear(); },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() { return memoryStore.size; }
  } as any;
}

// Unconditionally mock BroadcastChannel to avoid keeping Node event loop open
(globalThis as any).BroadcastChannel = class BroadcastChannel {
  name: string;
  onmessage = null;
  constructor(name: string) { this.name = name; }
  postMessage() {}
  close() {}
  unref() {}
  ref() {}
};

if (typeof globalThis.CustomEvent === "undefined") {
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params: any = {}) {
      this.type = type;
      this.detail = params.detail;
    }
  };
}

if (typeof (globalThis as any).dispatchEvent === "undefined") {
  (globalThis as any).dispatchEvent = () => true;
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
}

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
} else {
  if (typeof (globalThis.window as any).dispatchEvent === "undefined") {
    (globalThis.window as any).dispatchEvent = () => true;
    (globalThis.window as any).addEventListener = () => {};
    (globalThis.window as any).removeEventListener = () => {};
  }
}

// Import services under test
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../src/services/radiologyWorkflowDb";
import { BillingDatabase, RadiologyStudyRecord } from "../src/services/billingDb";
import { getCanonicalRadiologyModality } from "../src/utils/testClassifier";
import { RADIOLOGY_MODALITIES } from "../src/services/radiologyTariffsData";

describe("Radiology Workflow & Reporting Comprehensive Test Suite", () => {
  beforeEach(() => {
    // Reset cache before each test
    RadiologyWorkflowDb.invalidateCache();
  });

  // 1. Pending billing prevents routine scan from starting when policy requires clearance
  it("Rule 1: Pending billing prevents routine scan from starting when policy requires clearance", () => {
    const studyId = "TEST-RAD-ROUTINE-ORDER";
    BillingDatabase.createRadiologyStudy({
      id: studyId,
      patient: "John Doe",
      mrn: "100999",
      study: "Bone Mineral Densitometry (DEXA Scan)",
      modality: "XR",
      priority: "Routine",
      ordered: "10:00",
      provider: "Dr. Smith",
      status: "Orders",
      room: "XR-1",
      price: 150,
      paymentStatus: "Payment Pending",
      accessionNo: "ACC-TEST-ROUTINE-1"
    });
    RadiologyWorkflowDb.invalidateCache();

    // Clearance check must be true for routine outpatient
    const study = RadiologyWorkflowDb.getStudyById(studyId);
    assert.ok(study);
    assert.equal(RadiologyWorkflowDb.isBillingClearanceRequired(study), true);

    // Attempting to start the scan without clearance or exception must throw an error
    assert.throws(
      () => {
        RadiologyWorkflowDb.startInvestigation(studyId, "Tech Smith", "Room 1");
      },
      (err: any) => {
        assert.match(err.message, /Billing clearance required: Payment is pending/i);
        return true;
      },
      "Starting an unpaid routine scan without authorized exception must be rejected"
    );

    // Verify study remains in ORDERED status
    const refreshed = RadiologyWorkflowDb.getStudyById(studyId);
    assert.equal(refreshed?.normalizedStatus, "ORDERED");
  });

  // 2. An authorized exception is recorded correctly
  it("Rule 2: An authorized exception is recorded correctly with user, role, reason, ref, and timestamp", () => {
    const studyId = "TEST-RAD-AUTH-EXCEPTION";
    BillingDatabase.createRadiologyStudy({
      id: studyId,
      patient: "Alice Walker",
      mrn: "100888",
      study: "Bone Mineral Densitometry",
      modality: "XR",
      priority: "Routine",
      ordered: "09:30",
      provider: "Dr. Finch",
      status: "Orders",
      room: "XR-1",
      price: 150,
      paymentStatus: "Payment Pending",
      accessionNo: "ACC-AUTH-1"
    });
    RadiologyWorkflowDb.invalidateCache();

    // Record an authorized exception
    const record = RadiologyWorkflowDb.recordAuthorizedException({
      studyId,
      user: "Dr. Alistair Finch",
      role: "Clinical Director",
      reason: "Urgent clinical evaluation needed for suspected fracture",
      authorizationRef: "AUTH-EX-2026-001"
    });

    assert.ok(record);
    assert.equal(record.billingStatus, "Authorized Exception");
    assert.equal(record.authorizedException?.user, "Dr. Alistair Finch");
    assert.equal(record.authorizedException?.role, "Clinical Director");
    assert.equal(record.authorizedException?.reason, "Urgent clinical evaluation needed for suspected fracture");
    assert.equal(record.authorizedException?.authorizationRef, "AUTH-EX-2026-001");
    assert.ok(record.authorizedException?.timestamp);

    // Financial payment status must NOT be fabricated as paid
    assert.equal(record.isPaid, false, "Financial status must remain unpaid");

    // Now starting the scan must succeed because the exception was authorized
    assert.doesNotThrow(() => {
      RadiologyWorkflowDb.startInvestigation(studyId, "Tech Brown", "DEXA Suite 1");
    });

    const updated = RadiologyWorkflowDb.getStudyById(studyId);
    assert.equal(updated?.normalizedStatus, "IN PROGRESS");
    assert.equal(updated?.billingStatus, "Authorized Exception");
  });

  // 3. STAT/Emergency scans and Inpatients are exempt from pre-billing clearance
  it("Rule 3: STAT/Emergency scans and Inpatients are exempt from pre-billing clearance", () => {
    // STAT emergency scan
    const statId = "TEST-RAD-STAT-EMERGENCY";
    BillingDatabase.createRadiologyStudy({
      id: statId,
      patient: "Emergency Patient",
      mrn: "100777",
      study: "CT Brain Plain",
      modality: "CT",
      priority: "STAT",
      ordered: "08:15",
      provider: "Dr. ER Lead",
      status: "Orders",
      room: "CT-1",
      price: 250,
      paymentStatus: "Payment Pending",
      accessionNo: "ACC-STAT-1"
    });

    // Inpatient (IP) scan
    const ipId = "TEST-RAD-INPATIENT";
    BillingDatabase.createRadiologyStudy({
      id: ipId,
      patient: "Ward Inpatient",
      mrn: "100666",
      study: "X-Ray Chest PA",
      modality: "XR",
      priority: "Routine",
      ordered: "07:30",
      provider: "Dr. Wilson",
      status: "Orders",
      room: "XR-2",
      price: 60,
      paymentStatus: "Payment Pending",
      accessionNo: "ACC-IP-1",
      department: "Inpatient",
      ipNumber: "IP-2026-99"
    } as any);
    RadiologyWorkflowDb.invalidateCache();

    // Both must be exempt from clearance block
    const statStudy = RadiologyWorkflowDb.getStudyById(statId);
    const ipStudy = RadiologyWorkflowDb.getStudyById(ipId);
    assert.equal(RadiologyWorkflowDb.isBillingClearanceRequired(statStudy), false);
    assert.equal(RadiologyWorkflowDb.isBillingClearanceRequired(ipStudy), false);

    // Starting emergency scan must not throw
    assert.doesNotThrow(() => {
      RadiologyWorkflowDb.startInvestigation(statId, "ER Tech", "CT 1");
    });
    assert.equal(RadiologyWorkflowDb.getStudyById(statId)?.normalizedStatus, "IN PROGRESS");

    // Starting inpatient scan must not throw
    assert.doesNotThrow(() => {
      RadiologyWorkflowDb.startInvestigation(ipId, "Ward Tech", "XR 2");
    });
    assert.equal(RadiologyWorkflowDb.getStudyById(ipId)?.normalizedStatus, "IN PROGRESS");
  });

  // 4. Previously completed scan is not erased or falsified when a billing discrepancy is detected
  it("Rule 4: A previously completed scan (e.g. Diane Walsh, RAD-208) is preserved and flagged with discrepancy", () => {
    RadiologyWorkflowDb.invalidateCache();
    const studies = RadiologyWorkflowDb.getStudies();
    // Diane Walsh study RAD-208
    const diane = studies.find(s => s.id === "RAD-208" || s.mrn === "100142");
    assert.ok(diane, "Diane Walsh study record must exist in initial studies");
    assert.equal(diane.patient, "Diane Walsh");
    assert.equal(diane.mrn, "100142");

    // Must preserve completed scan status (DONE)
    assert.equal(diane.normalizedStatus, "DONE", "Actual completed scan status must not be forced back to Pending");

    // Financial state must remain Pending (never auto-marked paid)
    assert.equal(diane.isPaid, false, "Must never automatically mark a pending bill as paid");
    assert.equal(diane.billingStatus, "Pending");

    // Discrepancy flag must be active
    assert.equal(diane.hasBillingDiscrepancy, true, "Completed scan with pending bill must be flagged as a discrepancy");
    assert.ok(diane.billingDiscrepancyReason?.length, "Must include a discrepancy explanation for auditing");

    // Report state must remain accessible for clinical reporting
    assert.equal(diane.normalizedReportStatus, "Awaiting Report");
  });

  // 5. Report button resolves correct patient, UMR, encounter, examination, and order
  it("Rule 5: The Report button resolves the correct patient, UMR, encounter, examination, and order from stable study ID", () => {
    const studyId = "RAD-208";
    const study = RadiologyWorkflowDb.getStudyById(studyId);
    assert.ok(study, "Must resolve study by stable ID");

    const draftResult = RadiologyWorkflowDb.getOrInitializeReportDraft(studyId, "Dr. Robert Chen", "Radiologist");
    assert.ok(draftResult, "Must successfully initialize draft for study");

    assert.equal(draftResult.study.id, studyId);
    assert.equal(draftResult.study.patient, "Diane Walsh");
    assert.equal(draftResult.study.mrn, "100142");
    assert.equal(draftResult.study.study, study.study);
    assert.equal(draftResult.study.modality, study.modality);

    // Approved template must be prefilled in draftData
    assert.ok(draftResult.draftData.findingsText.length > 0, "Approved template findings must be prefilled");
    assert.ok(draftResult.draftData.impressionText.length > 0, "Approved template impression must be prefilled");
  });

  // 6. Clicking Report twice does not create duplicate drafts
  it("Rule 6: Clicking Report twice does not create duplicate drafts", () => {
    const studyId = "RAD-208";
    const initialStudiesCount = RadiologyWorkflowDb.getStudies().length;

    const firstCall = RadiologyWorkflowDb.getOrInitializeReportDraft(studyId, "Dr. Robert Chen", "Radiologist");
    const secondCall = RadiologyWorkflowDb.getOrInitializeReportDraft(studyId, "Dr. Robert Chen", "Radiologist");

    assert.equal(firstCall.study.id, secondCall.study.id);
    assert.equal(firstCall.draftData.findingsText, secondCall.draftData.findingsText);

    // Check overall studies count - should not have created duplicate rows
    const studiesAfter = RadiologyWorkflowDb.getStudies();
    const matching = studiesAfter.filter(s => s.id === studyId);
    assert.equal(matching.length, 1, "Must have exactly one study record with this ID");
    assert.equal(studiesAfter.length, initialStudiesCount, "Total studies count must remain identical");
  });

  // 7. Existing draft reopens with its saved content
  it("Rule 7: An existing draft reopens with its saved content", () => {
    const studyId = "RAD-208";
    const customFindings = "DEXA scan T-score is -2.6 in the lumbar spine, indicating osteoporosis.";
    const customImpression = "Confirmed osteoporosis. Calcium and vitamin D supplementation advised.";

    RadiologyWorkflowDb.saveReportDraft(
      studyId,
      { findings: [customFindings], impression: [customImpression] },
      undefined,
      "Dr. Robert Chen",
      "Radiologist"
    );

    // Reopen draft
    const reopened = RadiologyWorkflowDb.getOrInitializeReportDraft(studyId, "Dr. Robert Chen", "Radiologist");
    assert.equal(reopened.isExistingDraft, true, "Must recognize that draft already exists");
    assert.equal(reopened.draftData.findingsText, customFindings, "Saved findings must be retrieved");
    assert.equal(reopened.draftData.impressionText, customImpression, "Saved impression must be retrieved");
  });

  // 8. Finalized report opens read-only and accepts authorized amendments
  it("Rule 8: A finalized report opens read-only and accepts authorized amendments", () => {
    const studyId = "RAD-208";
    // Finalize report
    RadiologyWorkflowDb.finalizeReport(
      studyId,
      { findings: ["Finalized findings content"], impression: ["Finalized impression"] },
      undefined,
      "Dr. Sarah Lin",
      "Radiologist"
    );

    const finalizedStudy = RadiologyWorkflowDb.getStudyById(studyId);
    assert.equal(finalizedStudy?.normalizedReportStatus, "Finalized");

    // Add an authorized amendment
    const amended = RadiologyWorkflowDb.addReportAmendment({
      studyId,
      user: "Dr. Sarah Lin",
      role: "Radiologist",
      reason: "Clinical correlation with DEXA follow-up scan from prior year",
      content: "Addendum: Prior 2025 baseline scan showed T-score -2.2. Progression to -2.6 documented."
    });

    assert.ok(amended.amendments && amended.amendments.length > 0, "Amendment list must exist");
    assert.equal(amended.amendments[0].version, "v2.0");
    assert.equal(amended.amendments[0].amendedBy, "Dr. Sarah Lin");
    assert.equal(amended.amendments[0].reason, "Clinical correlation with DEXA follow-up scan from prior year");
    assert.match(amended.amendments[0].content, /Addendum: Prior 2025 baseline/);

    // Finalized base content remains intact
    assert.equal(amended.findings?.[0], "Finalized findings content");
  });

  // 9. Incorrect or missing identifiers produce a clear error
  it("Rule 9: Incorrect or missing identifiers produce a clear error", () => {
    const invalidId = "RAD-NONEXISTENT-9999";
    const result = RadiologyWorkflowDb.getStudyById(invalidId);
    assert.equal(result, undefined, "Non-existent study ID must return undefined");

    assert.throws(
      () => {
        RadiologyWorkflowDb.getOrInitializeReportDraft(invalidId, "Dr. Someone", "Radiologist");
      },
      (err: any) => {
        assert.match(err.message, /not found for identifier/i);
        return true;
      },
      "Attempting to initialize report for invalid ID must throw descriptive error"
    );

    assert.throws(
      () => {
        RadiologyWorkflowDb.getOrInitializeReportDraft("", "Dr. Someone", "Radiologist");
      },
      (err: any) => {
        assert.match(err.message, /not found for identifier/i);
        return true;
      },
      "Attempting to initialize report for empty ID must throw descriptive error"
    );
  });

  // 10. Unauthorized users cannot perform restricted actions
  it("Rule 10: Unauthorized users cannot finalize reports or issue amendments", () => {
    const studyId = "TEST-RAD-AUTH-CHECKS";
    BillingDatabase.createRadiologyStudy({
      id: studyId,
      patient: "Bob Smith",
      mrn: "100555",
      study: "X-Ray Knee AP/Lateral",
      modality: "XR",
      priority: "Routine",
      ordered: "11:00",
      provider: "Dr. Ortho",
      status: "Done",
      room: "XR-1",
      price: 90,
      paymentStatus: "Paid",
      accessionNo: "ACC-AUTH-TEST"
    });
    RadiologyWorkflowDb.invalidateCache();

    // Non-credentialed role trying to finalize must throw unauthorized error
    assert.throws(
      () => {
        RadiologyWorkflowDb.finalizeReport(
          studyId,
          { findings: ["Findings"], impression: ["Impression"] },
          undefined,
          "Junior Nurse Jackie",
          "Nurse"
        );
      },
      (err: any) => {
        assert.match(err.message, /Unauthorized: User role "Nurse" is not authorized/i);
        return true;
      },
      "Nurse role cannot finalize diagnostic radiology report"
    );

    // Finalize properly with Radiologist
    RadiologyWorkflowDb.finalizeReport(
      studyId,
      { findings: ["Official Findings"], impression: ["Official Impression"] },
      undefined,
      "Dr. Sarah Lin",
      "Radiologist"
    );

    // Non-credentialed role trying to issue amendment must throw unauthorized error
    assert.throws(
      () => {
        RadiologyWorkflowDb.addReportAmendment({
          studyId,
          user: "Bob Clerk",
          role: "Billing Clerk",
          reason: "Trying to modify",
          content: "Unauthorized text"
        });
      },
      (err: any) => {
        assert.match(err.message, /Unauthorized: User role "Billing Clerk" is not authorized/i);
        return true;
      },
      "Clerk role cannot add clinical addenda"
    );
  });

  // 11. Billing status remains synchronized with billing source of truth
  it("Rule 11: Billing status remains synchronized with existing billing source of truth", () => {
    const testStudyId = "TEST-RAD-SYNC-1";
    const invoiceNo = "INV-2026-TESTSYNC";
    BillingDatabase.createRadiologyStudy({
      id: testStudyId,
      patient: "Sync Test Patient",
      mrn: "100444",
      study: "Ultrasound Abdomen Complete",
      modality: "US",
      priority: "Routine",
      ordered: "12:00",
      provider: "Dr. Physician",
      status: "Done",
      room: "US-1",
      price: 120,
      paymentStatus: "Payment Pending",
      invoiceNo,
      accessionNo: "ACC-SYNC-1"
    });
    RadiologyWorkflowDb.invalidateCache();

    // Currently unpaid and completed => has discrepancy
    let study = RadiologyWorkflowDb.getStudyById(testStudyId);
    assert.equal(study?.isPaid, false);
    assert.equal(study?.billingStatus, "Pending");
    assert.equal(study?.hasBillingDiscrepancy, true);

    // Now record bill payment in BillingDatabase claims
    BillingDatabase.createClaim({
      id: `CLM-${testStudyId}`,
      invoiceNo,
      patientName: "Sync Test Patient",
      patientId: "100444",
      department: "Radiology",
      status: "Paid",
      totalAmount: 120,
      amountPaid: 120,
      balanceDue: 0,
      items: [
        {
          id: "IT-1",
          description: "Ultrasound Abdomen Complete",
          category: "Radiology / Imaging",
          quantity: 1,
          unitPrice: 120,
          total: 120,
          insuranceCovered: 0,
          patientPayable: 120,
          cptCode: "76700"
        }
      ],
      payments: [
        {
          id: "PAY-TEST",
          invoiceId: `CLM-${testStudyId}`,
          receiptNo: "RCPT-2026-SYNC1",
          amount: 120,
          paymentDate: new Date().toISOString(),
          paymentMethod: "Cash"
        }
      ]
    });

    // Refresh studies - must now be synchronized as Paid
    RadiologyWorkflowDb.invalidateCache();
    const refreshedStudies = RadiologyWorkflowDb.getStudies();
    const synced = refreshedStudies.find(s => s.id === testStudyId);
    assert.equal(synced?.isPaid, true, "Must reflect paid state from billing claims");
    assert.equal(synced?.billingStatus, "Paid");
    assert.equal(synced?.hasBillingDiscrepancy, false, "Discrepancy clears when payment is resolved");
  });

  // 12. Canonical modality classification correctly categorizes studies across all 11 hospital modalities
  it("Rule 12: Canonical modality classification correctly categorizes studies across all 11 modalities regardless of department", () => {
    const testCases: Array<{
      study: { study?: string; modality?: string; department?: string; orderedItems?: Array<{ description?: string }> };
      expected: string;
    }> = [
      { study: { study: "Digital Chest X-Ray PA View", modality: "XR", department: "Outpatient" }, expected: "X-Ray" },
      { study: { study: "CT Head Scan w/o IV Contrast", modality: "CT", department: "Emergency" }, expected: "CT Scan" },
      { study: { study: "MRI Lumbar Spine with Contrast", modality: "MR", department: "Inpatient" }, expected: "MRI" },
      { study: { study: "Whole Abdomen & Pelvis Ultrasound", modality: "US", department: "Outpatient" }, expected: "Ultrasound (USG)" },
      { study: { study: "Bilateral Lower Limb Arterial Doppler", modality: "US", department: "Outpatient" }, expected: "Doppler" },
      { study: { study: "Digital Screening Mammography", modality: "XR", department: "Outpatient" }, expected: "Mammography" },
      { study: { study: "Bone Mineral Densitometry (DEXA Scan)", modality: "XR", department: "Outpatient" }, expected: "DEXA" },
      { study: { study: "Whole Body PET-CT Scan", modality: "NM", department: "Outpatient" }, expected: "Nuclear Medicine" },
      { study: { study: "Dental Orthopantomogram (OPG)", modality: "XR", department: "Dental" }, expected: "Dental" },
      { study: { study: "Barium Meal Follow-Through Examination", modality: "XR", department: "Outpatient" }, expected: "Fluoroscopy / Contrast" },
      { study: { study: "US-Guided Core Needle Liver Biopsy", modality: "US", department: "Surgery" }, expected: "Interventional Radiology" },
    ];

    for (const tc of testCases) {
      const actual = getCanonicalRadiologyModality(tc.study);
      assert.equal(actual, tc.expected, `Expected ${tc.study.study} (mod: ${tc.study.modality}, dept: ${tc.study.department}) to be classified as ${tc.expected}, got ${actual}`);
    }

    // Verify all 11 modalities are covered
    assert.equal(RADIOLOGY_MODALITIES.length, 11);
  });
});

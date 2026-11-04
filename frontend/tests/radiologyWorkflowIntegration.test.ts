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
}

import { RadiologyWorkflowDb } from "../src/services/radiologyWorkflowDb";
import { BillingDatabase } from "../src/services/billingDb";
import { UniversalRadiologyDb } from "../src/services/universalRadiologyDb";
import { RadiologyTemplateDatabase } from "../src/services/radiologyTemplateDb";

describe("Radiology End-to-End Workflow Integration Test Suite", () => {
  beforeEach(() => {
    RadiologyWorkflowDb.invalidateCache();
  });

  it("Scenario 1 — Doctor orders new examination and it appears in the Examination Worklist", () => {
    const testUmr = `UMR-E2E-${Date.now()}`;
    const newOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Meenakshi Sundaram",
      umr: testUmr,
      studyName: "Chest X-Ray PA View",
      modality: "XR",
      priority: "Routine",
      doctorName: "Dr. Vikram Seth, MD",
      department: "Pulmonology",
      indication: "Persistent cough for 3 weeks. Rule out infiltration.",
      price: 450,
      room: "Suite 1",
      autoVerifyNurse: true,
      nurseName: "Nurse In-Charge",
    });

    assert.ok(newOrder.id, "Generated unique study ID");
    assert.equal(newOrder.patient, "Meenakshi Sundaram");
    assert.equal(newOrder.normalizedStatus, "ORDERED");
    assert.equal(newOrder.isPaid, false);

    // Verify it appears in worklist query
    const all = RadiologyWorkflowDb.getStudies();
    const found = all.find((s) => s.id === newOrder.id);
    assert.ok(found, "Order exists in RadiologyWorkflowDb worklist");
    assert.equal(found.umr, testUmr);
    assert.equal(found.study, "Chest X-Ray PA View");
  });

  it("Scenario 2 & 3 — Payment clearance & scanning readiness policy", () => {
    const testUmr = `UMR-PAY-${Date.now()}`;
    const newOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Karthik Raja",
      umr: testUmr,
      studyName: "CT Scan — Brain",
      modality: "CT",
      priority: "Routine",
      doctorName: "Dr. Ananya Roy, MD",
      department: "Neurology",
      indication: "Chronic headaches.",
      price: 2800,
      room: "CT Suite 1",
      autoVerifyNurse: true,
    });

    // 1. Should be blocked by payment policy prior to payment
    assert.throws(
      () => {
        RadiologyWorkflowDb.startInvestigation(newOrder.id, "Tech Sarah", "CT Suite 1");
      },
      /Billing clearance required/,
      "Blocked un-cleared routine scan from starting"
    );

    // 2. Mark payment in BillingDatabase
    BillingDatabase.updateRadiologyStudy(newOrder.id, {
      paymentStatus: "Paid",
      paidReceiptNo: `RCPT-TEST-${Date.now()}`,
    });
    RadiologyWorkflowDb.invalidateCache();

    // 3. Now verify cleared
    const clearedStudy = RadiologyWorkflowDb.getStudyById(newOrder.id);
    assert.ok(clearedStudy, "Study found");
    assert.equal(clearedStudy.isPaid, true);

    // 4. Authorized exception path for unpaid exams
    const unpaidOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Siddharth Verma",
      umr: `UMR-UNP-${Date.now()}`,
      studyName: "MRI — Lumbar Spine",
      modality: "MR",
      priority: "Routine",
      doctorName: "Dr. Neha Patel",
      indication: "Severe radiculopathy",
      price: 4500,
      autoVerifyNurse: true,
    });

    const authorized = RadiologyWorkflowDb.recordAuthorizedException({
      studyId: unpaidOrder.id,
      user: "Dr. Supervisor, MD",
      role: "Clinical Supervisor",
      reason: "Clinical urgency override",
      authorizationRef: "AUTH-E2E-9901",
    });

    assert.equal(authorized.billingStatus, "Authorized Exception");
    assert.ok(authorized.authorizedException, "Exception recorded");
    assert.equal(authorized.authorizedException?.authorizationRef, "AUTH-E2E-9901");
  });

  it("Scenario 4 & 5 — Technician starts scanning and marks scanning completed with audit", () => {
    const testUmr = `UMR-SCAN-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Devi Prasad",
      umr: testUmr,
      studyName: "Abdominal Ultrasound",
      modality: "US",
      priority: "STAT", // STAT is exempt from billing block
      doctorName: "Dr. Emergency",
      indication: "Acute right upper quadrant pain",
      price: 1200,
      room: "USG Suite",
      autoVerifyNurse: true,
    });

    // Start scanning
    const started = RadiologyWorkflowDb.startInvestigation(order.id, "Alex Rivera, RT(R)", "USG Suite");
    assert.equal(started.normalizedStatus, "IN PROGRESS");
    assert.equal(started.status, "In Progress");

    // Complete scanning
    const completed = RadiologyWorkflowDb.markStudyDone(
      order.id,
      "Standard abdominal ultrasound completed. Diagnostic images archived.",
      "Alex Rivera, RT(R)",
      "Senior Radiologic Technologist"
    );
    assert.equal(completed.normalizedStatus, "DONE");
    assert.equal(completed.normalizedReportStatus, "Awaiting Report");

    // Verify duplicate mark done is idempotent and safe
    const redone = RadiologyWorkflowDb.markStudyDone(order.id, "Duplicate request");
    assert.equal(redone.normalizedStatus, "DONE");
  });

  it("Scenario 6 — Completed examination appears in Reporting Workspace, draft saved, and report finalized", () => {
    const testUmr = `UMR-REP-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Nandini Sen",
      umr: testUmr,
      studyName: "Chest X-Ray PA View",
      modality: "XR",
      priority: "Routine",
      doctorName: "Dr. Patel",
      indication: "Pre-operative assessment",
      price: 450,
      autoVerifyNurse: true,
    });

    // Mark paid & complete scan
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid" });
    RadiologyWorkflowDb.invalidateCache();
    RadiologyWorkflowDb.startInvestigation(order.id, "Tech John", "Suite 2");
    RadiologyWorkflowDb.markStudyDone(order.id, "Acquired bilateral views");

    // Check reporting workspace eligibility
    const reportingStudies = RadiologyWorkflowDb.getStudies().filter((s) => s.normalizedStatus === "DONE");
    const readyForReport = reportingStudies.find((s) => s.id === order.id);
    assert.ok(readyForReport, "Completed study is in reporting workspace queue");

    // Auto-match template
    const template = RadiologyTemplateDatabase.getTemplateForStudy("Chest X-Ray PA View");
    assert.ok(template, "Matched existing template for Chest X-Ray PA View");

    // Save report draft
    const draft = RadiologyWorkflowDb.saveReportDraft(order.id, {
      findings: ["Clear lung fields", "Normal cardiac silhouette"],
      impression: ["Normal study"],
      radiologist: "Dr. Rajesh Sharma, MD",
    });
    assert.equal(draft.normalizedReportStatus, "Draft");

    // Finalize report
    const finalized = RadiologyWorkflowDb.finalizeReport(order.id, {
      findings: ["Clear lung fields", "Normal cardiac silhouette"],
      impression: ["No acute cardiopulmonary disease."],
      finalizedBy: "Dr. Rajesh Sharma, MD",
      finalizedRole: "Senior Radiologist & HOD",
    });
    assert.equal(finalized.normalizedReportStatus, "Finalized");
    assert.ok(finalized.finalizedAt, "Saved finalized timestamp");
  });

  it("Scenario 7 & 8 — State persistence, role security, and regression protection", () => {
    // 1. Role enforcement: Unauthorized typist/technician cannot finalize
    const testUmr = `UMR-AUTH-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Arun Ghosh",
      umr: testUmr,
      studyName: "Chest X-Ray PA View",
      modality: "XR",
      priority: "Routine",
      doctorName: "Dr. Patel",
      indication: "Fever evaluation",
      price: 450,
      autoVerifyNurse: true,
    });
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid" });
    RadiologyWorkflowDb.invalidateCache();
    RadiologyWorkflowDb.startInvestigation(order.id, "Tech", "Suite 1");
    RadiologyWorkflowDb.markStudyDone(order.id, "Complete");

    assert.throws(
      () => {
        RadiologyWorkflowDb.finalizeReport(order.id, {
          findings: ["Finding"],
          impression: ["Impression"],
          finalizedBy: "Clerk Joe",
          finalizedRole: "Front Desk Clerk",
        });
      },
      /Unauthorized/,
      "Prevented unauthorized clerk from signing diagnostic report"
    );

    // 2. Persisted state survives cache invalidation
    RadiologyWorkflowDb.invalidateCache();
    const retrieved = RadiologyWorkflowDb.getStudyById(order.id);
    assert.ok(retrieved);
    assert.equal(retrieved.normalizedStatus, "DONE");

    // 3. Suite and priority assignment update
    const reassigned = RadiologyWorkflowDb.updateStudyAssignment(order.id, {
      room: "CT Suite 2",
      priority: "STAT",
    });
    assert.equal(reassigned.room, "CT Suite 2");
    assert.equal(reassigned.priority, "STAT");
  });

  it("Scenario 9 — Scanning Operations: Send to Reporting Workspace workflow", () => {
    const testUmr1 = `UMR-SEND1-${Date.now()}`;
    const testUmr2 = `UMR-SEND2-${Date.now()}`;

    // Create 2 examination orders
    const order1 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Kavita Rao",
      umr: testUmr1,
      studyName: "Ultrasound Pelvis",
      modality: "US",
      priority: "Routine",
      doctorName: "Dr. Sunita Sharma",
      indication: "Lower abdominal pain",
      price: 900,
      autoVerifyNurse: true,
    });

    const order2 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Arjun Verma",
      umr: testUmr2,
      studyName: "MRI Lumbar Spine",
      modality: "MR",
      priority: "Routine",
      doctorName: "Dr. Vikram Seth",
      indication: "L4-L5 disc protrusion evaluation",
      price: 4500,
      autoVerifyNurse: true,
    });

    BillingDatabase.updateRadiologyStudy(order1.id, { paymentStatus: "Paid" });
    BillingDatabase.updateRadiologyStudy(order2.id, { paymentStatus: "Paid" });
    RadiologyWorkflowDb.invalidateCache();

    // 1. Order1 cannot be sent to reporting before scan acquisition is completed
    assert.throws(
      () => {
        RadiologyWorkflowDb.sendInvestigationToReporting(order1.id, "Tech Alex");
      },
      /Cannot send examination to Reporting Workspace/,
      "Blocked sending incomplete scan to reporting workspace"
    );

    // 2. Start and complete scanning for Order1
    RadiologyWorkflowDb.startInvestigation(order1.id, "Tech Alex", "US Suite");
    const completed1 = RadiologyWorkflowDb.markStudyDone(order1.id, "Pelvic views acquired.");
    assert.equal(completed1.normalizedStatus, "DONE");

    // 3. Send Order1 to Reporting Workspace
    const sent1 = RadiologyWorkflowDb.sendInvestigationToReporting(order1.id, "Tech Alex");
    assert.equal(sent1.status, "Sent for Reporting");
    assert.equal(sent1.sentToReporting, true);
    assert.ok(sent1.sentToReportingAt);
    assert.equal(sent1.sentToReportingBy, "Tech Alex");
    assert.equal(sent1.normalizedStatus, "DONE");
    assert.equal(sent1.normalizedReportStatus, "Pending Report");

    // 4. Verify persisted state survives cache invalidation
    RadiologyWorkflowDb.invalidateCache();
    const retrieved1 = RadiologyWorkflowDb.getStudyById(order1.id);
    assert.ok(retrieved1);
    assert.equal(retrieved1.status, "Sent for Reporting");
    assert.equal(retrieved1.sentToReporting, true);

    // 5. Verify presence in Reporting Workspace queue
    const reportingWorklist = RadiologyWorkflowDb.getStudies().filter((s) => s.normalizedStatus === "DONE");
    const foundInReporting = reportingWorklist.find((s) => s.id === order1.id);
    assert.ok(foundInReporting, "Sent study appears in reporting queue");
    assert.equal(foundInReporting.normalizedReportStatus, "Pending Report");
    assert.notEqual(foundInReporting.normalizedReportStatus, "Finalized");

    // 6. Verify safe resend without duplicate records
    const beforeCount = RadiologyWorkflowDb.getStudies().length;
    const resent1 = RadiologyWorkflowDb.sendInvestigationToReporting(order1.id, "Tech Alex", "Resend data");
    const afterCount = RadiologyWorkflowDb.getStudies().length;
    assert.equal(beforeCount, afterCount, "Resend does not duplicate records");
    assert.equal(resent1.id, order1.id);

    // 7. Verify sent study is excluded from active scanning queue
    const scanningOperationsWorklist = RadiologyWorkflowDb.getStudies().filter(
      (s) => !s.sentToReporting && s.status !== "Sent for Reporting"
    );
    assert.ok(!scanningOperationsWorklist.some((s) => s.id === order1.id), "Sent patient does not appear in scanning operations worklist");
    assert.ok(scanningOperationsWorklist.some((s) => s.id === order2.id), "Remaining pending patient appears in scanning operations worklist");
  });

  it("Scenario 10 — Reporting Workspace: Pending Report -> Draft -> Submitted for Review -> Radiologist Finalize", () => {
    const umr = `UMR-REP-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patient: "Reporting Lifecycle Test",
      mrn: `MRN-${Date.now()}`,
      umr,
      study: "CT Scan - Brain",
      modality: "CT",
      priority: "Routine",
      provider: "Dr. Neha Patel",
      room: "CT Suite 1",
    });

    // Pay and mark scan completed
    BillingDatabase.updateRadiologyStudy(order.id, {
      paymentStatus: "Paid",
      paidReceiptNo: `RCPT-REP-${Date.now()}`,
    });

    RadiologyWorkflowDb.startInvestigation(order.id, "Tech David", "CT Suite 1");
    RadiologyWorkflowDb.markInvestigationDone(order.id, "Tech David", "Standard brain CT completed");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech David");

    // 1. Initial Reporting Status is "Pending Report"
    RadiologyWorkflowDb.invalidateCache();
    let study = RadiologyWorkflowDb.getStudyById(order.id)!;
    assert.ok(study);
    assert.equal(study.normalizedReportStatus, "Pending Report");

    // 2. Open examination and save Draft
    const draftRes = RadiologyWorkflowDb.getOrInitializeReportDraft(order.id, "Tech David", "Radiology Technician");
    assert.ok(draftRes);
    assert.equal(draftRes.study.id, order.id);

    RadiologyWorkflowDb.saveReportDraft(
      order.id,
      {
        indication: "Trauma evaluation",
        technique: "Non-contrast axial CT brain sections",
        findings: ["No acute intracranial hemorrhage.", "Midline structures are preserved."],
        impression: ["Normal non-contrast CT brain study."],
        comparison: "None",
        radiologist: "Tech David",
        role: "Radiology Technician",
      }
    );

    RadiologyWorkflowDb.invalidateCache();
    study = RadiologyWorkflowDb.getStudyById(order.id)!;
    assert.equal(study.normalizedReportStatus, "Draft");
    assert.equal(study.findings?.length, 2);

    // 3. Submit Report for Review
    RadiologyWorkflowDb.submitReportForReview(
      order.id,
      {
        indication: "Trauma evaluation",
        technique: "Non-contrast axial CT brain sections",
        findings: ["No acute intracranial hemorrhage.", "Midline structures are preserved."],
        impression: ["Normal non-contrast CT brain study."],
        comparison: "None",
      },
      undefined,
      "Tech David",
      "Radiology Technician"
    );

    RadiologyWorkflowDb.invalidateCache();
    study = RadiologyWorkflowDb.getStudyById(order.id)!;
    assert.equal(study.normalizedReportStatus, "Submitted for Review");
    assert.equal(study.submittedForReviewBy, "Tech David");
    assert.ok(study.submittedForReviewAt);

    // 4. Unauthorized finalization rejection (Technician cannot finalize)
    assert.throws(
      () => {
        RadiologyWorkflowDb.finalizeReport(
          order.id,
          {
            findings: ["No acute hemorrhage"],
            impression: ["Normal study"],
            finalizedBy: "Tech David",
            finalizedRole: "Radiology Technician",
          }
        );
      },
      /Unauthorized/i,
      "Ordinary technician must be prohibited from finalizing reports"
    );

    // 5. Authorized Radiologist finalization
    const finalized = RadiologyWorkflowDb.finalizeReport(
      order.id,
      {
        indication: "Trauma evaluation",
        technique: "Non-contrast axial CT brain sections",
        findings: ["No acute intracranial hemorrhage.", "Midline structures are normal.", "Calvarium is intact."],
        impression: ["Unremarkable non-contrast head CT examination."],
        finalizedBy: "Dr. Vikram Seth, MD",
        finalizedRole: "Senior Radiologist",
      }
    );

    RadiologyWorkflowDb.invalidateCache();
    study = RadiologyWorkflowDb.getStudyById(order.id)!;
    assert.equal(study.normalizedReportStatus, "Finalized");
    assert.equal(study.finalizedBy, "Dr. Vikram Seth, MD");
    assert.ok(study.finalizedAt);
    assert.equal(study.findings?.length, 3);
  });
});

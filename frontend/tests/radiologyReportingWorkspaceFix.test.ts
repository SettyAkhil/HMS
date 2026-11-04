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
import { RadiologyTemplateDatabase, parseSectionsFromContent, isUnwantedTicketRoutingContent } from "../src/services/radiologyTemplateDb";

describe("Radiology Reporting Workspace Fix — End-to-End Test Suite", () => {
  beforeEach(() => {
    RadiologyWorkflowDb.invalidateCache();
  });

  it("1. Scanning Operations to Reporting Workspace: Send to Reporting marks examination as Pending Report", () => {
    const umr = `UMR-REP-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Arjun Verma",
      umr,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      priority: "Routine",
      doctorName: "Dr. Anjali Rao",
      department: "Internal Medicine",
      indication: "Chest discomfort and persistent cough.",
      price: 500,
      room: "X-Ray Room 2",
    });

    // Mark as paid
    BillingDatabase.updateRadiologyStudy(order.id, {
      paymentStatus: "Paid",
      isPaid: true,
      paidReceiptNo: `RCP-${Date.now()}`,
    });

    // Start & complete scan
    RadiologyWorkflowDb.startInvestigation(order.id, "Tech Sharma", "Suite 2");
    RadiologyWorkflowDb.markStudyDone(order.id, "Completed acquisition cleanly.", "Tech Sharma", "Technician");

    // Send to Reporting Workspace
    const sentStudy = RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech Sharma", "Technician");
    assert.equal(sentStudy.sentToReporting, true);
    assert.equal(sentStudy.reportStatus, "Pending Report");

    // Verify it is retrieved in reporting workspace
    const reportList = RadiologyWorkflowDb.getReportingStudies();
    const found = reportList.find((s) => s.id === order.id);
    assert.ok(found, "Study should appear in Reporting Workspace list");
    assert.equal(found?.normalizedReportStatus, "Pending Report");
  });

  it("2. Template Auto-Matching: Matches Chest X-Ray, MR Scan, CT Scan, and USG templates with real sections and fields", () => {
    // 2a. Chest X-Ray
    const xrTemplate = RadiologyTemplateDatabase.getTemplateForStudy("Chest X-Ray PA/Lateral", "All");
    assert.ok(xrTemplate, "Should find Chest X-Ray template");
    assert.ok(xrTemplate!.sections.length >= 4, "Chest X-Ray should have multiple anatomical sections");
    const lungsSec = xrTemplate!.sections.find((s) => s.title.toLowerCase().includes("lung"));
    assert.ok(lungsSec, "Should have Lungs section");
    assert.ok(lungsSec!.fields.length > 0, "Lungs section should have fields");

    // 2b. CT Brain
    const ctTemplate = RadiologyTemplateDatabase.getTemplateForStudy("NCCT Head / Brain", "All");
    assert.ok(ctTemplate, "Should find CT Head template");
    assert.ok(ctTemplate!.sections.length >= 3, "CT Head should have sections");

    // 2c. MRI Lumbar Spine
    const mrTemplate = RadiologyTemplateDatabase.getTemplateForStudy("MRI Lumbar Spine", "All");
    assert.ok(mrTemplate, "Should find MRI Lumbar Spine template");
    assert.ok(mrTemplate!.sections.length >= 3, "MRI Lumbar Spine should have sections");

    // 2d. USG Abdomen
    const usTemplate = RadiologyTemplateDatabase.getTemplateForStudy("USG Whole Abdomen", "Male");
    assert.ok(usTemplate, "Should find USG Abdomen template");
    assert.ok(usTemplate!.sections.length >= 3, "USG Abdomen should have sections");
  });

  it("3. Missing Template Handling: If no matching template exists, getTemplateForStudy returns null and warns cleanly", () => {
    const unknownStudy = "Unconfigured Experimental PET-CT Hologram";
    const tpl = RadiologyTemplateDatabase.getTemplateForStudy(unknownStudy, "All");
    assert.ok(!tpl, "Should return null or undefined instead of silently loading an unrelated template");
  });

  it("4. Text/File Template Parsing: parseSectionsFromContent parses headings and findings into structured sections", () => {
    const rawContent = `CHEST RADIOGRAPH (PA VIEW)
TECHNIQUE: Standard upright PA view of the chest.
FINDINGS:
LUNGS: Normal bronchovascular markings. No consolidation.
HEART: Normal cardiothoracic ratio.
PLEURA: Costophrenic sulci are clear.
IMPRESSION:
No acute cardiopulmonary disease.`;

    const parsed = parseSectionsFromContent(rawContent);
    assert.ok(parsed.length >= 3, "Should parse at least 3 distinct sections");
    const lungSec = parsed.find((s) => s.title.toUpperCase().includes("LUNG"));
    assert.ok(lungSec, "Should parse LUNGS section");
    assert.ok(lungSec!.fields.length > 0, "Parsed section should create editable fields");
  });

  it("5. Draft & Review Lifecycle: Pending Report -> Draft -> Submitted for Review -> Finalized", () => {
    const umr = `UMR-LIFECYCLE-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Sunita Roy",
      umr,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      priority: "Urgent",
      doctorName: "Dr. Rajiv Menon",
      department: "Cardiology",
      indication: "Dyspnea on exertion.",
      price: 600,
    });

    BillingDatabase.updateRadiologyStudy(order.id, {
      paymentStatus: "Paid",
      isPaid: true,
      paidReceiptNo: `RCPT-${Date.now()}`,
    });

    RadiologyWorkflowDb.startInvestigation(order.id, "Tech Priya", "Suite 1");
    RadiologyWorkflowDb.markStudyDone(order.id, "Optimal contrast and positioning.", "Tech Priya", "Technician");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech Priya", "Technician");

    // 5a. Save Draft
    const savedDraft = RadiologyWorkflowDb.saveReportDraft(
      order.id,
      {
        findings: ["Lungs: Clear without focal consolidation.", "Heart: Normal cardiac silhouette."],
        impression: ["No active cardiopulmonary disease."],
        technique: "Standard PA view.",
        indication: "Dyspnea on exertion.",
        fieldValues: {
          f_lungs: "Clear without focal consolidation.",
          f_pleura: "Angles sharp and clear.",
        },
        templateId: "rad_tpl_xr_chest_v1",
        templateName: "Chest X-Ray PA/Lateral",
      },
      "Tech Priya",
      "Technician"
    );

    assert.equal(savedDraft.reportStatus, "Draft");
    assert.equal(savedDraft.findings?.length, 2);
    assert.equal(savedDraft.fieldValues?.f_lungs, "Clear without focal consolidation.");

    // 5b. Submit for Review
    const submitted = RadiologyWorkflowDb.submitReportForReview(
      order.id,
      {
        findings: savedDraft.findings,
        impression: savedDraft.impression,
        technique: savedDraft.technique,
        indication: savedDraft.indication,
        fieldValues: savedDraft.fieldValues,
        templateId: savedDraft.templateId,
        templateName: savedDraft.templateName,
      },
      "Tech Priya",
      "Technician"
    );

    assert.equal(submitted.reportStatus, "Submitted for Review");
    assert.ok(submitted.submittedForReviewAt);
    assert.equal(submitted.submittedForReviewBy, "Tech Priya");

    // 5c. Authorization Gate: Non-radiologist (Technician) cannot finalize
    assert.throws(
      () => {
        RadiologyWorkflowDb.finalizeReport(
          order.id,
          {
            findings: submitted.findings,
            impression: submitted.impression,
          },
          "Tech Priya",
          "Technician"
        );
      },
      /Only credentialed Radiologists or authorized Physicians/i,
      "Technician should be blocked from finalizing report"
    );

    // 5d. Authorized Radiologist Finalizes Report
    const finalized = RadiologyWorkflowDb.finalizeReport(
      order.id,
      {
        findings: submitted.findings,
        impression: submitted.impression,
      },
      "Dr. Sandeep Kulkarni, MD",
      "Radiologist"
    );

    assert.equal(finalized.reportStatus, "Finalized");
    assert.equal(finalized.finalizedBy, "Dr. Sandeep Kulkarni, MD");
    assert.equal(finalized.finalizedRole, "Radiologist");
    assert.ok(finalized.finalizedAt);

    // 5e. Persistence across reloads: finalized report remains Finalized
    RadiologyWorkflowDb.invalidateCache();
    const reloaded = RadiologyWorkflowDb.getStudyById(order.id);
    assert.equal(reloaded?.reportStatus, "Finalized");
    assert.equal(reloaded?.finalizedBy, "Dr. Sandeep Kulkarni, MD");
  });

  it("6. Cross-Patient Data Isolation: Independent studies retain their own field values without leaking", () => {
    const order1 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient One",
      umr: `UMR-P1-${Date.now()}`,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      price: 500,
    });

    const order2 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Two",
      umr: `UMR-P2-${Date.now()}`,
      studyName: "NCCT Head / Brain",
      modality: "CT",
      price: 2500,
    });

    RadiologyWorkflowDb.saveReportDraft(
      order1.id,
      {
        findings: ["Patient One specific lung findings"],
        impression: ["P1 Impression"],
        fieldValues: { custom_note: "Patient One observation notes" },
      },
      "Tech A",
      "Technician"
    );

    RadiologyWorkflowDb.saveReportDraft(
      order2.id,
      {
        findings: ["Patient Two specific brain findings"],
        impression: ["P2 Impression"],
        fieldValues: { custom_note: "Patient Two observation notes" },
      },
      "Tech B",
      "Technician"
    );

    const study1 = RadiologyWorkflowDb.getStudyById(order1.id);
    const study2 = RadiologyWorkflowDb.getStudyById(order2.id);

    assert.notEqual(study1?.fieldValues?.custom_note, study2?.fieldValues?.custom_note);
    assert.equal(study1?.fieldValues?.custom_note, "Patient One observation notes");
    assert.equal(study2?.fieldValues?.custom_note, "Patient Two observation notes");
    assert.equal(study1?.study, "Chest X-Ray PA/Lateral");
    assert.equal(study2?.study, "NCCT Head / Brain");
  });

  it("7. Clear Report Draft: Clears draft report data and resets study reporting status", () => {
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Draft Reset Test Patient",
      umr: `UMR-RESET-${Date.now()}`,
      studyName: "USG Whole Abdomen",
      modality: "US",
      price: 1200,
    });

    RadiologyWorkflowDb.saveReportDraft(
      order.id,
      {
        findings: ["Draft findings before clear"],
        impression: ["Draft impression"],
        fieldValues: { organ_liver: "Normal" },
      },
      "Tech Reset",
      "Technician"
    );

    const draftBefore = RadiologyWorkflowDb.getStudyById(order.id);
    assert.equal(draftBefore?.reportStatus, "Draft");
    assert.equal(draftBefore?.findings?.[0], "Draft findings before clear");

    // Execute clearReportDraft
    RadiologyTemplateDatabase.clearReportDraft(order.id);
    RadiologyWorkflowDb.invalidateCache();

    const studyAfter = RadiologyWorkflowDb.getStudyById(order.id);
    assert.equal(studyAfter?.reportStatus, "Pending Report");
    assert.equal(studyAfter?.findings?.length, 0);
    assert.equal(studyAfter?.impression?.length, 0);
  });

  it("8. Unwanted Content Filter: Correctly identifies non-radiology ticket-routing text and preserves clinical text", () => {
    // Unwanted non-radiology test documents
    assert.ok(isUnwantedTicketRoutingContent("AI Ticket Routing System"));
    assert.ok(isUnwantedTicketRoutingContent("MongoDB Atlas & ML Engine"));
    assert.ok(isUnwantedTicketRoutingContent("Backend API"));
    assert.ok(isUnwantedTicketRoutingContent("Observations for HTTPS"));
    assert.ok(isUnwantedTicketRoutingContent("Agent Workload Management"));

    // Legitimate clinical findings must NOT be flagged
    assert.ok(!isUnwantedTicketRoutingContent("Lungs are clear bilaterally."));
    assert.ok(!isUnwantedTicketRoutingContent("No focal consolidation, pneumothorax or pleural effusion."));
    assert.ok(!isUnwantedTicketRoutingContent("Cardiac size is within normal limits."));
    assert.ok(!isUnwantedTicketRoutingContent("Normal grey-white matter differentiation."));
    assert.ok(!isUnwantedTicketRoutingContent("NCCT Head / Brain"));
    assert.ok(!isUnwantedTicketRoutingContent("Impression: Normal study."));
  });

  it("9. Clean Section Parsing: Generates concise observations without redundant repetitive titles", () => {
    const sampleRaw = `
TECHNIQUE: Standard PA view.
FINDINGS:
Lungs are clear.
IMPRESSION:
No acute abnormality.
    `.trim();

    const sections = parseSectionsFromContent(sampleRaw);
    assert.ok(sections.length >= 2);
    sections.forEach((sec) => {
      // Ensure no redundant "Observations for ${title}" in instruction or label
      assert.ok(!sec.instructions?.toLowerCase().startsWith("observations for"));
      sec.fields?.forEach((f) => {
        assert.ok(!f.label.toLowerCase().startsWith("observations for"));
      });
    });
  });

  it("10. Strict Finalized Queue Separation: Active queue excludes finalized reports, counts.all = pending + draft + submitted", () => {
    const umrPending = `UMR-ACT-PEND-${Date.now()}`;
    const umrDraft = `UMR-ACT-DRAFT-${Date.now()}`;
    const umrSubmitted = `UMR-ACT-SUB-${Date.now()}`;
    const umrFinalized = `UMR-ACT-FIN-${Date.now()}`;

    // 1. Pending study
    const pendingOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Pending",
      umr: umrPending,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      price: 500,
    });
    BillingDatabase.updateRadiologyStudy(pendingOrder.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(pendingOrder.id, "Done", "Tech A");
    RadiologyWorkflowDb.sendInvestigationToReporting(pendingOrder.id, "Tech A");

    // 2. Draft study
    const draftOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Draft",
      umr: umrDraft,
      studyName: "NCCT Head / Brain",
      modality: "CT",
      price: 2500,
    });
    BillingDatabase.updateRadiologyStudy(draftOrder.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(draftOrder.id, "Done", "Tech A");
    RadiologyWorkflowDb.sendInvestigationToReporting(draftOrder.id, "Tech A");
    RadiologyWorkflowDb.saveReportDraft(draftOrder.id, { findings: ["Findings in draft"], impression: ["Draft imp"] }, "Tech A");

    // 3. Submitted study
    const subOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Submitted",
      umr: umrSubmitted,
      studyName: "MRI Lumbar Spine",
      modality: "MR",
      price: 4500,
    });
    BillingDatabase.updateRadiologyStudy(subOrder.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(subOrder.id, "Done", "Tech A");
    RadiologyWorkflowDb.sendInvestigationToReporting(subOrder.id, "Tech A");
    RadiologyWorkflowDb.submitReportForReview(subOrder.id, { findings: ["Findings submitted"], impression: ["Submitted imp"] }, "Tech A");

    // 4. Finalized study
    const finOrder = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Finalized",
      umr: umrFinalized,
      studyName: "USG Whole Abdomen",
      modality: "US",
      price: 1500,
    });
    BillingDatabase.updateRadiologyStudy(finOrder.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(finOrder.id, "Done", "Tech A");
    RadiologyWorkflowDb.sendInvestigationToReporting(finOrder.id, "Tech A");
    RadiologyWorkflowDb.finalizeReport(
      finOrder.id,
      { findings: ["USG Normal"], impression: ["Normal study"] },
      "Dr. Sandeep Kulkarni, MD",
      "Radiologist"
    );

    // Verify reporting queue behavior
    RadiologyWorkflowDb.invalidateCache();
    const allReporting = RadiologyWorkflowDb.getReportingStudies();
    
    // In our component logic, Active Queue is filtered by excluding cat === 'finalized'
    const activeQueue = allReporting.filter((s) => s.normalizedReportStatus !== "Finalized");
    const finalizedQueue = allReporting.filter((s) => s.normalizedReportStatus === "Finalized");

    assert.ok(activeQueue.some((s) => s.id === pendingOrder.id), "Pending should be in active queue");
    assert.ok(activeQueue.some((s) => s.id === draftOrder.id), "Draft should be in active queue");
    assert.ok(activeQueue.some((s) => s.id === subOrder.id), "Submitted should be in active queue");
    assert.ok(!activeQueue.some((s) => s.id === finOrder.id), "Finalized must NOT be in active queue");
    assert.ok(finalizedQueue.some((s) => s.id === finOrder.id), "Finalized must appear in Finalized view");

    // Count consistency matching RadiologyReportingView logic
    const getReportingCategory = (s: any) => {
      if (s.normalizedReportStatus === "Finalized") return "finalized";
      if (s.normalizedReportStatus === "Submitted for Review") return "submitted";
      if (s.normalizedReportStatus === "Draft") return "draft";
      return "pending";
    };

    const pendingCount = allReporting.filter((s) => getReportingCategory(s) === "pending").length;
    const draftCount = allReporting.filter((s) => getReportingCategory(s) === "draft").length;
    const submittedCount = allReporting.filter((s) => getReportingCategory(s) === "submitted").length;
    const finalizedCount = allReporting.filter((s) => getReportingCategory(s) === "finalized").length;
    const activeCount = pendingCount + draftCount + submittedCount;

    assert.equal(activeQueue.length, activeCount, "Active count must strictly equal pending + draft + submitted");
    assert.ok(finalizedCount >= 1, "Finalized count must include finalized study");
  });

  it("11. Finalized Reports Module Preservation: Finalized report retains data, doctor name, and timestamps across reloads", () => {
    const umr = `UMR-FIN-PERSIST-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Meenakshi Sundaram",
      umr,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      price: 500,
    });
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(order.id, "Acquired cleanly.", "Tech Raman");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech Raman");

    const finalized = RadiologyWorkflowDb.finalizeReport(
      order.id,
      {
        findings: ["Lungs clear bilaterally.", "Cardiothoracic ratio normal."],
        impression: ["No active disease."],
        indication: "Pre-operative evaluation.",
        technique: "Standard PA view.",
      },
      "Dr. Sandeep Kulkarni, MD",
      "Radiologist"
    );

    assert.equal(finalized.reportStatus, "Finalized");
    assert.equal(finalized.finalizedBy, "Dr. Sandeep Kulkarni, MD");
    assert.equal(finalized.finalizedRole, "Radiologist");
    assert.ok(finalized.finalizedAt);
    assert.equal(finalized.findings?.length, 2);

    // Simulate page refresh / cache clear
    RadiologyWorkflowDb.invalidateCache();
    const fetched = RadiologyWorkflowDb.getStudyById(order.id);
    assert.equal(fetched?.reportStatus, "Finalized");
    assert.equal(fetched?.finalizedBy, "Dr. Sandeep Kulkarni, MD");
    assert.equal(fetched?.finalizedRole, "Radiologist");
    assert.equal(fetched?.findings?.[0], "Lungs clear bilaterally.");
  });

  it("12. Audited Amendment Workflow: amendFinalizedReport preserves Finalized status and adds audited amendment addendum", () => {
    const umr = `UMR-AMEND-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Harish Rao",
      umr,
      studyName: "NCCT Head / Brain",
      modality: "CT",
      price: 2500,
    });
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(order.id, "CT done.", "Tech Raman");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech Raman");

    RadiologyWorkflowDb.finalizeReport(
      order.id,
      {
        findings: ["No acute hemorrhage."],
        impression: ["Normal brain CT."],
      },
      "Dr. Sandeep Kulkarni, MD",
      "Radiologist"
    );

    // Perform audited amendment (e.g. from RadiologyFinalizedView)
    const amended = RadiologyWorkflowDb.amendFinalizedReport(
      order.id,
      {
        amendmentReason: "Additional clinical history of head trauma provided by attending physician.",
        findings: ["No acute hemorrhage.", "Incidental small arachnoid cyst in anterior temporal fossa."],
        impression: ["Normal brain parenchyma. Small incidental arachnoid cyst."],
      },
      "Dr. Sandeep Kulkarni, MD",
      "Radiologist"
    );

    assert.equal(amended.reportStatus, "Finalized", "Status must remain Finalized, not revert to Draft");
    assert.ok(amended.amendments && amended.amendments.length > 0, "Must record amendment in audited list");
    assert.equal(amended.amendments[0].reason, "Additional clinical history of head trauma provided by attending physician.");
    assert.equal(amended.amendments[0].amendedBy, "Dr. Sandeep Kulkarni, MD");
    assert.ok(amended.amendments[0].amendedAt || amended.amendments[0].timestamp);
    assert.equal(amended.findings?.length, 2);
  });

  it("13. Finalization Permissions Gate: Non-radiologist cannot finalize, only credentialed Radiologist or Doctor", () => {
    const umr = `UMR-AUTH-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Auth Check Patient",
      umr,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      price: 500,
    });
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(order.id, "Done", "Tech A");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech A");

    // Technician role should throw
    assert.throws(() => {
      RadiologyWorkflowDb.finalizeReport(
        order.id,
        { findings: ["Findings"], impression: ["Impression"] },
        "Tech Suresh",
        "Radiology Technician"
      );
    }, /Only credentialed Radiologists or authorized Physicians/i);

    // Front Desk / Billing role should throw
    assert.throws(() => {
      RadiologyWorkflowDb.finalizeReport(
        order.id,
        { findings: ["Findings"], impression: ["Impression"] },
        "Staff Ramesh",
        "Billing Officer"
      );
    }, /Only credentialed Radiologists or authorized Physicians/i);

    // Radiologist role succeeds
    const finalized = RadiologyWorkflowDb.finalizeReport(
      order.id,
      { findings: ["Normal chest"], impression: ["No acute disease"] },
      "Dr. Ananya Reddy",
      "Consultant Radiologist"
    );
    assert.equal(finalized.reportStatus, "Finalized");
    assert.equal(finalized.finalizedBy, "Dr. Ananya Reddy");
  });

  it("14. Template Matching & Name Reflection: Matches by templateName and falls back cleanly to Draft/Inactive templates", () => {
    // Save a custom template draft
    const customTpl = RadiologyTemplateDatabase.saveImportedTemplateDraft({
      templateName: "High-Resolution Temporal Bone CT",
      testName: "CT Temporal Bones Special Protocol",
      modality: "CT",
      originalFileDataUrl: "data:application/pdf;base64,sample",
      originalFileName: "temporal_bones.pdf",
      originalFileType: "PDF",
      originalFileSize: 1024,
      reconstructedDocument: {
        rawText: "FINDINGS:\n• Mastoid air cells are well pneumatised.\n• Ossicular chain is intact.\nIMPRESSION:\nNormal high-resolution temporal bone CT study.",
        fullExtractedText: "FINDINGS:\n• Mastoid air cells are well pneumatised.\n• Ossicular chain is intact.\nIMPRESSION:\nNormal high-resolution temporal bone CT study.",
        pages: [],
        sections: [],
        tables: [],
        placeholders: [],
        detectedExamName: "High-Resolution Temporal Bone CT",
        detectedModality: "CT",
        originalFileName: "temporal_bones.pdf",
        originalFileType: "PDF",
        originalFileSize: 1024,
        originalFileDataUrl: "data:application/pdf;base64,sample",
        extractionConfidence: 99,
        extractedAt: new Date().toISOString(),
        warnings: [],
      },
    });

    assert.ok(customTpl.id, "Saved template draft should have an ID");
    assert.equal(customTpl.templateName, "High-Resolution Temporal Bone CT");

    // Check matching by exact templateName
    const matchedByTplName = RadiologyTemplateDatabase.getTemplateForStudy("High-Resolution Temporal Bone CT", "All");
    assert.ok(matchedByTplName, "Should match template by templateName");
    assert.equal(matchedByTplName!.id, customTpl.id);

    // Check matching by testName
    const matchedByTestName = RadiologyTemplateDatabase.getTemplateForStudy("CT Temporal Bones Special Protocol", "All");
    assert.ok(matchedByTestName, "Should match template by testName");
    assert.equal(matchedByTestName!.id, customTpl.id);

    // Verify sections have default findings populated
    assert.ok(customTpl.sections.length > 0, "Template should have parsed sections");
    const findingsField = customTpl.sections.flatMap((s) => s.fields || []).find((f) => f.defaultValue);
    assert.ok(findingsField, "Template section field should have defaultValue");
  });

  it("15. Report Draft Initialization: Properly resolves template for study and preserves draft data", () => {
    const umr = `UMR-TPL-REFLECT-${Date.now()}`;
    const order = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Meera Krishnan",
      umr,
      studyName: "Chest X-Ray PA/Lateral",
      modality: "XR",
      price: 500,
    });
    BillingDatabase.updateRadiologyStudy(order.id, { paymentStatus: "Paid", isPaid: true });
    RadiologyWorkflowDb.markStudyDone(order.id, "Acquisition optimal", "Tech Sharma");
    RadiologyWorkflowDb.sendInvestigationToReporting(order.id, "Tech Sharma");

    const draft = RadiologyWorkflowDb.getOrInitializeReportDraft(order.id, "Dr. Gupta", "Radiologist");
    assert.ok(draft.template, "Should auto-resolve matching approved template for Chest X-Ray");
    assert.ok(draft.template.sections && draft.template.sections.length >= 4, "Template should contain anatomical sections");
  });
});




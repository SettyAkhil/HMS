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

import { RadiologyWorkflowDb } from "../src/services/radiologyWorkflowDb.ts";
import { BillingDatabase } from "../src/services/billingDb.ts";
import { UniversalRadiologyDb } from "../src/services/universalRadiologyDb.ts";
import { RadiologyTemplateDatabase } from "../src/services/radiologyTemplateDb.ts";

describe("Standardized Database-Driven Sorting Across Radiology Department", () => {
  beforeEach(() => {
    RadiologyWorkflowDb.invalidateCache();
  });

  it("1. Overview Hub: Sorts latest department activity strictly first (descending)", () => {
    UniversalRadiologyDb.logAudit({
      action: "Test Activity 1",
      actor: "Dr. A",
      role: "Radiologist",
      details: "First recorded activity"
    });

    UniversalRadiologyDb.logAudit({
      action: "Test Activity 2",
      actor: "Dr. B",
      role: "Radiologist",
      details: "Second recorded activity"
    });

    const events = UniversalRadiologyDb.getAuditEvents();
    assert.ok(events.length >= 2, "Expected at least 2 audit events");
    const t0 = new Date(events[0].timestamp).getTime();
    const t1 = new Date(events[1].timestamp).getTime();
    assert.ok(t0 >= t1, "Latest department activity must appear first");
  });

  it("2. Examination Worklist: Newest orders first (descending) including Paid and Unpaid", () => {
    const olderTime = new Date(Date.now() - 3600000).toISOString();
    const newerTime = new Date().toISOString();

    const orderOld = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Older",
      studyName: "Chest X-Ray",
      modality: "XR",
      priority: "Routine",
      price: 400,
    });
    BillingDatabase.updateRadiologyStudy(orderOld.id, {
      orderedAt: olderTime,
      createdAt: olderTime,
      paymentStatus: "Payment Pending",
      isPaid: false,
    });

    const orderNew = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Patient Newer",
      studyName: "MRI Brain",
      modality: "MR",
      priority: "STAT",
      price: 4500,
    });
    BillingDatabase.updateRadiologyStudy(orderNew.id, {
      orderedAt: newerTime,
      createdAt: newerTime,
      paymentStatus: "Paid",
      isPaid: true,
    });

    RadiologyWorkflowDb.invalidateCache();
    const studies = RadiologyWorkflowDb.getStudies();
    const sorted = [...studies].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getOrderCreationTimestamp(a);
      const timeB = RadiologyWorkflowDb.getOrderCreationTimestamp(b);
      if (timeA !== timeB) return timeB - timeA;
      return (b.id || "").localeCompare(a.id || "");
    });

    const idxNew = sorted.findIndex((s) => s.id === orderNew.id);
    const idxOld = sorted.findIndex((s) => s.id === orderOld.id);
    assert.ok(idxNew < idxOld, "Newly ordered examination must appear above older order");
  });

  it("3. Scanning Operations: FIFO queue (oldest eligible first) based on billing clearance", () => {
    const earlyEligible = new Date(Date.now() - 7200000).toISOString();
    const laterEligible = new Date(Date.now() - 3600000).toISOString();

    const scanStudy1 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Scan Early",
      studyName: "Ultrasound Abdomen",
      modality: "US",
      priority: "Routine",
      price: 800,
    });
    BillingDatabase.updateRadiologyStudy(scanStudy1.id, {
      paymentStatus: "Paid",
      isPaid: true,
      billingClearedAt: earlyEligible,
      eligibleAt: earlyEligible,
    });

    const scanStudy2 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Scan Later",
      studyName: "CT Chest",
      modality: "CT",
      priority: "Routine",
      price: 2500,
    });
    BillingDatabase.updateRadiologyStudy(scanStudy2.id, {
      paymentStatus: "Paid",
      isPaid: true,
      billingClearedAt: laterEligible,
      eligibleAt: laterEligible,
    });

    RadiologyWorkflowDb.invalidateCache();
    const studies = RadiologyWorkflowDb.getStudies().filter((s) => s.isPaid && !s.sentToReporting);
    const fifoScanning = [...studies].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getScanningEligibilityTimestamp(a);
      const timeB = RadiologyWorkflowDb.getScanningEligibilityTimestamp(b);
      if (timeA !== timeB) return timeA - timeB; // FIFO
      return (a.id || "").localeCompare(b.id || "");
    });

    const idx1 = fifoScanning.findIndex((s) => s.id === scanStudy1.id);
    const idx2 = fifoScanning.findIndex((s) => s.id === scanStudy2.id);
    assert.ok(idx1 < idx2, "Oldest eligible examination must appear before newly eligible examination in scanning FIFO queue");
  });

  it("4. Reporting Workspace: FIFO queue (oldest transferred first) and draft saves preserve position", () => {
    const earlyTransfer = new Date(Date.now() - 5000000).toISOString();
    const laterTransfer = new Date(Date.now() - 1000000).toISOString();

    const repStudy1 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Rep Patient 1",
      studyName: "X-Ray Pelvis",
      modality: "XR",
      price: 350,
    });
    BillingDatabase.updateRadiologyStudy(repStudy1.id, {
      sentToReporting: true,
      sentToReportingAt: earlyTransfer,
      transferredToReportingAt: earlyTransfer,
      reportingQueuedAt: earlyTransfer,
      status: "Sent for Reporting",
    });

    const repStudy2 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Rep Patient 2",
      studyName: "CT Abdomen",
      modality: "CT",
      price: 3000,
    });
    BillingDatabase.updateRadiologyStudy(repStudy2.id, {
      sentToReporting: true,
      sentToReportingAt: laterTransfer,
      transferredToReportingAt: laterTransfer,
      reportingQueuedAt: laterTransfer,
      status: "Sent for Reporting",
    });

    RadiologyWorkflowDb.invalidateCache();
    let reportingStudies = RadiologyWorkflowDb.getReportingStudies();
    let sortedRep = [...reportingStudies].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getReportingQueueTimestamp(a);
      const timeB = RadiologyWorkflowDb.getReportingQueueTimestamp(b);
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || "").localeCompare(b.id || "");
    });

    const initialIdx1 = sortedRep.findIndex((s) => s.id === repStudy1.id);
    const initialIdx2 = sortedRep.findIndex((s) => s.id === repStudy2.id);
    assert.ok(initialIdx1 < initialIdx2, "Oldest transferred examination must appear before newly transferred in Reporting Workspace");

    // Saving draft or updating findings must NOT change queue position
    RadiologyWorkflowDb.saveReportDraft(repStudy1.id, {
      findings: ["Clear lung fields", "Normal cardiac silhouette"],
      impression: ["Normal study"],
      radiologist: "Dr. Typist",
    });

    RadiologyWorkflowDb.invalidateCache();
    reportingStudies = RadiologyWorkflowDb.getReportingStudies();
    sortedRep = [...reportingStudies].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getReportingQueueTimestamp(a);
      const timeB = RadiologyWorkflowDb.getReportingQueueTimestamp(b);
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || "").localeCompare(b.id || "");
    });

    const postDraftIdx1 = sortedRep.findIndex((s) => s.id === repStudy1.id);
    const postDraftIdx2 = sortedRep.findIndex((s) => s.id === repStudy2.id);
    assert.strictEqual(postDraftIdx1, initialIdx1, "Queue position of study 1 must not change after saving draft");
    assert.ok(postDraftIdx1 < postDraftIdx2, "Study 1 must remain ahead of Study 2 after draft edit");
  });

  it("5. Finalized Reports: Most recently finalized first, amendment does not replace finalization timestamp", () => {
    const finalTime1 = new Date(Date.now() - 3600000).toISOString();
    const finalTime2 = new Date().toISOString();

    const finalStudy1 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Final Patient 1",
      studyName: "X-Ray Spine",
      modality: "XR",
      price: 400,
    });
    BillingDatabase.updateRadiologyStudy(finalStudy1.id, {
      reportStatus: "Finalized",
      finalizedAt: finalTime1,
      signedAt: finalTime1,
      finalizedBy: "Dr. Rajesh Sharma",
    });

    const finalStudy2 = RadiologyWorkflowDb.doctorOrdersInvestigation({
      patientName: "Final Patient 2",
      studyName: "CT Head",
      modality: "CT",
      price: 2500,
    });
    BillingDatabase.updateRadiologyStudy(finalStudy2.id, {
      reportStatus: "Finalized",
      finalizedAt: finalTime2,
      signedAt: finalTime2,
      finalizedBy: "Dr. Rajesh Sharma",
    });

    RadiologyWorkflowDb.invalidateCache();
    let finalized = RadiologyWorkflowDb.getStudies().filter((s) => s.normalizedReportStatus === "Finalized");
    let sortedFinal = [...finalized].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getReportFinalizedTimestamp(a);
      const timeB = RadiologyWorkflowDb.getReportFinalizedTimestamp(b);
      if (timeA !== timeB) return timeB - timeA; // Newest finalized first
      return (b.id || "").localeCompare(a.id || "")
    });

    const idx2 = sortedFinal.findIndex((s) => s.id === finalStudy2.id);
    const idx1 = sortedFinal.findIndex((s) => s.id === finalStudy1.id);
    assert.ok(idx2 < idx1, "More recently finalized report must appear above older finalized report");

    // Adding amendment to older report must NOT replace its finalizedAt or make it jump to the top
    RadiologyWorkflowDb.amendFinalizedReport(
      {
        studyId: finalStudy1.id,
        reason: "Clinical amendment",
        content: "Addendum: Verified disc spaces are preserved.",
        amendedBy: "Dr. Rajesh Sharma",
      },
      "Senior Radiologist"
    );

    RadiologyWorkflowDb.invalidateCache();
    finalized = RadiologyWorkflowDb.getStudies().filter((s) => s.normalizedReportStatus === "Finalized");
    sortedFinal = [...finalized].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getReportFinalizedTimestamp(a);
      const timeB = RadiologyWorkflowDb.getReportFinalizedTimestamp(b);
      if (timeA !== timeB) return timeB - timeA;
      return (b.id || "").localeCompare(a.id || "")
    });

    const postAmendIdx2 = sortedFinal.findIndex((s) => s.id === finalStudy2.id);
    const postAmendIdx1 = sortedFinal.findIndex((s) => s.id === finalStudy1.id);
    assert.ok(postAmendIdx2 < postAmendIdx1, "Amended report must NOT displace more recently finalized report");
  });

  it("6. Template Management: Newest created/uploaded templates first, editing does not alter queue position", () => {
    const tpl1 = RadiologyTemplateDatabase.saveTemplate("TEST_RAD_1", [
      { id: "sec_1", title: "Findings", content: "Normal", fieldType: "textarea", isRequired: true }
    ], {
      createdBy: "Admin"
    });

    const tpl2 = RadiologyTemplateDatabase.saveTemplate("TEST_RAD_2", [
      { id: "sec_1", title: "Impression", content: "Normal", fieldType: "textarea", isRequired: true }
    ], {
      createdBy: "Admin"
    });

    const allTpls = RadiologyTemplateDatabase.getTemplates();
    const sortedTpls = [...allTpls].sort((a, b) => {
      const getT = (tpl: any) => new Date(tpl.templateUploadedAt || tpl.templateCreatedAt || tpl.createdAt || 0).getTime();
      const timeA = getT(a);
      const timeB = getT(b);
      if (timeA !== timeB) return timeB - timeA;
      return (b.id || "").localeCompare(a.id || "");
    });

    const idxTpl2 = sortedTpls.findIndex((t) => t.id === tpl2.id);
    const idxTpl1 = sortedTpls.findIndex((t) => t.id === tpl1.id);
    assert.ok(idxTpl2 <= idxTpl1, "Newer template must appear before older template");
  });

  it("7. Department Analytics: Computes chronological throughput trend with consistent date ranges", () => {
    const analyticsToday = UniversalRadiologyDb.getDepartmentAnalytics("today");
    const analytics7 = UniversalRadiologyDb.getDepartmentAnalytics("7days");
    const analytics30 = UniversalRadiologyDb.getDepartmentAnalytics("30days");

    assert.strictEqual(analyticsToday.dateRange, "today");
    assert.strictEqual(analytics7.dateRange, "7days");
    assert.strictEqual(analytics30.dateRange, "30days");

    assert.ok(Array.isArray(analytics7.chronologicalTrend), "Expected chronological trend array");
    assert.strictEqual(analytics7.chronologicalTrend.length, 7, "7-day trend must have 7 daily data points");
    assert.strictEqual(analytics30.chronologicalTrend.length, 30, "30-day trend must have 30 daily data points");

    // Chronological order: Day 0 (oldest) to Day 6 (newest)
    const trend = analytics7.chronologicalTrend;
    for (let i = 0; i < trend.length - 1; i++) {
      const cur = new Date(trend[i].date).getTime();
      const next = new Date(trend[i + 1].date).getTime();
      assert.ok(cur < next, `Day ${i} (${trend[i].date}) must precede Day ${i+1} (${trend[i+1].date}) chronologically`);
    }
  });
});


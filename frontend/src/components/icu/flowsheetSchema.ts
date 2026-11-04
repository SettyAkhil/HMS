// Schema for the ICU daily flowsheet, transcribed section by section from the
// hospital's paper chart (combined_all_icu_charts_clear.pdf, 2 pages).
//
// The chart is declared as data rather than hand-built JSX because it holds
// several hundred cells: one record per patient per day, and the renderer in
// IcuFlowsheet.tsx walks this schema. Field labels, units and orderings are
// kept exactly as printed so a nurse moving from paper recognises every box.

export type FieldType = "text" | "number" | "date" | "time" | "select" | "textarea" | "check"

export type FieldDef = {
  key: string
  label: string
  type?: FieldType
  unit?: string
  options?: string[]
  placeholder?: string
  /** Grid columns this field spans in a "fields" section. */
  span?: 1 | 2 | 3 | 4
}

export type Section = /** Flat label/value form. */
{
  kind: "fields"
  id: string
  title: string
  note?: string
  cols?: 2 | 3 | 4
  fields: FieldDef[]
} /** Rows the nurse adds as needed (drug chart, lines, microbiology...). */ | {
  kind: "table"
  id: string
  title: string
  note?: string
  columns: FieldDef[]
  minRows?: number
} /** Fixed rows x fixed time-slot columns (special care, pupils, muscle power). */ | {
  kind: "grid"
  id: string
  title: string
  note?: string
  rows: string[]
  slotGroups: { label: string ;slots: string[] }[]
  cell?: FieldType
} /** One row per hour of the ICU day, columns grouped by parameter family. */ | {
  kind: "hourly"
  id: string
  title: string
  note?: string
  groups: { label: string ;fields: FieldDef[] }[]
} /** Hourly scored scale whose components sum to a total (GCS). */ | {
  kind: "scale"
  id: string
  title: string
  note?: string
  interval: 1 | 2
  components: {
    key: string
    label: string
    options: { label: string ;score: number }[]
  }[]
}

/** The ICU day runs 08:00 to 07:00 the next morning, as printed on the chart. */
export const HOURS: string[] = Array.from(
  { length: 24 },
  (_, i) => `${String((8 + i) % 24).padStart(2, "0")}:00`,
)
/** Two-hourly observations (muscle power, RASS). */
export const TWO_HOURLY: string[] = HOURS.filter((_, i) => i % 2 === 0)

const yesNo = ["", "Yes", "No"]

export const FLOWSHEET_SECTIONS: Section[] = [
  // ── Page 1, right column: chart header ────────────────────────────────────
  {
    kind: "fields",
    id: "admission",
    title: "Patient & ICU Details",
    cols: 4,
    fields: [
      { key: "primary_consultant", label: "Primary Consultant" },
      { key: "icu_consultant", label: "ICU Consultant" },
      { key: "day_in_icu", label: "Day in ICU", type: "number" },
      { key: "doa", label: "D.O.A.", type: "date" },
      { key: "dos", label: "D.O.S.", type: "date" },
      { key: "height", label: "Ht", unit: "cm", type: "number" },
      { key: "weight", label: "Wt", unit: "kg", type: "number" },
      {
        key: "blood_group",
        label: "Blood Group",
        type: "select",
        options: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      },
      { key: "diagnosis", label: "Diagnosis", span: 3 },
      { key: "allergy", label: "Allergy" },
      { key: "procedure", label: "Procedure / Operation", span: 4 },
      { key: "past_history", label: "Past History", type: "textarea", span: 2 },
      {
        key: "active_problem",
        label: "Active Problem",
        type: "textarea",
        span: 2,
      },
      { key: "diet_plan", label: "Diet Plan", type: "textarea", span: 4 },
    ],
  },
  {
    kind: "table",
    id: "day_plan",
    title: "Plan for Day / Non-drug Orders",
    note: "To be filled by doctors",
    minRows: 4,
    columns: [
      { key: "time", label: "Time", type: "time" },
      {
        key: "shift",
        label: "Shift",
        type: "select",
        options: ["", "Day", "Night"],
      },
      { key: "order", label: "Order", span: 2 },
      { key: "dr_sign", label: "Dr's Sign" },
      { key: "nurse_sign", label: "Nurse Sign" },
    ],
  },

  // ── Page 1: neurological observations ─────────────────────────────────────
  {
    kind: "scale",
    id: "gcs",
    title: "Glasgow Coma Scale (GCS)",
    note: "Recorded hourly. Total is calculated from Eyes + Verbal + Motor.",
    interval: 1,
    components: [
      {
        key: "eyes",
        label: "Eyes Open",
        options: [
          { label: "Spontaneously", score: 4 },
          { label: "To speech", score: 3 },
          { label: "To pain", score: 2 },
          { label: "No response", score: 1 },
        ],
      },
      {
        key: "verbal",
        label: "Verbal Response",
        options: [
          { label: "Oriented, Converses", score: 5 },
          { label: "Disoriented, Converses", score: 4 },
          { label: "Inappropriate words", score: 3 },
          { label: "Incomprehensible sounds", score: 2 },
          { label: "No response", score: 1 },
        ],
      },
      {
        key: "motor",
        label: "Motor Response",
        options: [
          { label: "Obeys verbal commands", score: 6 },
          { label: "Localises pain", score: 5 },
          { label: "Flexion withdraws, not able to localise pain", score: 4 },
          { label: "Flexion abnormal to pain", score: 3 },
          { label: "Extension to pain", score: 2 },
          { label: "No response", score: 1 },
        ],
      },
    ],
  },
  {
    kind: "hourly",
    id: "rass",
    title: "Agitation Score (RASS)",
    note: "Two-hourly. RASS -3 or less: decrease sedation to achieve -2 to 0. RASS +2 to +4: assess for pain, anxiety or delirium and treat to achieve -2 to 0.",
    groups: [
      {
        label: "RASS",
        fields: [
          {
            key: "score",
            label: "Score",
            type: "select",
            options: [
              "",
              "+4 Combative",
              "+3 Very agitated",
              "+2 Agitated",
              "+1 Restless",
              "0 Alert and calm",
              "-1 Drowsy",
              "-2 Light sedation",
              "-3 Moderate sedation",
              "-4 Deep sedation",
              "-5 Unarousable",
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "hourly",
    id: "pupils",
    title: "Pupils",
    note: "Size in mm (1-5). R = Reactive, NR = Non reactive.",
    groups: [
      {
        label: "Right",
        fields: [
          {
            key: "r_size",
            label: "Size",
            unit: "mm",
            type: "select",
            options: ["", "1", "2", "3", "4", "5"],
          },
          {
            key: "r_reaction",
            label: "Reaction",
            type: "select",
            options: ["", "R", "NR"],
          },
        ],
      },
      {
        label: "Left",
        fields: [
          {
            key: "l_size",
            label: "Size",
            unit: "mm",
            type: "select",
            options: ["", "1", "2", "3", "4", "5"],
          },
          {
            key: "l_reaction",
            label: "Reaction",
            type: "select",
            options: ["", "R", "NR"],
          },
        ],
      },
      {
        label: "",
        fields: [
          {
            key: "symmetry",
            label: "Symmetry",
            type: "select",
            options: ["", "Equal", "Unequal"],
          },
        ],
      },
    ],
  },
  {
    kind: "grid",
    id: "muscle_power",
    title: "Muscle Power Grade",
    note: "0 Total paralysis · 1 Palpable or visible contraction · 2 Full range of motion with gravity eliminated · 3 Full range of motion against gravity · 4 Full range of motion with decreased strength · 5 Normal strength · NT Not testable",
    rows: [
      "Power — Arm (R)",
      "Power — Arm (L)",
      "Power — Leg (R)",
      "Power — Leg (L)",
    ],
    slotGroups: [{ label: "Two-hourly", slots: TWO_HOURLY }],
  },

  // ── Page 1, left column: medication ───────────────────────────────────────
  {
    kind: "table",
    id: "drug_chart",
    title: "Drug Chart",
    note: "One row per drug. Record each administration time and the nurse who gave it.",
    minRows: 6,
    columns: [
      { key: "drug", label: "Drug", span: 2 },
      { key: "dose", label: "Dose" },
      {
        key: "route",
        label: "Route",
        type: "select",
        options: ["", "IV", "IM", "SC", "PO", "NG/RT", "PR", "Neb", "Topical"],
      },
      { key: "freq", label: "Freq" },
      { key: "times", label: "Times given", span: 2 },
      { key: "nurse_sign", label: "Nurse Sign" },
    ],
  },
  {
    kind: "table",
    id: "sos_medication",
    title: "SOS / STAT Medication",
    minRows: 3,
    columns: [
      { key: "time", label: "Time", type: "time" },
      { key: "drug", label: "Drug", span: 2 },
      { key: "dose", label: "Dose" },
      { key: "route", label: "Route" },
      { key: "nurse_sign", label: "Nurse Sign" },
    ],
  },
  {
    kind: "table",
    id: "high_risk_medication",
    title: "High Risk Medication",
    minRows: 3,
    columns: [
      { key: "time", label: "Time", type: "time" },
      { key: "drug", label: "Drug", span: 2 },
      { key: "dose", label: "Dose" },
      { key: "route", label: "Route" },
      { key: "double_check", label: "Double-checked by" },
    ],
  },

  // ── Page 1, middle column: skin, care and lines ───────────────────────────
  {
    kind: "fields",
    id: "pressure_ulcer",
    title: "Care of Pressure Ulcer",
    note: "Stage 1 Non-blanchable redness: two-hourly position change, keep back clean and dry, wrinkle-free bed surface, relieve pressure points. Stage 2 Blister or skin peeling: add foam dressing, assess healing daily, hydration and diet. Stage 3 Full thickness loss with subcutaneous fat visible: clean non-infected wound with normal saline and hydrocolloid dressing; infected wound with sterile water and silver-coated dressing. Stage 4 Full thickness loss with damage to muscle and bone / Unstageable: refer to reconstructive surgery. Deep tissue injury (purple or maroon localised area): follow Stage 1 measures.",
    cols: 3,
    fields: [
      {
        key: "stage",
        label: "Stage",
        type: "select",
        options: [
          "",
          "Stage 1",
          "Stage 2",
          "Stage 3",
          "Stage 4",
          "Unstageable",
          "Deep tissue injury",
        ],
      },
      {
        key: "category",
        label: "Category of Pressure Injury",
        type: "select",
        options: ["", "CAPU", "CAPI", "HAPU", "HAPI", "CIAD", "HIAD"],
      },
      { key: "site", label: "Site" },
      {
        key: "intervention_morning",
        label: "Intervention — Morning",
        type: "check",
      },
      {
        key: "intervention_evening",
        label: "Intervention — Evening",
        type: "check",
      },
      {
        key: "intervention_night",
        label: "Intervention — Night",
        type: "check",
      },
      {
        key: "pu_reported_on",
        label: "Pressure ulcer reported on",
        type: "date",
      },
      {
        key: "pu_relative_name",
        label: "Name & signature of relative",
        span: 2,
      },
      { key: "iad_reported_on", label: "IAD reported on", type: "date" },
      {
        key: "iad_relative_name",
        label: "Name & signature of relative",
        span: 2,
      },
      { key: "incharge_name", label: "Name & signature of incharge", span: 3 },
    ],
  },
  {
    kind: "grid",
    id: "special_care",
    title: "Special Care",
    note: "Tick or note the care given in each two-hour block.",
    rows: [
      "ET/TT Suctioning",
      "Steam Inhalation",
      "Chest PT",
      "Position Changing",
      "Restraint",
      "Skin Condition",
      "Bed Sore Dressing",
      "Eye Care",
      "Tracheostomy Tube Cuff Pressure",
      "Abd. Girth",
    ],
    slotGroups: [
      { label: "Morning", slots: ["8-10", "10-12", "12-14", "14-16"] },
      { label: "Evening", slots: ["16-18", "18-20", "20-22", "22-0"] },
      { label: "Night", slots: ["0-2", "2-4", "4-6", "6-8"] },
    ],
  },
  {
    kind: "table",
    id: "lines_tubes",
    title: "Lines and Tubes",
    note: "Complete only for lines that are in situ.",
    minRows: 6,
    columns: [
      {
        key: "line",
        label: "Line / Tube",
        type: "select",
        span: 2,
        options: [
          "",
          "ETT / TT",
          "Peripheral Cannula",
          "Central Venous Catheter",
          "Art. line — radial / femoral",
          "Ryles tube / PEG / NJ",
          "Urinary Catheter",
        ],
      },
      { key: "size", label: "Size / Cuff Pressure" },
      { key: "site", label: "Site" },
      { key: "inserted_on", label: "Date of Insertion", type: "date" },
      { key: "day", label: "Day", type: "number" },
      { key: "condition", label: "Condition of Site" },
      { key: "staff", label: "Staff Sign & ID" },
      { key: "time", label: "Time", type: "time" },
    ],
  },
  {
    kind: "fields",
    id: "handover",
    title: "Shift Nurse Handover",
    cols: 3,
    fields: [
      { key: "m_initials", label: "Morning — Shift nurse initials" },
      { key: "e_initials", label: "Evening — Shift nurse initials" },
      { key: "n_initials", label: "Night — Shift nurse initials" },
      { key: "m_id", label: "Morning — Shift nurse ID" },
      { key: "e_id", label: "Evening — Shift nurse ID" },
      { key: "n_id", label: "Night — Shift nurse ID" },
      {
        key: "m_taking_initials",
        label: "Morning — Taking over nurse initials",
      },
      {
        key: "e_taking_initials",
        label: "Evening — Taking over nurse initials",
      },
      { key: "n_taking_initials", label: "Night — Taking over nurse initials" },
      { key: "m_taking_id", label: "Morning — Taking over nurse ID" },
      { key: "e_taking_id", label: "Evening — Taking over nurse ID" },
      { key: "n_taking_id", label: "Night — Taking over nurse ID" },
    ],
  },

  // ── Page 2: hourly observation flowsheet ──────────────────────────────────
  {
    kind: "hourly",
    id: "observations",
    title: "Hourly Observations",
    note: "The ICU day runs 08:00 to 07:00. Haemodynamic, ventilatory and ABG parameters as printed on the chart.",
    groups: [
      {
        label: "Haemodynamic Parameter",
        fields: [
          { key: "temp", label: "Temp", unit: "°C", type: "number" },
          { key: "pulse", label: "Pulse", type: "number" },
          { key: "hr", label: "HR", type: "number" },
          { key: "bp", label: "BP (S/D)" },
          { key: "map", label: "Mean", type: "number" },
        ],
      },
      {
        label: "Ventilatory Parameter",
        fields: [
          { key: "vent_mode", label: "Ventil Mode" },
          { key: "rr_t", label: "RR (T)", type: "number" },
          { key: "rr_s", label: "RR (S)", type: "number" },
          { key: "fio2", label: "FiO₂", unit: "%", type: "number" },
          { key: "tv", label: "TV", unit: "mL", type: "number" },
          { key: "mv_set", label: "MV Set", unit: "L", type: "number" },
          { key: "mv_del", label: "MV Del", unit: "L", type: "number" },
          { key: "pip", label: "PIP", type: "number" },
          { key: "pplat", label: "Pplat", type: "number" },
          { key: "peep", label: "PEEP", type: "number" },
          { key: "ie", label: "I:E" },
          { key: "spo2", label: "SpO₂", unit: "%", type: "number" },
        ],
      },
      {
        label: "Investigations — ABG",
        fields: [
          { key: "ph", label: "pH", type: "number" },
          { key: "pco2", label: "pCO₂", type: "number" },
          { key: "po2", label: "pO₂", type: "number" },
          { key: "hco3", label: "Std HCO₃⁻", type: "number" },
          { key: "be", label: "BE", type: "number" },
          { key: "agap", label: "A Gap", type: "number" },
          { key: "lactate", label: "Lactate", type: "number" },
          { key: "sao2", label: "SaO₂", unit: "%", type: "number" },
          { key: "abg_na", label: "Na", type: "number" },
          { key: "abg_k", label: "K", type: "number" },
        ],
      },
      {
        label: "Other",
        fields: [
          { key: "pain", label: "PANN (Pain)", type: "number" },
          { key: "events", label: "Events", span: 2 },
          {
            key: "blood_sugar",
            label: "Blood sugar",
            unit: "mg/dl",
            type: "number",
          },
          { key: "insulin", label: "Insulin", unit: "Units", type: "number" },
        ],
      },
    ],
  },
  {
    kind: "hourly",
    id: "intake",
    title: "Intake (hourly)",
    groups: [
      {
        label: "Intake",
        fields: [
          { key: "infusions", label: "Infusions", unit: "ml", type: "number" },
          {
            key: "sedation",
            label: "Sedation / Analgesia",
            unit: "ml",
            type: "number",
          },
          { key: "iv_fluid", label: "IV fluid", unit: "ml", type: "number" },
          { key: "blood_bag_no", label: "Blood Products — Bag No" },
          {
            key: "blood_ml",
            label: "Blood Products",
            unit: "ml",
            type: "number",
          },
          { key: "tpn", label: "TPN", unit: "ml", type: "number" },
          {
            key: "enteral_oral",
            label: "Enteral — Oral",
            unit: "ml",
            type: "number",
          },
          {
            key: "enteral_rtf",
            label: "Enteral — RTF",
            unit: "ml",
            type: "number",
          },
          { key: "ml_hr", label: "ml/hr", type: "number" },
          { key: "total", label: "Total", unit: "ml", type: "number" },
        ],
      },
    ],
  },
  {
    kind: "hourly",
    id: "output",
    title: "Output (hourly)",
    groups: [
      {
        label: "Output",
        fields: [
          { key: "drain_1", label: "D₂ (1)", unit: "ml", type: "number" },
          { key: "drain_2", label: "D₂ (2)", unit: "ml", type: "number" },
          {
            key: "total_drain",
            label: "Total Drain",
            unit: "ml",
            type: "number",
          },
          {
            key: "rta_vomiting",
            label: "RTA / Vomiting",
            unit: "ml",
            type: "number",
          },
          {
            key: "bowel_open",
            label: "Bowel Open",
            type: "select",
            options: yesNo,
          },
          { key: "urine_ml_hr", label: "Urine", unit: "ml/hr", type: "number" },
          {
            key: "urine_total",
            label: "Urine Total",
            unit: "ml",
            type: "number",
          },
          {
            key: "output_total",
            label: "Output (Total)",
            unit: "ml",
            type: "number",
          },
          { key: "balance", label: "Balance", unit: "ml", type: "number" },
        ],
      },
    ],
  },

  // ── Page 2: labs, imaging, microbiology, balance, antibiotics ─────────────
  {
    kind: "table",
    id: "labs",
    title: "Lab Investigations",
    minRows: 2,
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "time", label: "Time", type: "time" },
      { key: "hb", label: "Hb", type: "number" },
      { key: "tlc", label: "TLC", type: "number" },
      { key: "dlc", label: "DLC" },
      { key: "platelet", label: "Plat. Count", type: "number" },
      { key: "aptt", label: "APTT T/C" },
      { key: "pt", label: "PT T/C" },
      { key: "inr", label: "INR", type: "number" },
      { key: "urea", label: "Urea", type: "number" },
      { key: "creatinine", label: "Creatinine", unit: "mg/dl", type: "number" },
      { key: "na", label: "Na⁺", type: "number" },
      { key: "k", label: "K", type: "number" },
      { key: "mg", label: "Mg", type: "number" },
      { key: "ca", label: "Ca", type: "number" },
      { key: "p", label: "P", type: "number" },
      { key: "cl", label: "Cl⁻", type: "number" },
      { key: "bili", label: "Bili T/D" },
      { key: "total_protein", label: "Total Protein", type: "number" },
      { key: "alb_glob", label: "Alb/glob" },
      { key: "sgot_sgpt", label: "SGOT/SGPT" },
      { key: "alkp_ggtp", label: "ALKP/GGTP" },
    ],
  },
  {
    kind: "fields",
    id: "imaging",
    title: "Imaging Reports",
    cols: 3,
    fields: [
      { key: "echo", label: "Echo Report", type: "textarea" },
      { key: "usg", label: "USG Report", type: "textarea" },
      { key: "ct", label: "CT Report", type: "textarea" },
    ],
  },
  {
    kind: "table",
    id: "microbiology",
    title: "Microbiology Samples",
    minRows: 4,
    columns: [
      {
        key: "sample",
        label: "Sample",
        type: "select",
        span: 2,
        options: [
          "",
          "Sputum Gm stain",
          "Sputum C/S",
          "Blood C/S",
          "Urine R/M",
          "Urine C/S",
          "Pleu. Fluid Gm stain",
          "Pleu. Fluid C/S",
          "Other Gm stain",
          "Other C/S",
        ],
      },
      { key: "date", label: "Date", type: "date" },
      { key: "report", label: "Report", span: 3 },
    ],
  },
  {
    kind: "fields",
    id: "balance_24h",
    title: "Last 24hr Balance",
    cols: 4,
    fields: [
      {
        key: "intake",
        label: "Intake (IV + Enteral)",
        unit: "ml",
        type: "number",
      },
      { key: "output", label: "Output", unit: "ml", type: "number" },
      { key: "uo", label: "UO", unit: "ml", type: "number" },
      { key: "drain", label: "Drain", unit: "ml", type: "number" },
      { key: "rta", label: "RTA", unit: "ml", type: "number" },
      { key: "uf", label: "UF", unit: "ml", type: "number" },
      { key: "balance", label: "Balance", unit: "ml", type: "number" },
      {
        key: "cumulative_balance",
        label: "Cumulative Balance",
        unit: "ml",
        type: "number",
      },
    ],
  },
  {
    kind: "table",
    id: "antibiotics",
    title: "Antibiotics",
    minRows: 3,
    columns: [
      { key: "present", label: "Present", span: 2 },
      { key: "day", label: "Day", type: "number" },
      { key: "previous", label: "Previous", span: 2 },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "stop_date", label: "Stop date", type: "date" },
    ],
  },
]

import { parseISO, todayISO } from '../lib/utils'
import type { Patient, VitalReading } from './types'

export const COMMON_CONDITIONS = [
  'Hypertension',
  'Type 2 diabetes',
  'Asthma',
  'High cholesterol',
  'Heart disease',
  'Thyroid disorder',
  'Kidney disease',
  'Depression or anxiety',
  'Arthritis',
  'Cancer (history)',
]

export const COMMON_ALLERGIES = ['Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen', 'Latex', 'Peanuts', 'Shellfish', 'Codeine']

export type Drug = {
  name: string
  strengths: string[]
  defaultSig: string
  drugClass: string
  /** Allergy names (lower-case) that conflict with this drug. */
  allergyConflicts?: string[]
}

export const FORMULARY: Drug[] = [
  { name: 'Amoxicillin', strengths: ['250 mg', '500 mg'], defaultSig: 'Three times daily for 7 days', drugClass: 'Penicillin antibiotic', allergyConflicts: ['penicillin'] },
  { name: 'Azithromycin', strengths: ['250 mg', '500 mg'], defaultSig: 'Once daily for 5 days', drugClass: 'Macrolide antibiotic' },
  { name: 'Clarithromycin', strengths: ['250 mg', '500 mg'], defaultSig: 'Twice daily for 7 days', drugClass: 'Macrolide antibiotic' },
  { name: 'Ibuprofen', strengths: ['200 mg', '400 mg'], defaultSig: 'Every 8 hours as needed', drugClass: 'NSAID', allergyConflicts: ['ibuprofen', 'aspirin'] },
  { name: 'Paracetamol', strengths: ['500 mg', '650 mg'], defaultSig: 'Every 6 hours as needed', drugClass: 'Analgesic' },
  { name: 'Metformin', strengths: ['500 mg', '850 mg', '1000 mg'], defaultSig: 'Twice daily with meals', drugClass: 'Biguanide' },
  { name: 'Empagliflozin', strengths: ['10 mg', '25 mg'], defaultSig: 'Once daily in the morning', drugClass: 'SGLT2 inhibitor' },
  { name: 'Lisinopril', strengths: ['10 mg', '20 mg'], defaultSig: 'Once daily', drugClass: 'ACE inhibitor' },
  { name: 'Losartan', strengths: ['50 mg', '100 mg'], defaultSig: 'Once daily', drugClass: 'ARB' },
  { name: 'Amlodipine', strengths: ['5 mg', '10 mg'], defaultSig: 'Once daily', drugClass: 'Calcium channel blocker' },
  { name: 'Atorvastatin', strengths: ['20 mg', '40 mg'], defaultSig: 'Once daily at night', drugClass: 'Statin' },
  { name: 'Spironolactone', strengths: ['25 mg'], defaultSig: 'Once daily', drugClass: 'Potassium-sparing diuretic' },
  { name: 'Cetirizine', strengths: ['5 mg', '10 mg'], defaultSig: 'Once daily', drugClass: 'Antihistamine' },
  { name: 'Sertraline', strengths: ['50 mg', '100 mg'], defaultSig: 'Once daily', drugClass: 'SSRI' },
]

type Interaction = { a: string; b: string; severity: 'major' | 'moderate'; note: string }

const INTERACTIONS: Interaction[] = [
  { a: 'clarithromycin', b: 'atorvastatin', severity: 'major', note: 'Raises statin levels. Risk of muscle damage (rhabdomyolysis). Prefer azithromycin.' },
  { a: 'lisinopril', b: 'losartan', severity: 'major', note: 'Dual RAAS blockade. Raises potassium and kidney injury risk.' },
  { a: 'spironolactone', b: 'losartan', severity: 'major', note: 'Both raise potassium. Patient already has K+ 5.3.' },
  { a: 'ibuprofen', b: 'losartan', severity: 'moderate', note: 'NSAIDs blunt BP control and can reduce kidney function.' },
  { a: 'ibuprofen', b: 'apixaban', severity: 'major', note: 'Increased bleeding risk.' },
  { a: 'ibuprofen', b: 'clopidogrel', severity: 'major', note: 'Increased bleeding risk.' },
  { a: 'sertraline', b: 'sumatriptan', severity: 'moderate', note: 'Risk of serotonin syndrome.' },
]

export type RxAlert = { level: 'major' | 'moderate' | 'allergy'; title: string; note: string }

export function checkPrescription(drugName: string, patient: Patient): RxAlert[] {
  const drug = FORMULARY.find((d) => d.name === drugName)
  const alerts: RxAlert[] = []
  const name = drugName.toLowerCase()
  const allergies = patient.allergies.map((a) => a.toLowerCase())
  for (const conflict of drug?.allergyConflicts ?? []) {
    if (allergies.includes(conflict)) {
      alerts.push({
        level: 'allergy',
        title: `Allergy: ${patient.name.split(' ')[0]} is allergic to ${conflict[0].toUpperCase() + conflict.slice(1)}`,
        note: `${drugName} belongs to the ${drug?.drugClass} class. Choose an alternative.`,
      })
    }
  }
  const active = patient.medications.filter((m) => m.status === 'active').map((m) => m.name.toLowerCase())
  for (const ix of INTERACTIONS) {
    const other = ix.a === name ? ix.b : ix.b === name ? ix.a : null
    if (other && active.some((m) => m.includes(other))) {
      alerts.push({
        level: ix.severity,
        title: `${ix.severity === 'major' ? 'Major' : 'Moderate'} interaction with ${other[0].toUpperCase() + other.slice(1)}`,
        note: ix.note,
      })
    }
  }
  if (active.some((m) => m === name)) {
    alerts.push({ level: 'moderate', title: 'Duplicate therapy', note: `${drugName} is already on the active medication list.` })
  }
  return alerts
}

export const LAB_CATALOG = [
  { name: 'Hemoglobin A1C', kind: 'Lab' as const, code: '83036' },
  { name: 'Lipid Panel', kind: 'Lab' as const, code: '80061' },
  { name: 'Basic Metabolic Panel', kind: 'Lab' as const, code: '80048' },
  { name: 'Complete Blood Count', kind: 'Lab' as const, code: '85025' },
  { name: 'Urine Microalbumin', kind: 'Lab' as const, code: '82043' },
  { name: 'TSH', kind: 'Lab' as const, code: '84443' },
  { name: 'Chest X-ray (PA view)', kind: 'Imaging' as const, code: '71046' },
  { name: 'ECG', kind: 'Imaging' as const, code: '93000' },
  { name: 'Knee X-ray', kind: 'Imaging' as const, code: '73560' },
  { name: 'Abdominal Ultrasound', kind: 'Imaging' as const, code: '76700' },
]

export const SPECIALISTS = [
  { name: 'Dr. Naomi Castillo', specialty: 'Ophthalmology', facility: 'Lakeshore Eye Institute' },
  { name: 'Dr. Rafael Okafor', specialty: 'Cardiology', facility: 'HMO-Clinic Heart Clinic' },
  { name: 'Dr. Arjun Mehta', specialty: 'Endocrinology', facility: 'HMO-Clinic Endocrine Center' },
  { name: 'Dr. Leah Morgan', specialty: 'Nephrology', facility: 'Northwestern Kidney Care' },
  { name: 'Dr. Samuel Ito', specialty: 'Orthopedics', facility: 'Chicago Joint and Spine' },
  { name: 'Dr. Ruth Adebayo', specialty: 'Dermatology', facility: 'Clearview Skin Center' },
]

export const TEMPLATES: Record<'SOAP' | 'DAP' | 'Follow-up', { field: string; hint: string }[]> = {
  SOAP: [
    { field: 'Subjective', hint: 'Chief complaint, history of present illness, patient-reported symptoms' },
    { field: 'Objective', hint: 'Vitals, exam findings, results reviewed today' },
    { field: 'Assessment', hint: 'Diagnoses and clinical reasoning' },
    { field: 'Plan', hint: 'Medications, orders, education, follow-up' },
  ],
  DAP: [
    { field: 'Data', hint: 'What the patient said and what you observed' },
    { field: 'Assessment', hint: 'Your interpretation of the data' },
    { field: 'Plan', hint: 'Next steps, homework, follow-up' },
  ],
  'Follow-up': [
    { field: 'Interval history', hint: 'Changes since the last visit' },
    { field: 'Medication review', hint: 'Adherence, side effects, changes' },
    { field: 'Plan', hint: 'Adjustments and next visit' },
  ],
}

export const ICD_SUGGESTIONS = [
  'E11.9 Type 2 diabetes',
  'E11.65 Type 2 diabetes with hyperglycemia',
  'I10 Essential hypertension',
  'E78.5 Hyperlipidemia',
  'E87.5 Hyperkalemia',
  'J06.9 Upper respiratory infection',
  'R05.9 Cough',
  'M17.11 Osteoarthritis, right knee',
  'Z00.00 General adult exam',
  'H66.90 Otitis media',
]

export const PROTOCOLS: Record<string, string[]> = {
  'Type 2 diabetes': [
    'Check A1C every 3 months until at goal (< 7%), then every 6 months.',
    'Annual dilated eye exam and urine albumin test.',
    'Moderate-intensity statin for ages 40 to 75.',
    'Consider SGLT2 inhibitor if kidney or heart disease is present.',
  ],
  Hypertension: [
    'Target BP below 130/80 for most adults with diabetes.',
    'Review adherence before adding a second agent.',
    'Recheck potassium and creatinine 1 to 2 weeks after ARB or ACE changes.',
  ],
  'High cholesterol': ['Recheck lipid panel 6 to 12 weeks after a statin change.', 'LDL goal below 100 mg/dL for patients with diabetes.'],
  Asthma: ['Confirm inhaler technique.', 'Step up therapy if rescue inhaler is used more than twice a week.'],
}

export type CdsAlert = { id: string; tone: 'danger' | 'warn' | 'info'; title: string; detail: string }

const monthsSince = (iso?: string) =>
  iso ? (parseISO(todayISO()).getTime() - parseISO(iso).getTime()) / (30.44 * 86_400_000) : Infinity

export function latestVitals(p: Patient): VitalReading | undefined {
  return p.vitals[p.vitals.length - 1]
}

/** Preventive-care reminders and risk warnings computed from the record. */
export function cdsAlerts(p: Patient): CdsAlert[] {
  const out: CdsAlert[] = []
  const diabetic = p.conditions.some((c) => c.toLowerCase().includes('diabetes'))
  const v = latestVitals(p)

  for (const lab of p.labs) {
    for (const r of lab.results) {
      if (r.flag !== 'normal' && lab.status === 'resulted' && monthsSince(lab.date) < 2) {
        out.push({ id: `${lab.id}-${r.name}`, tone: r.name === 'Potassium' ? 'danger' : 'warn', title: `${r.name} ${r.flag === 'high' ? 'above' : 'below'} range`, detail: `${r.value} ${r.unit} (ref ${r.range}) on ${lab.name}` })
      }
    }
  }
  if (v && (v.systolic >= 140 || v.diastolic >= 90)) {
    out.push({ id: 'bp', tone: 'danger', title: 'Blood pressure above goal', detail: `Last reading ${v.systolic}/${v.diastolic} mmHg` })
  } else if (v && diabetic && (v.systolic >= 130 || v.diastolic >= 80)) {
    out.push({ id: 'bp', tone: 'warn', title: 'BP above diabetic target', detail: `Last reading ${v.systolic}/${v.diastolic}, target < 130/80` })
  }
  if (diabetic && monthsSince(p.lastEyeExam) > 12) {
    out.push({ id: 'eye', tone: 'warn', title: 'Diabetic eye exam overdue', detail: p.lastEyeExam ? `Last exam ${Math.round(monthsSince(p.lastEyeExam))} months ago` : 'No eye exam on record' })
  }
  if (p.sex === 'Female' && p.age >= 40 && monthsSince(p.lastMammogram) > 12) {
    out.push({ id: 'mammo', tone: 'info', title: 'Mammogram due', detail: p.lastMammogram ? `Last screening ${Math.round(monthsSince(p.lastMammogram))} months ago` : 'Recommended yearly from age 40' })
  }
  if (p.age >= 45 && monthsSince(p.lastColonoscopy) > 120) {
    out.push({ id: 'colon', tone: 'info', title: 'Colorectal screening due', detail: 'Recommended for adults 45 to 75' })
  }
  const lowRefill = p.medications.find((m) => m.status === 'active' && m.refillsLeft === 0)
  if (lowRefill) {
    out.push({ id: 'refill', tone: 'info', title: `${lowRefill.name} has no refills left`, detail: 'Renewal needed before the supply runs out' })
  }
  return out
}

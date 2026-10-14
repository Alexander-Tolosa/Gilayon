import type { ServiceType } from './types'

/** Consultation templates: one tap fills the complaint, a notes outline, a diagnosis and common prescriptions. */
export type ConsultTemplate = {
  key: string
  label: string
  service: ServiceType
  complaint: string
  notes: string
  diagnosis: { description: string; icd10_code: string }
  rx: { drug_name: string; dose: string; frequency: string; quantity: number }[]
  certificate?: { purpose: string; rest_days: number }
  labs?: string[]
}

export const TEMPLATES: ConsultTemplate[] = [
  {
    key: 'uri',
    label: 'Cough and colds',
    service: 'Medical',
    complaint: 'Cough and colds for 3 days',
    notes: 'Productive cough, clear nasal discharge. No fever, no difficulty of breathing. Lungs clear on auscultation. Advised increased fluid intake and rest.',
    diagnosis: { description: 'Acute upper respiratory infection', icd10_code: 'J06.9' },
    rx: [
      { drug_name: 'Carbocisteine', dose: '500 mg capsule', frequency: '3 times a day for 5 days', quantity: 15 },
      { drug_name: 'Cetirizine', dose: '10 mg tablet', frequency: 'Once a day at bedtime for 5 days', quantity: 5 },
    ],
    certificate: { purpose: 'Excuse from work', rest_days: 2 },
  },
  {
    key: 'fever',
    label: 'Fever',
    service: 'Medical',
    complaint: 'Fever for 2 days',
    notes: 'Intermittent fever, highest 38.6 °C. No rash, no bleeding. Advised CBC if fever persists beyond 3 days.',
    diagnosis: { description: 'Fever, unspecified', icd10_code: 'R50.9' },
    rx: [{ drug_name: 'Paracetamol', dose: '500 mg tablet', frequency: 'Every 4 hours as needed for fever', quantity: 10 }],
    certificate: { purpose: 'Excuse from work', rest_days: 2 },
    labs: ['Complete blood count (CBC)'],
  },
  {
    key: 'htn',
    label: 'Hypertension follow-up',
    service: 'Medical',
    complaint: 'Blood pressure follow-up',
    notes: 'Compliant with maintenance medicine. No headache, no chest pain. Advised low-salt diet and daily home BP monitoring.',
    diagnosis: { description: 'Essential (primary) hypertension', icd10_code: 'I10' },
    rx: [{ drug_name: 'Losartan', dose: '50 mg tablet', frequency: 'Once a day', quantity: 30 }],
    labs: ['Lipid profile', 'Creatinine'],
  },
  {
    key: 'dm',
    label: 'Diabetes follow-up',
    service: 'Medical',
    complaint: 'Diabetes follow-up',
    notes: 'Taking metformin regularly. No polyuria, no polydipsia. Feet without wounds. Advised diet and exercise.',
    diagnosis: { description: 'Type 2 diabetes mellitus without complications', icd10_code: 'E11.9' },
    rx: [{ drug_name: 'Metformin', dose: '500 mg tablet', frequency: 'Twice a day after meals', quantity: 60 }],
    labs: ['Fasting blood sugar (FBS)', 'HbA1c'],
  },
  {
    key: 'headache',
    label: 'Headache',
    service: 'Medical',
    complaint: 'Headache since this morning',
    notes: 'Bilateral, band-like headache. No vomiting, no blurring of vision. Neurologic exam unremarkable.',
    diagnosis: { description: 'Tension-type headache', icd10_code: 'G44.2' },
    rx: [{ drug_name: 'Paracetamol', dose: '500 mg tablet', frequency: 'Every 6 hours as needed', quantity: 8 }],
  },
  {
    key: 'backpain',
    label: 'Low back pain',
    service: 'Medical',
    complaint: 'Low back pain for 1 week',
    notes: 'Pain after lifting files at the office. No radiation, no numbness. Advised proper lifting posture and warm compress.',
    diagnosis: { description: 'Low back pain', icd10_code: 'M54.5' },
    rx: [{ drug_name: 'Mefenamic acid', dose: '500 mg capsule', frequency: '3 times a day after meals for 5 days', quantity: 15 }],
    certificate: { purpose: 'Excuse from work', rest_days: 1 },
  },
  {
    key: 'pe',
    label: 'Annual physical exam',
    service: 'Medical',
    complaint: 'Annual physical examination',
    notes: 'No current complaints. Physical examination within normal limits.',
    diagnosis: { description: 'General adult medical examination', icd10_code: 'Z00.0' },
    rx: [],
    certificate: { purpose: 'Annual physical examination requirement', rest_days: 0 },
    labs: ['Complete blood count (CBC)', 'Urinalysis', 'Chest X-ray'],
  },
  {
    key: 'toothache',
    label: 'Toothache',
    service: 'Dental',
    complaint: 'Toothache, lower left molar',
    notes: 'Deep caries on tooth #36, tender to percussion. Advised extraction or root canal; patient opted for extraction.',
    diagnosis: { description: 'Dental caries', icd10_code: 'K02.9' },
    rx: [
      { drug_name: 'Amoxicillin', dose: '500 mg capsule', frequency: '3 times a day for 7 days', quantity: 21 },
      { drug_name: 'Mefenamic acid', dose: '500 mg capsule', frequency: '3 times a day as needed for pain', quantity: 9 },
    ],
    certificate: { purpose: 'Dental procedure', rest_days: 1 },
  },
  {
    key: 'prophy',
    label: 'Dental cleaning',
    service: 'Dental',
    complaint: 'Oral prophylaxis',
    notes: 'Moderate calculus deposits. Oral prophylaxis done. Advised brushing twice a day and flossing.',
    diagnosis: { description: 'Gingivitis', icd10_code: 'K05.1' },
    rx: [],
  },
  {
    key: 'lab',
    label: 'Laboratory request',
    service: 'Laboratory',
    complaint: 'Laboratory tests as requested',
    notes: 'Specimen collected. Results to be released to the attending physician.',
    diagnosis: { description: 'Encounter for laboratory examination', icd10_code: 'Z01.7' },
    rx: [],
    labs: ['Complete blood count (CBC)', 'Urinalysis'],
  },
]

export const COMPLAINTS = [...new Set([...TEMPLATES.map((t) => t.complaint), 'Dizziness', 'Abdominal pain', 'Skin rash', 'Sore throat', 'Body malaise', 'Diarrhea', 'Elevated blood pressure', 'Eye irritation', 'Pre-employment examination', 'Tooth extraction'])]

export const DRUGS = [
  { name: 'Paracetamol', doses: ['500 mg tablet', '250 mg/5 mL syrup'] },
  { name: 'Mefenamic acid', doses: ['250 mg capsule', '500 mg capsule'] },
  { name: 'Ibuprofen', doses: ['200 mg tablet', '400 mg tablet'] },
  { name: 'Amoxicillin', doses: ['500 mg capsule', '250 mg/5 mL suspension'] },
  { name: 'Co-amoxiclav', doses: ['625 mg tablet'] },
  { name: 'Azithromycin', doses: ['500 mg tablet'] },
  { name: 'Cefalexin', doses: ['500 mg capsule'] },
  { name: 'Carbocisteine', doses: ['500 mg capsule'] },
  { name: 'Cetirizine', doses: ['10 mg tablet'] },
  { name: 'Loratadine', doses: ['10 mg tablet'] },
  { name: 'Losartan', doses: ['50 mg tablet', '100 mg tablet'] },
  { name: 'Amlodipine', doses: ['5 mg tablet', '10 mg tablet'] },
  { name: 'Metformin', doses: ['500 mg tablet', '850 mg tablet'] },
  { name: 'Atorvastatin', doses: ['20 mg tablet', '40 mg tablet'] },
  { name: 'Omeprazole', doses: ['20 mg capsule', '40 mg capsule'] },
  { name: 'Loperamide', doses: ['2 mg capsule'] },
  { name: 'Oral rehydration salts', doses: ['1 sachet in 1 L water'] },
  { name: 'Salbutamol', doses: ['2 mg tablet', '100 mcg inhaler'] },
  { name: 'Ferrous sulfate + folic acid', doses: ['1 tablet'] },
  { name: 'Chlorhexidine mouthwash', doses: ['0.12% solution'] },
]

/** Drugs that conflict with a recorded allergy (build-if-time allergy warning). */
export const ALLERGY_CLASS: Record<string, string[]> = {
  penicillin: ['Amoxicillin', 'Co-amoxiclav'],
  cephalosporin: ['Cefalexin'],
  nsaid: ['Mefenamic acid', 'Ibuprofen'],
  sulfa: [],
}

export const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', 'Every 4 hours as needed', 'Every 6 hours as needed', 'At bedtime']

export const ICD10 = [
  { description: 'Acute upper respiratory infection', icd10_code: 'J06.9' },
  { description: 'Acute pharyngitis', icd10_code: 'J02.9' },
  { description: 'Fever, unspecified', icd10_code: 'R50.9' },
  { description: 'Essential (primary) hypertension', icd10_code: 'I10' },
  { description: 'Type 2 diabetes mellitus without complications', icd10_code: 'E11.9' },
  { description: 'Tension-type headache', icd10_code: 'G44.2' },
  { description: 'Low back pain', icd10_code: 'M54.5' },
  { description: 'Dizziness and giddiness', icd10_code: 'R42' },
  { description: 'Acute gastroenteritis', icd10_code: 'A09' },
  { description: 'Dyspepsia', icd10_code: 'K30' },
  { description: 'Allergic contact dermatitis', icd10_code: 'L23.9' },
  { description: 'Urinary tract infection', icd10_code: 'N39.0' },
  { description: 'Bronchial asthma', icd10_code: 'J45.9' },
  { description: 'Dyslipidemia', icd10_code: 'E78.5' },
  { description: 'Dental caries', icd10_code: 'K02.9' },
  { description: 'Gingivitis', icd10_code: 'K05.1' },
  { description: 'Supervision of normal pregnancy', icd10_code: 'Z34.9' },
  { description: 'General adult medical examination', icd10_code: 'Z00.0' },
  { description: 'Encounter for laboratory examination', icd10_code: 'Z01.7' },
]

export const LAB_TESTS = ['Complete blood count (CBC)', 'Urinalysis', 'Fecalysis', 'Fasting blood sugar (FBS)', 'HbA1c', 'Lipid profile', 'Creatinine', 'Uric acid', 'Chest X-ray', 'ECG', 'Pregnancy test']

export const OFFICES = [
  'Provincial Health Office',
  'Provincial Engineering Office',
  "Provincial Treasurer's Office",
  'Provincial Social Welfare and Development Office',
  'Provincial Human Resource Management Office',
  'Provincial Planning and Development Office',
  'Provincial Agriculture Office',
  'Provincial General Services Office',
  'Provincial Accounting Office',
  'Provincial Budget Office',
  'Provincial Legal Office',
  'Office of the Provincial Veterinarian',
]

export const POSITIONS = ['Administrative Aide IV', 'Administrative Assistant II', 'Clerk III', 'Nurse II', 'Engineer III', 'Accountant II', 'Social Welfare Officer II', 'Agricultural Technologist', 'Planning Officer II', 'Driver II', 'Budget Officer III', 'Attorney III', 'Veterinarian II', 'Revenue Collection Clerk II', 'Utility Worker II', 'Computer Programmer II']

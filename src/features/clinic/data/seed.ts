/*
  Synthetic seed for the demo. Every name, number and record here is invented.
  About 200 employees on the HR list, their dependents, PWD, senior and pregnant cases,
  3 doctors and 2 front desk staff. The system "went live" about 90 days ago, so digital
  consultations start then; anything older lives in paper folders attached as scans.
*/
import { ALLERGY_CLASS, OFFICES, POSITIONS, TEMPLATES } from './reference'
import { DEFAULT_CATEGORIES, ageOf, dayKeyOffset, mulberry32, todayKey, topCategory } from '../lib/helpers'
import type {
  Allergy,
  AuditLog,
  CategoryKey,
  CivilStatus,
  Consultation,
  Diagnosis,
  DocumentRow,
  Employee,
  FamilyHistory,
  LabOrder,
  Patient,
  PatientRelationship,
  Person,
  Prescription,
  PriorityCategory,
  QueueTicket,
  ScannedPage,
  Sex,
  Staff,
} from '../types'

export type ClinicData = {
  persons: Person[]
  employees: Employee[]
  patients: Patient[]
  relationships: PatientRelationship[]
  familyHistory: FamilyHistory[]
  allergies: Allergy[]
  categories: PriorityCategory[]
  tickets: QueueTicket[]
  consultations: Consultation[]
  diagnoses: Diagnosis[]
  labs: LabOrder[]
  prescriptions: Prescription[]
  documents: DocumentRow[]
  scans: ScannedPage[]
  staff: Staff[]
  audit: AuditLog[]
  counters: { rx: number; mc: number; patient: number }
  lastImport: { at: number; count: number; source: string }
}

export const STAFF: Staff[] = [
  { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor', title: 'Physician, doctor in charge', license_no: '0098214', ptr_no: '7731542 · Jan 6, 2026 · Iloilo', services: ['Medical', 'Laboratory'], room: 'Room 1', pin: '1234' },
  { staff_id: 'st-d2', name: 'Dr. Liza Magbanua', role: 'doctor', title: 'Physician', license_no: '0121587', ptr_no: '7731589 · Jan 6, 2026 · Iloilo', services: ['Medical', 'Laboratory'], room: 'Room 2', pin: '1234' },
  { staff_id: 'st-d3', name: 'Dr. Analyn Hechanova', role: 'doctor', title: 'Dentist', license_no: '0047391', ptr_no: '7731604 · Jan 7, 2026 · Iloilo', services: ['Dental'], room: 'Dental room', pin: '1234' },
  { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk', title: 'Receptionist & Front desk' },
  { staff_id: 'st-f2', name: 'Joel Parreño', role: 'desk', title: 'Receptionist' },
  { staff_id: 'st-n1', name: 'Nurse Maricris Alinsug, RN', role: 'nurse', title: 'Triage & vital signs nurse', room: 'Triage station' },
  { staff_id: 'st-n2', name: 'Nurse Joy Sorongon, RN', role: 'nurse', title: 'Clinic staff nurse', room: 'Treatment room' },
]

const FEMALE = ['Maria Lourdes', 'Ana Marie', 'Rowena', 'Jocelyn', 'Marites', 'Lorna', 'Teresita', 'Grace', 'Rosario', 'Kristine', 'Jessa', 'Rhea', 'Melody', 'Charmaine', 'Hazel', 'Shiela', 'Gina', 'Liza', 'Ma. Cristina', 'Analyn', 'Joy', 'Mary Ann', 'Lea', 'Cherry', 'Glenda', 'Nenita', 'Evelyn', 'Ruby']
const MALE = ['Jose', 'Juan Carlos', 'Rodel', 'Ramon', 'Arnel', 'Edgardo', 'Danilo', 'Ernesto', 'Rolando', 'Noel', 'Joel', 'Ricardo', 'Mark Anthony', 'John Paul', 'Fernando', 'Alvin', 'Dennis', 'Raymond', 'Jun', 'Reynaldo', 'Romeo', 'Benjie', 'Carlo', 'Jerome', 'Nestor', 'Wilfredo', 'Eduardo', 'Vicente']
const SURNAMES = ['Villanueva', 'Gonzales', 'Dela Cruz', 'Tan', 'Sumagaysay', 'Gallego', 'Jalandoni', 'Montinola', 'Javellana', 'Salcedo', 'Celis', 'Doromal', 'Palmares', 'Gumban', 'Gerochi', 'Hechanova', 'Barrido', 'Magbanua', 'Dumaguit', 'Tarrosa', 'Abad', 'Espinosa', 'Belleza', 'Lachica', 'Divinagracia', 'Sorongon', 'Parcon', 'Gaitan', 'Elumba', 'Tabalan', 'Robles', 'Sustento', 'Panes', 'Alinsug', 'Billones', 'Grabato']

const COND_FAMILY = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'Stroke', 'Heart disease', 'Breast cancer', 'Kidney disease']
const RESULTS: Record<string, string> = {
  'Complete blood count (CBC)': 'Hgb 13.2 g/dL, WBC 7.8 x10⁹/L, platelets 245 x10⁹/L. Within normal limits.',
  Urinalysis: 'Yellow, clear, pH 6.0, no pus cells, no RBC. Normal.',
  'Fasting blood sugar (FBS)': '138 mg/dL (high; reference 70 to 100)',
  HbA1c: '7.4% (above target of 7%)',
  'Lipid profile': 'Total cholesterol 228 mg/dL (high), LDL 148 mg/dL (high), HDL 44 mg/dL',
  Creatinine: '0.9 mg/dL. Normal.',
  'Chest X-ray': 'No active lung infiltrates. Heart not enlarged.',
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')

export function buildSeed(): ClinicData {
  const rand = mulberry32(2026)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const chance = (p: number) => rand() < p
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  let idn = 0
  const id = (p: string) => `${p}-${pad(++idn, 5)}-${Math.floor(rand() * 1e6).toString(36)}`
  const now = Date.now()
  const thisYear = new Date().getFullYear()

  const persons: Person[] = []
  const employees: Employee[] = []
  const patients: Patient[] = []
  const relationships: PatientRelationship[] = []
  const familyHistory: FamilyHistory[] = []
  const allergies: Allergy[] = []
  const tickets: QueueTicket[] = []
  const consultations: Consultation[] = []
  const diagnoses: Diagnosis[] = []
  const labs: LabOrder[] = []
  const prescriptions: Prescription[] = []
  const documents: DocumentRow[] = []
  const scans: ScannedPage[] = []
  const audit: AuditLog[] = []
  let patientCounter = 0
  let rxCounter = 0
  let mcCounter = 0

  const usedNames = new Set<string>()
  const makeName = (sex: Sex, surname?: string) => {
    for (let i = 0; i < 20; i++) {
      const n = `${pick(sex === 'Female' ? FEMALE : MALE)} ${surname ?? pick(SURNAMES)}`
      if (!usedNames.has(n)) {
        usedNames.add(n)
        return n
      }
    }
    return `${pick(sex === 'Female' ? FEMALE : MALE)} ${pick(['A.', 'B.', 'C.', 'D.'])} ${surname ?? pick(SURNAMES)}`
  }
  const birth = (minAge: number, maxAge: number) => {
    const age = between(minAge, maxAge)
    return `${thisYear - age - (chance(0.5) ? 1 : 0)}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`
  }
  const phone = () => `09${between(10, 99)} ${between(100, 999)} ${pad(between(0, 9999), 4)}`
  const philhealth = () => `${between(10, 19)}-${pad(between(0, 999999999), 9)}-${between(0, 9)}`

  const addPerson = (p: Omit<Person, 'person_id'>) => {
    const person = { ...p, person_id: id('per') }
    persons.push(person)
    return person
  }
  const addPatient = (person: Person, extra: Partial<Patient> = {}) => {
    const pt: Patient = {
      patient_id: id('pat'),
      person_id: person.person_id,
      patient_no: `HMO-${pad(++patientCounter, 5)}`,
      civil_status: 'Single',
      created_at: now - 92 * 86_400_000,
      created_by: 'import',
      ...extra,
    }
    patients.push(pt)
    return pt
  }

  /* ------------------------------ Demo anchors ------------------------------ */

  // A returning employee with a full record, used in the demo script.
  const mlv = addPerson({ full_name: 'Maria Lourdes Villanueva', birthdate: `${thisYear - 58}-03-18`, sex: 'Female', contact: '0917 482 1093' })
  usedNames.add(mlv.full_name)
  employees.push({ employee_id: id('emp'), person_id: mlv.person_id, employee_no: 'IPG-2004-0318', office: 'Provincial Health Office', position: 'Nurse II' })
  const mlvPt = addPatient(mlv, { civil_status: 'Married', philhealth_pin: '12-050318204-7', legacy_folder_no: 'F-2004-0181' })
  allergies.push({ allergy_id: id('alg'), patient_id: mlvPt.patient_id, substance: 'Penicillin', reaction: 'Hives and swelling', severity: 'Severe' })
  familyHistory.push({ history_id: id('fh'), patient_id: mlvPt.patient_id, relative: 'Mother', condition: 'Hypertension', notes: 'Had a stroke at 70' })
  familyHistory.push({ history_id: id('fh'), patient_id: mlvPt.patient_id, relative: 'Father', condition: 'Type 2 diabetes' })
  ;(['Chart', 'Lab result', 'Prescription'] as const).forEach((kind, i) =>
    scans.push({ page_id: id('scn'), patient_id: mlvPt.patient_id, file: `sample:${i}`, kind, page_date: `${thisYear - 2 - i}-0${4 + i}-1${i}`, uploaded_by: 'st-f1', uploaded_at: now - (40 - i) * 86_400_000 }),
  )
  // Her husband (dependent, on her MDR) and her mother (senior dependent).
  const husband = addPerson({ full_name: 'Edgardo Villanueva', birthdate: `${thisYear - 61}-11-02`, sex: 'Male', contact: '0918 220 4471' })
  usedNames.add(husband.full_name)
  const husbandPt = addPatient(husband, { civil_status: 'Married', philhealth_pin: '12-061102771-3', created_by: 'st-f1' })
  relationships.push({ relationship_id: id('rel'), patient_id: mlvPt.patient_id, related_patient_id: husbandPt.patient_id, relationship_type: 'Spouse', listed_in_mdr: true })
  const daughter = addPerson({ full_name: 'Kristine Villanueva', birthdate: `${thisYear - 19}-06-25`, sex: 'Female', contact: '0927 118 0542' })
  usedNames.add(daughter.full_name)
  const daughterPt = addPatient(daughter, { created_by: 'st-f1' })
  relationships.push({ relationship_id: id('rel'), patient_id: mlvPt.patient_id, related_patient_id: daughterPt.patient_id, relationship_type: 'Child', listed_in_mdr: true })

  // Two employees with almost the same name, for the "similar names" case.
  const jdc1 = addPerson({ full_name: 'Jose Dela Cruz', birthdate: `${thisYear - 44}-08-09`, sex: 'Male', contact: '0919 554 2210' })
  const jdc2 = addPerson({ full_name: 'Jose De la Cruz', birthdate: `${thisYear - 31}-01-27`, sex: 'Male', contact: '0921 330 7764' })
  usedNames.add(jdc1.full_name).add(jdc2.full_name)
  employees.push({ employee_id: id('emp'), person_id: jdc1.person_id, employee_no: 'IPG-2009-0442', office: 'Provincial Engineering Office', position: 'Engineer III' })
  employees.push({ employee_id: id('emp'), person_id: jdc2.person_id, employee_no: 'IPG-2019-1127', office: "Provincial Treasurer's Office", position: 'Revenue Collection Clerk II' })
  addPatient(jdc1, { civil_status: 'Married', philhealth_pin: philhealth(), legacy_folder_no: 'F-2009-0712' })
  addPatient(jdc2, { philhealth_pin: philhealth() })

  // A new hire with no clinic history yet.
  const newHire = addPerson({ full_name: 'Carlo Sorongon', birthdate: `${thisYear - 24}-05-14`, sex: 'Male', contact: '0995 612 0038' })
  usedNames.add(newHire.full_name)
  employees.push({ employee_id: id('emp'), person_id: newHire.person_id, employee_no: 'IPG-2026-0071', office: 'Provincial Planning and Development Office', position: 'Planning Officer II' })
  addPatient(newHire, { philhealth_pin: philhealth() })

  /* -------------------------- The rest of the HR list ------------------------ */

  while (employees.length < 200) {
    const sex: Sex = chance(0.55) ? 'Female' : 'Male'
    const senior = chance(0.1)
    const person = addPerson({ full_name: makeName(sex), birthdate: senior ? birth(60, 64) : birth(23, 59), sex, contact: phone() })
    const hired = Math.max(1995, thisYear - between(1, ageOf(person.birthdate) - 21))
    // Employee numbers are unique on the HR list; re-draw on the rare collision.
    let employee_no = `IPG-${hired}-${pad(between(1, 1999), 4)}`
    while (employees.some((e) => e.employee_no === employee_no)) employee_no = `IPG-${hired}-${pad(between(1, 1999), 4)}`
    employees.push({ employee_id: id('emp'), person_id: person.person_id, employee_no, office: pick(OFFICES), position: pick(POSITIONS) })
    const civil: CivilStatus = ageOf(person.birthdate) > 30 && chance(0.7) ? 'Married' : chance(0.05) ? 'Widowed' : 'Single'
    const pt = addPatient(person, {
      civil_status: civil,
      philhealth_pin: philhealth(),
      pwd_id: chance(0.04) ? `PWD-063000-${pad(between(1, 99999), 5)}` : undefined,
      legacy_folder_no: chance(0.55) ? `F-${hired}-${pad(between(1, 999), 4)}` : undefined,
    })
    if (chance(0.12)) {
      const cls = pick(Object.keys(ALLERGY_CLASS))
      allergies.push({ allergy_id: id('alg'), patient_id: pt.patient_id, substance: cls === 'nsaid' ? 'Mefenamic acid (NSAID)' : cls[0].toUpperCase() + cls.slice(1), reaction: pick(['Rash', 'Hives', 'Swelling of lips', 'Itching']), severity: pick(['Mild', 'Moderate', 'Severe']) })
    }
    if (chance(0.3)) familyHistory.push({ history_id: id('fh'), patient_id: pt.patient_id, relative: pick(['Mother', 'Father', 'Sibling', 'Grandparent']), condition: pick(COND_FAMILY) })
    // Dependents on the member's MDR.
    if (civil === 'Married' && chance(0.35)) {
      const surname = person.full_name.split(' ').slice(-1)[0]
      const spouseSex: Sex = sex === 'Female' ? 'Male' : 'Female'
      const spouse = addPerson({ full_name: makeName(spouseSex, surname), birthdate: birth(25, 62), sex: spouseSex, contact: phone() })
      const spPt = addPatient(spouse, { civil_status: 'Married', philhealth_pin: chance(0.6) ? philhealth() : undefined, created_by: pick(['st-f1', 'st-f2']) })
      relationships.push({ relationship_id: id('rel'), patient_id: pt.patient_id, related_patient_id: spPt.patient_id, relationship_type: 'Spouse', listed_in_mdr: chance(0.85) })
      if (chance(0.5)) {
        const kidSex: Sex = chance(0.5) ? 'Female' : 'Male'
        const kid = addPerson({ full_name: makeName(kidSex, surname), birthdate: birth(4, 20), sex: kidSex, contact: person.contact })
        const kidPt = addPatient(kid, { created_by: pick(['st-f1', 'st-f2']) })
        relationships.push({ relationship_id: id('rel'), patient_id: pt.patient_id, related_patient_id: kidPt.patient_id, relationship_type: 'Child', listed_in_mdr: true })
      }
    }
  }

  // Seed pages of old paper folders for some returning patients.
  patients
    .filter((p) => p.legacy_folder_no && p.patient_id !== mlvPt.patient_id)
    .slice(0, 14)
    .forEach((p, i) => scans.push({ page_id: id('scn'), patient_id: p.patient_id, file: `sample:${i % 3}`, kind: (['Chart', 'Lab result', 'Prescription'] as const)[i % 3], page_date: `${thisYear - 1 - (i % 4)}-0${(i % 8) + 1}-1${i % 9}`, uploaded_by: pick(['st-f1', 'st-f2']), uploaded_at: now - between(2, 80) * 86_400_000 }))

  /* ------------------------- Visits since go-live (90 days) ------------------ */

  const doctors = STAFF.filter((s) => s.role === 'doctor')
  const personOf = (pt: Patient) => persons.find((x) => x.person_id === pt.person_id)!
  const catsFor = (pt: Patient): CategoryKey[] => {
    const c: CategoryKey[] = []
    if (ageOf(personOf(pt).birthdate) >= 60) c.push('senior')
    if (pt.pwd_id) c.push('pwd')
    return c.length ? c : ['regular']
  }
  const queueNoByDay: Record<string, number> = {}

  type Visit = { pt: Patient; day: string; checkIn: number; wait: number; tpl?: (typeof TEMPLATES)[number]; status?: QueueTicket['status']; doctor?: Staff; extraCats?: CategoryKey[] }

  const makeVisit = (v: Visit) => {
    const tpl = v.tpl ?? pick(TEMPLATES)
    const doctor = v.doctor ?? (tpl.service === 'Dental' ? doctors[2] : pick(doctors.slice(0, 2)))
    const cats = [...new Set([...(v.extraCats ?? []), ...catsFor(v.pt)])].filter((c) => !(c === 'regular' && (v.extraCats?.length ?? 0) > 0)) as CategoryKey[]
    queueNoByDay[v.day] = (queueNoByDay[v.day] ?? 0) + 1
    const status = v.status ?? 'done'
    const ticket: QueueTicket = {
      ticket_id: id('tkt'),
      patient_id: v.pt.patient_id,
      categories: cats,
      category_id: topCategory(cats, DEFAULT_CATEGORIES),
      verified_by: pick(['st-f1', 'st-f2']),
      is_returning: consultations.some((c) => c.patient_id === v.pt.patient_id) || !!v.pt.legacy_folder_no,
      queue_no: queueNoByDay[v.day],
      service_type: tpl.service,
      reason: tpl.complaint,
      status,
      checked_in_at: v.checkIn,
      called_at: status === 'waiting' || status === 'left' ? undefined : v.checkIn + v.wait * 60_000,
      done_at: status === 'done' ? v.checkIn + (v.wait + between(8, 20)) * 60_000 : undefined,
      doctor_id: status === 'waiting' || status === 'left' ? undefined : doctor.staff_id,
      day: v.day,
    }
    tickets.push(ticket)
    if (status !== 'done') return ticket

    const created = ticket.done_at!
    const consult: Consultation = {
      consultation_id: id('con'),
      patient_id: v.pt.patient_id,
      ticket_id: ticket.ticket_id,
      doctor_id: doctor.staff_id,
      service_type: tpl.service,
      consult_date: v.day,
      created_at: created,
      chief_complaint: tpl.complaint,
      treatment_notes: tpl.notes,
      vitals: tpl.service === 'Dental' ? undefined : { bp: `${between(110, 150)}/${between(70, 95)}`, temperature: `${(36.4 + rand() * 1.6).toFixed(1)}`, pulse: `${between(68, 98)}`, weight: `${between(48, 88)}` },
    }
    consultations.push(consult)
    diagnoses.push({ diagnosis_id: id('dx'), consultation_id: consult.consultation_id, ...tpl.diagnosis })
    const year = new Date(created).getFullYear()
    if (tpl.rx.length) {
      const rxId = id('rx')
      prescriptions.push({
        prescription_id: rxId,
        consultation_id: consult.consultation_id,
        patient_id: v.pt.patient_id,
        doctor_id: doctor.staff_id,
        signed_by: doctor.staff_id,
        status: 'signed',
        issued_at: created + 60_000,
        created_at: created,
        document_no: `RX-${year}-${pad(++rxCounter, 6)}`,
        signature: `${doctor.name} · PIN · ${new Date(created + 60_000).toISOString()}`,
        items: tpl.rx.map((r) => ({ ...r, item_id: id('rxi'), prescription_id: rxId })),
      })
    }
    if (tpl.certificate && chance(0.6)) {
      documents.push({
        document_id: id('doc'),
        patient_id: v.pt.patient_id,
        consultation_id: consult.consultation_id,
        doctor_id: doctor.staff_id,
        signed_by: doctor.staff_id,
        doc_type: 'Medical certificate',
        purpose: tpl.certificate.purpose,
        findings: tpl.diagnosis.description,
        rest_days: tpl.certificate.rest_days,
        status: 'signed',
        issued_at: created + 90_000,
        created_at: created,
        document_no: `MC-${year}-${pad(++mcCounter, 6)}`,
        signature: `${doctor.name} · PIN · ${new Date(created + 90_000).toISOString()}`,
      })
    }
    for (const test of tpl.labs ?? []) {
      const resulted = chance(0.8)
      labs.push({ lab_id: id('lab'), patient_id: v.pt.patient_id, consultation_id: consult.consultation_id, requested_by: doctor.staff_id, test_name: test, status: resulted ? 'resulted' : 'requested', result: resulted ? RESULTS[test] ?? 'Normal.' : undefined, result_date: resulted ? v.day : undefined, requested_at: created })
    }
    return ticket
  }

  const patientPool = patients.filter((p) => p.patient_id !== mlvPt.patient_id)
  // The last week is written by hand, not drawn at random, so the daily and weekly census read cleanly
  // when pitched: a busy Monday tapering to a half-day Saturday. Visits per weekday (Sun..Sat).
  const PITCH_VISITS = [0, 14, 12, 11, 13, 9, 6]
  const PITCH_DAYS = 6 // days before today
  // A few patients come back within the week, so visits are higher than distinct patients.
  const returning = patientPool.filter((p) => catsFor(p)[0] === 'regular').slice(0, 5)
  const pregnantPool = patientPool.filter((p) => personOf(p).sex === 'Female' && ageOf(personOf(p).birthdate) >= 24 && ageOf(personOf(p).birthdate) <= 36)
  for (let d = 91; d >= 1; d--) {
    const date = new Date(now - d * 86_400_000)
    const pitch = d <= PITCH_DAYS
    if (!pitch && (date.getDay() === 0 || date.getDay() === 6)) continue
    const day = dayKeyOffset(-d)
    const opening = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 30).getTime()
    const count = pitch ? PITCH_VISITS[date.getDay()] : between(8, 14)
    for (let i = 0; i < count; i++) {
      const left = chance(0.04)
      const extraCats: CategoryKey[] = []
      if (chance(0.03) || (pitch && i === 3)) extraCats.push('urgent')
      if (pitch && i === 5 && pregnantPool.length) extraCats.push('pregnant')
      const pt = pitch && i < 2 && returning.length ? returning[(d + i * 2) % returning.length] : pick(patientPool)
      makeVisit({ pt: i === 5 && pitch && pregnantPool.length ? pick(pregnantPool) : pt, day, checkIn: opening + i * between(12, 30) * 60_000, wait: between(6, 42), status: left ? 'left' : 'done', extraCats: extraCats.length ? extraCats : undefined })
    }
  }
  // Maria Lourdes' digital visits since go-live.
  const htn = TEMPLATES.find((t) => t.key === 'htn')!
  const uri = TEMPLATES.find((t) => t.key === 'uri')!
  makeVisit({ pt: mlvPt, day: dayKeyOffset(-74), checkIn: now - 74 * 86_400_000, wait: 18, tpl: htn, doctor: doctors[0] })
  makeVisit({ pt: mlvPt, day: dayKeyOffset(-31), checkIn: now - 31 * 86_400_000, wait: 12, tpl: { ...uri, rx: [{ drug_name: 'Azithromycin', dose: '500 mg tablet', frequency: 'Once a day for 3 days', quantity: 3 }, uri.rx[1]] }, doctor: doctors[1] })

  /* ---------------------------------- Today --------------------------------- */

  const today = todayKey()
  const minsAgo = (m: number) => now - m * 60_000
  const regulars = patientPool.filter((p) => catsFor(p)[0] === 'regular' && personOf(p).birthdate > `${thisYear - 59}`)
  const seniors = patientPool.filter((p) => catsFor(p).includes('senior'))
  const pwds = patientPool.filter((p) => p.pwd_id)
  const youngWomen = patientPool.filter((p) => personOf(p).sex === 'Female' && ageOf(personOf(p).birthdate) >= 24 && ageOf(personOf(p).birthdate) <= 36)
  const used = new Set<string>()
  const fresh = (pool: Patient[]) => {
    const p = pool.find((x) => !used.has(x.patient_id))!
    used.add(p.patient_id)
    return p
  }

  // First-time patients: no digital visit yet and no paper folder.
  const firstTimers = patientPool.filter((p) => !p.legacy_folder_no && !consultations.some((c) => c.patient_id === p.patient_id) && p.person_id !== newHire.person_id && ageOf(personOf(p).birthdate) >= 18)
  // Finished earlier this morning.
  ;[200, 182, 165, 150, 128, 104].forEach((m, i) => makeVisit({ pt: fresh(i === 1 || i === 4 ? (firstTimers.length > i ? firstTimers : regulars) : i === 2 ? seniors : regulars), day: today, checkIn: minsAgo(m), wait: [14, 22, 9, 31, 17, 12][i] }))
  // Left without being seen.
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(140), wait: 0, status: 'left' })
  // In consultation now and just called to the dental room.
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(52), wait: 38, status: 'in_consult', doctor: doctors[0], tpl: TEMPLATES.find((t) => t.key === 'fever') })
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(41), wait: 36, status: 'called', doctor: doctors[2], tpl: TEMPLATES.find((t) => t.key === 'toothache') })
  // Waiting, in mixed lanes so ranking is visible.
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(37), wait: 0, status: 'waiting', tpl: TEMPLATES.find((t) => t.key === 'backpain') })
  makeVisit({ pt: fresh(seniors), day: today, checkIn: minsAgo(29), wait: 0, status: 'waiting', tpl: htn })
  makeVisit({ pt: fresh(youngWomen), day: today, checkIn: minsAgo(22), wait: 0, status: 'waiting', extraCats: ['pregnant'], tpl: TEMPLATES.find((t) => t.key === 'headache') })
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(18), wait: 0, status: 'waiting', tpl: TEMPLATES.find((t) => t.key === 'prophy') })
  if (pwds.length) makeVisit({ pt: fresh(pwds), day: today, checkIn: minsAgo(11), wait: 0, status: 'waiting', tpl: TEMPLATES.find((t) => t.key === 'dm') })
  makeVisit({ pt: fresh(regulars), day: today, checkIn: minsAgo(6), wait: 0, status: 'waiting', tpl: uri })

  // Seed audit trail for today's activity.
  for (const t of tickets.filter((x) => x.day === today)) {
    const p = personOf(patients.find((x) => x.patient_id === t.patient_id)!)
    audit.push({ log_id: id('log'), staff_id: t.verified_by, action: 'verify', table_name: 'queue_ticket', record_id: t.ticket_id, summary: `Verified identity of ${p.full_name} against the HR list`, logged_at: t.checked_in_at - 30_000 })
    audit.push({ log_id: id('log'), staff_id: t.verified_by, action: 'check-in', table_name: 'queue_ticket', record_id: t.ticket_id, summary: `Issued queue number for ${p.full_name}`, logged_at: t.checked_in_at })
  }
  for (const c of consultations.filter((x) => x.consult_date === today)) {
    const p = personOf(patients.find((x) => x.patient_id === c.patient_id)!)
    audit.push({ log_id: id('log'), staff_id: c.doctor_id, action: 'create', table_name: 'consultation', record_id: c.consultation_id, summary: `Added consultation for ${p.full_name}`, logged_at: c.created_at })
    for (const rx of prescriptions.filter((r) => r.consultation_id === c.consultation_id)) audit.push({ log_id: id('log'), staff_id: c.doctor_id, action: 'sign', table_name: 'prescription', record_id: rx.prescription_id, summary: `Signed prescription ${rx.document_no}`, logged_at: rx.issued_at! })
    for (const d of documents.filter((r) => r.consultation_id === c.consultation_id)) audit.push({ log_id: id('log'), staff_id: c.doctor_id, action: 'sign', table_name: 'document', record_id: d.document_id, summary: `Signed medical certificate ${d.document_no}`, logged_at: d.issued_at! })
  }
  // One voided-and-reissued certificate earlier this week, to show the pattern in the audit trail.
  const sample = documents.filter((d) => d.issued_at && d.issued_at > now - 6 * 86_400_000)[0]
  if (sample) {
    sample.status = 'voided'
    sample.void_reason = 'Wrong number of rest days'
    const fixed: DocumentRow = { ...sample, document_id: id('doc'), status: 'signed', void_reason: undefined, rest_days: (sample.rest_days ?? 1) + 1, replaces: sample.document_id, issued_at: sample.issued_at! + 600_000, document_no: `MC-${thisYear}-${pad(++mcCounter, 6)}` }
    documents.push(fixed)
    audit.push({ log_id: id('log'), staff_id: sample.doctor_id, action: 'void', table_name: 'document', record_id: sample.document_id, summary: `Voided ${sample.document_no}: Wrong number of rest days`, logged_at: sample.issued_at! + 540_000 })
    audit.push({ log_id: id('log'), staff_id: sample.doctor_id, action: 'sign', table_name: 'document', record_id: fixed.document_id, summary: `Signed replacement ${fixed.document_no}`, logged_at: fixed.issued_at! })
  }
  audit.push({ log_id: id('log'), staff_id: 'st-d1', action: 'import', table_name: 'employee', record_id: 'hr-list', summary: 'Imported HR employee list (synthetic): 200 employees, patient records created', logged_at: now - 92 * 86_400_000 })
  audit.sort((a, b) => b.logged_at - a.logged_at)

  return {
    persons,
    employees,
    patients,
    relationships,
    familyHistory,
    allergies,
    categories: DEFAULT_CATEGORIES,
    tickets,
    consultations,
    diagnoses,
    labs,
    prescriptions,
    documents,
    scans,
    staff: STAFF,
    audit,
    counters: { rx: rxCounter, mc: mcCounter, patient: patientCounter },
    lastImport: { at: now - 92 * 86_400_000, count: 200, source: 'Synthetic HR list (demo)' },
  }
}

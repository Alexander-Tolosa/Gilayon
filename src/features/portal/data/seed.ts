import { dayOffset, img, PHOTOS } from '../../../shared/lib/utils'
import type {
  Appointment,
  AuditEntry,
  Doctor,
  Invoice,
  LabOrder,
  Message,
  Patient,
  Staff,
  Task,
  VitalReading,
} from './types'

export const DOCTORS: Doctor[] = [
  {
    id: 'd1',
    name: 'Dr. Miguel Santos',
    specialty: 'Internal Medicine',
    photo: img.unsplash(PHOTOS.drMale, 240, 240),
    hours: ['08:00', '16:00'],
    room: 'Room 204',
    years: 14,
    rating: 4.9,
    bio: 'Chronic care for diabetes, hypertension and heart health.',
  },
  {
    id: 'd2',
    name: 'Dr. Helena Park',
    specialty: 'Family Medicine',
    photo: img.unsplash(PHOTOS.drFemale, 240, 240),
    hours: ['09:00', '17:00'],
    room: 'Room 112',
    years: 11,
    rating: 4.8,
    bio: 'Whole-family primary care, check-ups and preventive screening.',
  },
  {
    id: 'd3',
    name: 'Dr. Rafael Okafor',
    specialty: 'Cardiology',
    photo: img.portrait('men', 75),
    hours: ['10:00', '15:30'],
    room: 'Room 310',
    years: 18,
    rating: 4.9,
    bio: 'Heart rhythm, blood pressure and cardiac imaging.',
  },
  {
    id: 'd4',
    name: 'Dr. Lucia Bennett',
    specialty: 'Pediatrics',
    photo: img.portrait('women', 65),
    hours: ['08:30', '14:30'],
    room: 'Room 108',
    years: 9,
    rating: 4.7,
    bio: 'Newborn to teen care, vaccines and growth checks.',
  },
  {
    id: 'd5',
    name: 'Dr. Arjun Mehta',
    specialty: 'Endocrinology',
    photo: img.portrait('men', 52),
    hours: ['09:00', '16:30'],
    room: 'Room 215',
    years: 12,
    rating: 4.8,
    bio: 'Thyroid, diabetes and hormone disorders.',
  },
]

export const STAFF: Staff[] = [
  {
    id: 's1',
    name: 'Joanna Reyes',
    title: 'Front Desk Lead',
    photo: img.portrait('women', 44),
    email: 'joanna.reyes@gilayon.health',
  },
]

/** Quarterly readings over ~3 years that show a real improvement trend. */
function chronicVitals(): VitalReading[] {
  const rows: Array<[number, number, number, number, number, number, number]> = [
    // offsetDays, sys, dia, hr, weight, a1c, ldl
    [-1080, 152, 96, 84, 86.4, 8.4, 168],
    [-990, 149, 95, 82, 85.9, 8.2, 164],
    [-900, 146, 93, 83, 85.1, 8.1, 159],
    [-810, 144, 92, 80, 84.6, 7.9, 151],
    [-720, 141, 90, 79, 83.8, 7.8, 146],
    [-630, 139, 89, 80, 83.1, 7.6, 139],
    [-540, 138, 88, 78, 82.7, 7.5, 133],
    [-450, 136, 87, 77, 82.2, 7.4, 128],
    [-360, 135, 86, 78, 81.6, 7.3, 124],
    [-270, 134, 85, 76, 81.0, 7.2, 121],
    [-180, 133, 85, 75, 80.4, 7.2, 119],
    [-90, 131, 84, 74, 79.8, 7.1, 116],
    [-14, 138, 88, 76, 79.5, 7.1, 114],
  ]
  return rows.map(([off, systolic, diastolic, heartRate, weight, a1c, ldl]) => ({
    date: dayOffset(off),
    systolic,
    diastolic,
    heartRate,
    weight,
    a1c,
    ldl,
    glucose: Math.round(a1c * 28.7 - 46.7),
  }))
}

function simpleVitals(sys: number, dia: number, hr: number, weight: number): VitalReading[] {
  return [-360, -180, -30].map((off, i) => ({
    date: dayOffset(off),
    systolic: sys + (2 - i) * 2,
    diastolic: dia + (2 - i),
    heartRate: hr - i,
    weight: +(weight + (2 - i) * 0.4).toFixed(1),
  }))
}

const andreaLabs: LabOrder[] = [
  {
    id: 'lab-a1',
    name: 'Hemoglobin A1C',
    kind: 'Lab',
    orderedBy: 'Dr. Miguel Santos',
    date: dayOffset(-14),
    facility: 'Northbridge Diagnostics',
    status: 'resulted',
    results: [{ name: 'HbA1c', value: '7.1', unit: '%', range: '< 5.7', flag: 'high' }],
  },
  {
    id: 'lab-a2',
    name: 'Lipid Panel',
    kind: 'Lab',
    orderedBy: 'Dr. Miguel Santos',
    date: dayOffset(-14),
    facility: 'Northbridge Diagnostics',
    status: 'resulted',
    results: [
      { name: 'Total cholesterol', value: '182', unit: 'mg/dL', range: '< 200', flag: 'normal' },
      { name: 'LDL', value: '114', unit: 'mg/dL', range: '< 100', flag: 'high' },
      { name: 'HDL', value: '52', unit: 'mg/dL', range: '> 50', flag: 'normal' },
      { name: 'Triglycerides', value: '138', unit: 'mg/dL', range: '< 150', flag: 'normal' },
    ],
  },
  {
    id: 'lab-a3',
    name: 'Basic Metabolic Panel',
    kind: 'Lab',
    orderedBy: 'Dr. Miguel Santos',
    date: dayOffset(-14),
    facility: 'Northbridge Diagnostics',
    status: 'resulted',
    results: [
      { name: 'Creatinine', value: '0.9', unit: 'mg/dL', range: '0.6 - 1.1', flag: 'normal' },
      { name: 'eGFR', value: '84', unit: 'mL/min', range: '> 60', flag: 'normal' },
      { name: 'Potassium', value: '5.3', unit: 'mmol/L', range: '3.5 - 5.1', flag: 'high' },
      { name: 'Fasting glucose', value: '157', unit: 'mg/dL', range: '70 - 99', flag: 'high' },
    ],
  },
  {
    id: 'lab-a4',
    name: 'Chest X-ray (PA view)',
    kind: 'Imaging',
    orderedBy: 'Dr. Rafael Okafor',
    date: dayOffset(-212),
    facility: 'St. Clare Radiology',
    status: 'resulted',
    results: [{ name: 'Impression', value: 'No acute findings', unit: '', range: '', flag: 'normal' }],
    note: 'Heart size normal. Lungs clear.',
  },
  {
    id: 'lab-a5',
    name: 'Urine Microalbumin',
    kind: 'Lab',
    orderedBy: 'Dr. Miguel Santos',
    date: dayOffset(-2),
    facility: 'Northbridge Diagnostics',
    status: 'in-progress',
    results: [],
  },
]

const andrea: Patient = {
  id: 'RC-10482',
  name: 'Andrea Villanueva',
  age: 52,
  sex: 'Female',
  dob: '1974-03-18',
  phone: '+1 (312) 847-1928',
  email: 'andrea.v@mail.com',
  photo: img.portrait('women', 68),
  bloodType: 'O+',
  address: '418 Lakeview Ave, Chicago, IL',
  doctorId: 'd1',
  reason: 'Quarterly diabetes and blood pressure follow-up',
  conditions: ['Type 2 diabetes', 'Hypertension', 'High cholesterol'],
  allergies: ['Penicillin', 'Shellfish'],
  medications: [
    { id: 'm1', name: 'Metformin', dose: '500 mg', frequency: 'Twice daily with meals', prescribedBy: 'Dr. Miguel Santos', since: dayOffset(-1100), status: 'active', refillsLeft: 2, pharmacy: 'Walgreens, Lakeview' },
    { id: 'm2', name: 'Losartan', dose: '50 mg', frequency: 'Once daily', prescribedBy: 'Dr. Miguel Santos', since: dayOffset(-900), status: 'active', refillsLeft: 0, pharmacy: 'Walgreens, Lakeview' },
    { id: 'm3', name: 'Atorvastatin', dose: '20 mg', frequency: 'Once daily at night', prescribedBy: 'Dr. Rafael Okafor', since: dayOffset(-700), status: 'active', refillsLeft: 4, pharmacy: 'Walgreens, Lakeview' },
    { id: 'm4', name: 'Glipizide', dose: '5 mg', frequency: 'Once daily', prescribedBy: 'Dr. Miguel Santos', since: dayOffset(-1000), status: 'stopped' },
  ],
  immunizations: [
    { name: 'Influenza (seasonal)', date: dayOffset(-25) },
    { name: 'COVID-19 booster', date: dayOffset(-310) },
    { name: 'Tdap', date: dayOffset(-1500) },
    { name: 'Pneumococcal (PCV20)', date: dayOffset(-640) },
  ],
  vitals: chronicVitals(),
  labs: andreaLabs,
  visits: [
    {
      id: 'v-a1',
      date: dayOffset(-14),
      doctorId: 'd1',
      type: 'Chronic care follow-up',
      template: 'SOAP',
      notes: {
        Subjective: 'Feels well. Occasional fatigue after lunch. Taking metformin consistently, missed losartan 3 to 4 times this month.',
        Objective: 'BP 138/88, HR 76, weight 79.5 kg. Feet: sensation intact, no ulcers.',
        Assessment: 'Type 2 diabetes improving (A1C 7.1). Hypertension above goal, likely adherence related.',
        Plan: 'Continue metformin. Reinforce daily losartan, set phone reminder. Repeat A1C in 3 months. Refer to ophthalmology for annual eye exam.',
      },
      diagnoses: ['E11.9 Type 2 diabetes', 'I10 Essential hypertension'],
      summary: 'Your diabetes is improving. Blood pressure is a little high, so take losartan every day. We referred you for an eye exam.',
      prescriptions: ['Metformin 500 mg twice daily'],
      orders: ['Hemoglobin A1C', 'Lipid Panel', 'Basic Metabolic Panel'],
    },
    {
      id: 'v-a2',
      date: dayOffset(-104),
      doctorId: 'd1',
      type: 'Chronic care follow-up',
      template: 'SOAP',
      notes: {
        Subjective: 'No complaints. Walking 20 minutes daily.',
        Objective: 'BP 131/84, HR 74, weight 79.8 kg.',
        Assessment: 'Diabetes and blood pressure trending toward goal.',
        Plan: 'Continue current medications. Recheck in 3 months.',
      },
      diagnoses: ['E11.9 Type 2 diabetes', 'I10 Essential hypertension'],
      summary: 'Great progress. Keep up the daily walks and current medicines.',
      prescriptions: [],
      orders: ['Hemoglobin A1C'],
    },
    {
      id: 'v-a3',
      date: dayOffset(-212),
      doctorId: 'd3',
      type: 'Cardiology consult',
      template: 'SOAP',
      notes: {
        Subjective: 'Referred for cholesterol and BP review. Occasional palpitations with coffee.',
        Objective: 'ECG normal sinus rhythm. Chest X-ray clear.',
        Assessment: 'Mixed hyperlipidemia. No structural heart disease.',
        Plan: 'Start atorvastatin 20 mg. Limit caffeine. Return to primary care.',
      },
      diagnoses: ['E78.2 Mixed hyperlipidemia'],
      summary: 'Your heart tests are normal. We started a cholesterol medicine.',
      prescriptions: ['Atorvastatin 20 mg at night'],
      orders: ['Chest X-ray (PA view)', 'ECG'],
    },
  ],
  referrals: [
    { id: 'r-a1', to: 'Dr. Naomi Castillo', specialty: 'Ophthalmology', reason: 'Annual diabetic eye exam', date: dayOffset(-14), status: 'sent', direction: 'outgoing' },
    { id: 'r-a2', to: 'Dr. Rafael Okafor', specialty: 'Cardiology', reason: 'Cholesterol and BP review', date: dayOffset(-230), status: 'completed', direction: 'outgoing' },
  ],
  insurance: { provider: 'BlueCross PPO', memberId: 'BCX-448-2190', status: 'verified', checkedAt: Date.now() - 86_400_000 * 3 },
  lastEyeExam: dayOffset(-470),
  lastMammogram: dayOffset(-400),
  lastColonoscopy: dayOffset(-1400),
  createdAt: dayOffset(-1120),
}

type Lite = [
  id: string,
  name: string,
  age: number,
  sex: Patient['sex'],
  photo: string | undefined,
  doctorId: string,
  conditions: string[],
  allergies: string[],
  reason: string,
  meds: Array<[string, string, string]>,
  insurer: string,
  insStatus: Patient['insurance']['status'],
  vitals: [number, number, number, number],
  lastEye?: number,
]

const LITE: Lite[] = [
  ['RC-10511', 'Marcus Hale', 61, 'Male', img.portrait('men', 41), 'd1', ['Type 2 diabetes', 'Chronic kidney disease (stage 2)'], ['Sulfa drugs'], 'Diabetes review and kidney function check', [['Metformin', '1000 mg', 'Twice daily'], ['Empagliflozin', '10 mg', 'Once daily']], 'Aetna Choice', 'verified', [142, 90, 78, 92.1], -540],
  ['RC-10527', 'Priya Raman', 34, 'Female', img.portrait('women', 26), 'd2', ['Asthma'], [], 'Persistent cough for 2 weeks', [['Albuterol inhaler', '90 mcg', 'As needed']], 'Cigna Open Access', 'verified', [118, 76, 72, 61.4]],
  ['RC-10533', 'Tomás Delgado', 47, 'Male', img.portrait('men', 22), 'd3', ['Hypertension', 'Atrial fibrillation'], ['Aspirin'], 'Palpitations and dizziness', [['Apixaban', '5 mg', 'Twice daily'], ['Metoprolol', '50 mg', 'Twice daily']], 'UnitedHealthcare', 'pending', [146, 92, 88, 88.0]],
  ['RC-10548', 'Grace Whitfield', 68, 'Female', img.portrait('women', 79), 'd1', ['Type 2 diabetes', 'Osteoarthritis'], ['Codeine'], 'Knee pain and sugar control', [['Metformin', '500 mg', 'Twice daily'], ['Paracetamol', '500 mg', 'As needed']], 'Medicare Part B', 'verified', [136, 82, 70, 74.2], -720],
  ['RC-10552', 'Daniel Osei', 29, 'Male', img.portrait('men', 85), 'd2', [], [], 'Annual physical and work clearance', [], 'Cigna Open Access', 'verified', [120, 78, 64, 77.0]],
  ['RC-10566', 'Mei Lin Chua', 41, 'Female', img.portrait('women', 33), 'd5', ['Hypothyroidism'], ['Latex'], 'Fatigue and weight gain', [['Levothyroxine', '75 mcg', 'Once daily before breakfast']], 'BlueCross PPO', 'expired', [124, 80, 66, 68.5]],
  ['RC-10571', 'Noah Fischer', 8, 'Male', img.portrait('men', 9), 'd4', ['Seasonal allergies'], ['Peanuts'], 'Ear pain and fever', [['Cetirizine', '5 mg', 'Once daily']], 'Aetna Choice', 'verified', [102, 64, 96, 27.3]],
  ['RC-10584', 'Isabel Moreno', 57, 'Female', img.portrait('women', 52), 'd1', ['Type 2 diabetes', 'Hypertension'], [], 'Medication refill and BP check', [['Metformin', '850 mg', 'Twice daily'], ['Amlodipine', '5 mg', 'Once daily']], 'Humana Gold', 'verified', [150, 94, 80, 83.6], -420],
  ['RC-10590', 'Kwame Asante', 72, 'Male', img.portrait('men', 66), 'd3', ['Coronary artery disease', 'High cholesterol'], ['Penicillin'], 'Chest tightness on exertion', [['Atorvastatin', '40 mg', 'Once daily'], ['Clopidogrel', '75 mg', 'Once daily']], 'Medicare Part B', 'verified', [138, 84, 72, 79.9]],
  ['RC-10602', 'Sofia Lindqvist', 26, 'Female', undefined, 'd2', [], [], 'Migraine episodes', [['Sumatriptan', '50 mg', 'As needed']], 'UnitedHealthcare', 'verified', [114, 72, 68, 58.0]],
  ['RC-10615', 'Ethan Brooks', 45, 'Male', img.portrait('men', 14), 'd5', ['Type 2 diabetes', 'Obesity'], [], 'New diabetes diagnosis, starting care plan', [['Metformin', '500 mg', 'Once daily']], 'Aetna Choice', 'pending', [140, 88, 82, 104.5], -900],
  ['RC-10623', 'Hana Yoshida', 38, 'Female', img.portrait('women', 12), 'd2', ['Anxiety'], ['Ibuprofen'], 'Sleep problems and stress', [['Sertraline', '50 mg', 'Once daily']], 'Cigna Open Access', 'verified', [116, 74, 70, 55.2]],
]

function litePatient(l: Lite, i: number): Patient {
  const [id, name, age, sex, photo, doctorId, conditions, allergies, reason, meds, insurer, insStatus, [sys, dia, hr, wt], lastEye] = l
  const doc = DOCTORS.find((d) => d.id === doctorId)!
  const plain = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const first = plain.split(' ')[0]
  return {
    id,
    name,
    age,
    sex,
    dob: `${new Date().getFullYear() - age}-0${(i % 9) + 1}-1${i % 9}`,
    phone: `+1 (312) 55${i}-0${(i * 37) % 900 + 100}`,
    email: `${first}.${plain.split(' ')[1]}@mail.com`,
    photo,
    bloodType: ['A+', 'B+', 'O+', 'AB+', 'O-', 'A-'][i % 6],
    address: `${120 + i * 31} ${['Maple St', 'Grand Ave', 'Elm Ct', 'Wells St', 'Belmont Ave'][i % 5]}, Chicago, IL`,
    doctorId,
    reason,
    conditions,
    allergies,
    medications: meds.map(([n, dose, freq], j) => ({
      id: `${id}-m${j}`,
      name: n,
      dose,
      frequency: freq,
      prescribedBy: doc.name,
      since: dayOffset(-200 - j * 120),
      status: 'active' as const,
      refillsLeft: (i + j) % 4,
    })),
    immunizations: [{ name: 'Influenza (seasonal)', date: dayOffset(-40 - i * 9) }],
    vitals: simpleVitals(sys, dia, hr, wt),
    labs: [
      {
        id: `${id}-l1`,
        name: 'Complete Blood Count',
        kind: 'Lab',
        orderedBy: doc.name,
        date: dayOffset(-30 - i * 3),
        facility: 'Northbridge Diagnostics',
        status: 'resulted',
        results: [
          { name: 'Hemoglobin', value: String(13 + (i % 3) * 0.4), unit: 'g/dL', range: '12 - 16', flag: 'normal' },
          { name: 'WBC', value: i === 6 ? '13.2' : String(6 + (i % 4) * 0.5), unit: 'x10³/µL', range: '4.5 - 11', flag: i === 6 ? 'high' : 'normal' },
        ],
      },
    ],
    visits: [
      {
        id: `${id}-v1`,
        date: dayOffset(-30 - i * 3),
        doctorId,
        type: 'Consultation',
        template: 'SOAP',
        notes: {
          Subjective: reason,
          Objective: `BP ${sys}/${dia}, HR ${hr}.`,
          Assessment: conditions[0] ?? 'Healthy adult',
          Plan: 'Continue plan. Follow up as needed.',
        },
        diagnoses: conditions.length ? [conditions[0]] : ['Z00.00 General exam'],
        summary: 'Visit completed. Follow the plan your doctor shared.',
        prescriptions: [],
        orders: ['Complete Blood Count'],
      },
    ],
    referrals: [],
    insurance: { provider: insurer, memberId: `${insurer.slice(0, 3).toUpperCase()}-${700 + i * 13}-${4000 + i * 77}`, status: insStatus },
    lastEyeExam: lastEye !== undefined ? dayOffset(lastEye) : undefined,
    createdAt: dayOffset(-400 - i * 40),
  }
}

export const PATIENTS: Patient[] = [andrea, ...LITE.map(litePatient)]

const apt = (
  id: string,
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
  status: Appointment['status'],
  reason: string,
  mode: Appointment['mode'] = 'In-person',
  checkedInMinutesAgo?: number,
): Appointment => ({
  id,
  patientId,
  doctorId,
  date,
  time,
  mode,
  reason,
  status,
  checkedInAt: checkedInMinutesAgo !== undefined ? Date.now() - checkedInMinutesAgo * 60_000 : undefined,
  reminders: { sms: true, email: true },
})

const T = dayOffset(0)

export const APPOINTMENTS: Appointment[] = [
  // Today
  apt('a-01', 'RC-10584', 'd1', T, '08:30', 'completed', 'Medication refill and BP check'),
  apt('a-02', 'RC-10482', 'd1', T, '09:30', 'checked-in', 'Quarterly diabetes and BP follow-up', 'In-person', 12),
  apt('a-03', 'RC-10511', 'd1', T, '10:15', 'confirmed', 'Diabetes review and kidney function'),
  apt('a-04', 'RC-10548', 'd1', T, '11:00', 'confirmed', 'Knee pain and sugar control', 'Telehealth'),
  apt('a-05', 'RC-10615', 'd1', T, '13:30', 'confirmed', 'New diabetes care plan'),
  apt('a-06', 'RC-10527', 'd2', T, '09:00', 'checked-in', 'Persistent cough for 2 weeks', 'In-person', 26),
  apt('a-07', 'RC-10552', 'd2', T, '10:00', 'confirmed', 'Annual physical'),
  apt('a-08', 'RC-10602', 'd2', T, '14:00', 'confirmed', 'Migraine episodes', 'Telehealth'),
  apt('a-09', 'RC-10533', 'd3', T, '10:30', 'checked-in', 'Palpitations and dizziness', 'In-person', 5),
  apt('a-10', 'RC-10590', 'd3', T, '12:00', 'confirmed', 'Chest tightness on exertion'),
  apt('a-11', 'RC-10571', 'd4', T, '09:15', 'in-consult', 'Ear pain and fever'),
  apt('a-12', 'RC-10566', 'd5', T, '11:30', 'no-show', 'Fatigue and weight gain'),
  apt('a-13', 'RC-10623', 'd2', T, '15:30', 'confirmed', 'Sleep problems and stress', 'Telehealth'),
  // Requests waiting for front desk
  apt('a-20', 'RC-10566', 'd5', dayOffset(2), '10:00', 'requested', 'Reschedule thyroid follow-up'),
  apt('a-21', 'RC-10527', 'd2', dayOffset(3), '15:00', 'requested', 'Asthma review', 'Telehealth'),
  apt('a-22', 'RC-10590', 'd3', dayOffset(5), '11:30', 'requested', 'Stress test results'),
  // Upcoming
  apt('a-30', 'RC-10482', 'd5', dayOffset(9), '14:30', 'confirmed', 'Endocrinology review', 'Telehealth'),
  apt('a-31', 'RC-10511', 'd1', dayOffset(1), '09:00', 'confirmed', 'Lab review'),
  apt('a-32', 'RC-10552', 'd2', dayOffset(1), '11:00', 'confirmed', 'Vaccination'),
  apt('a-33', 'RC-10623', 'd2', dayOffset(2), '16:00', 'confirmed', 'Follow-up', 'Telehealth'),
  apt('a-34', 'RC-10533', 'd3', dayOffset(4), '10:00', 'confirmed', 'Holter monitor fitting'),
  apt('a-35', 'RC-10548', 'd1', dayOffset(3), '13:00', 'confirmed', 'Knee X-ray review'),
  // Past
  apt('a-40', 'RC-10482', 'd1', dayOffset(-14), '10:00', 'completed', 'Chronic care follow-up'),
  apt('a-41', 'RC-10482', 'd1', dayOffset(-104), '09:30', 'completed', 'Chronic care follow-up'),
  apt('a-42', 'RC-10482', 'd3', dayOffset(-212), '11:00', 'completed', 'Cardiology consult'),
  apt('a-43', 'RC-10552', 'd2', dayOffset(-7), '10:00', 'cancelled', 'Annual physical'),
  apt('a-44', 'RC-10511', 'd1', dayOffset(-3), '09:00', 'completed', 'Kidney labs'),
  apt('a-45', 'RC-10615', 'd5', dayOffset(-6), '14:00', 'no-show', 'Diabetes education'),
]

const min = 60_000

export const MESSAGES: Message[] = [
  { id: 'msg-1', patientId: 'RC-10482', from: 'care-team', author: 'Dr. Miguel Santos', text: 'Hi Andrea, your A1C dropped to 7.1. That is real progress. Your potassium is slightly high, so please skip bananas and salt substitutes until we recheck.', at: Date.now() - 2 * 86_400_000 },
  { id: 'msg-2', patientId: 'RC-10482', from: 'patient', author: 'Andrea Villanueva', text: 'Thank you doctor! Should I still take losartan every morning?', at: Date.now() - 2 * 86_400_000 + 40 * min },
  { id: 'msg-3', patientId: 'RC-10482', from: 'care-team', author: 'Dr. Miguel Santos', text: 'Yes, every morning. We will review it at your visit today.', at: Date.now() - 2 * 86_400_000 + 95 * min },
  { id: 'msg-4', patientId: 'RC-10482', from: 'care-team', author: 'Joanna Reyes · Front desk', text: 'Reminder: your visit is today at 9:30 AM in Room 204. Please bring your glucose log.', at: Date.now() - 5 * 60 * min },
]

export const TASKS: Task[] = [
  { id: 't1', title: 'Call Andrea Villanueva about potassium result', assignee: 'Nurse Carla', patientId: 'RC-10482', due: dayOffset(0), priority: 'high', done: false },
  { id: 't2', title: 'Verify UnitedHealthcare eligibility for Tomás Delgado', assignee: 'Joanna Reyes', patientId: 'RC-10533', due: dayOffset(0), priority: 'high', done: false },
  { id: 't3', title: 'Renew expired BlueCross card for Mei Lin Chua', assignee: 'Joanna Reyes', patientId: 'RC-10566', due: dayOffset(1), priority: 'normal', done: false },
  { id: 't4', title: 'Send ophthalmology referral notes', assignee: 'Joanna Reyes', patientId: 'RC-10482', due: dayOffset(0), priority: 'normal', done: true },
  { id: 't5', title: 'Rebook no-show: Ethan Brooks diabetes education', assignee: 'Joanna Reyes', patientId: 'RC-10615', due: dayOffset(1), priority: 'normal', done: false },
  { id: 't6', title: 'Fax discharge summary to St. Clare', assignee: 'Nurse Carla', patientId: 'RC-10590', due: dayOffset(2), priority: 'low', done: false },
]

export const INVOICES: Invoice[] = [
  { id: 'INV-3301', patientId: 'RC-10482', date: dayOffset(-14), description: 'Established patient visit, moderate', cpt: '99214', icd: 'E11.9', amount: 185, payer: 'BlueCross PPO', status: 'paid' },
  { id: 'INV-3302', patientId: 'RC-10482', date: dayOffset(-14), description: 'Hemoglobin A1C', cpt: '83036', icd: 'E11.9', amount: 42, payer: 'BlueCross PPO', status: 'paid' },
  { id: 'INV-3310', patientId: 'RC-10511', date: dayOffset(-3), description: 'Established patient visit, moderate', cpt: '99214', icd: 'E11.22', amount: 185, payer: 'Aetna Choice', status: 'submitted' },
  { id: 'INV-3311', patientId: 'RC-10533', date: dayOffset(-9), description: 'ECG with interpretation', cpt: '93000', icd: 'I48.91', amount: 96, payer: 'UnitedHealthcare', status: 'denied' },
  { id: 'INV-3312', patientId: 'RC-10584', date: dayOffset(0), description: 'Established patient visit, low', cpt: '99213', icd: 'I10', amount: 132, payer: 'Humana Gold', status: 'draft' },
  { id: 'INV-3313', patientId: 'RC-10566', date: dayOffset(-21), description: 'TSH panel', cpt: '84443', icd: 'E03.9', amount: 58, payer: 'BlueCross PPO', status: 'denied' },
  { id: 'INV-3314', patientId: 'RC-10590', date: dayOffset(-5), description: 'Cardiac stress test', cpt: '93015', icd: 'I25.10', amount: 420, payer: 'Medicare Part B', status: 'submitted' },
  { id: 'INV-3315', patientId: 'RC-10552', date: dayOffset(-40), description: 'Preventive visit, 18-39', cpt: '99395', icd: 'Z00.00', amount: 210, payer: 'Cigna Open Access', status: 'paid' },
  { id: 'INV-3316', patientId: 'RC-10571', date: dayOffset(-12), description: 'New patient visit, low', cpt: '99203', icd: 'H66.90', amount: 165, payer: 'Aetna Choice', status: 'paid' },
]

export const AUDIT: AuditEntry[] = [
  { id: 'au1', at: Date.now() - 4 * min, actor: 'Joanna Reyes', role: 'secretary', action: 'Checked in patient', target: 'Tomás Delgado (RC-10533)' },
  { id: 'au2', at: Date.now() - 12 * min, actor: 'Joanna Reyes', role: 'secretary', action: 'Checked in patient', target: 'Andrea Villanueva (RC-10482)' },
  { id: 'au3', at: Date.now() - 31 * min, actor: 'Dr. Lucia Bennett', role: 'doctor', action: 'Opened clinical chart', target: 'Noah Fischer (RC-10571)' },
  { id: 'au4', at: Date.now() - 58 * min, actor: 'Dr. Miguel Santos', role: 'doctor', action: 'Signed visit note', target: 'Isabel Moreno (RC-10584)' },
  { id: 'au5', at: Date.now() - 64 * min, actor: 'Dr. Miguel Santos', role: 'doctor', action: 'Sent e-prescription', target: 'Amlodipine 5 mg to CVS Wells St' },
  { id: 'au6', at: Date.now() - 90 * min, actor: 'System', role: 'system', action: 'Imported lab results (HL7)', target: 'Northbridge Diagnostics, 14 results' },
  { id: 'au7', at: Date.now() - 2 * 60 * min, actor: 'Andrea Villanueva', role: 'patient', action: 'Viewed lab results', target: 'Lipid Panel' },
  { id: 'au8', at: Date.now() - 3 * 60 * min, actor: 'Joanna Reyes', role: 'secretary', action: 'Attempted to open clinical notes (denied)', target: 'Marcus Hale (RC-10511)' },
  { id: 'au9', at: Date.now() - 5 * 60 * min, actor: 'System', role: 'system', action: 'Encrypted backup completed', target: 'us-east-2 and us-west-1 replicas' },
  { id: 'au10', at: Date.now() - 20 * 60 * min, actor: 'Dr. Rafael Okafor', role: 'doctor', action: 'Shared record via HIE', target: 'Kwame Asante to St. Clare Hospital' },
]

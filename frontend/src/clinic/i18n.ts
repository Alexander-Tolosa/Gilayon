import { useSyncExternalStore } from 'react'

/*
  English and Filipino labels, switchable on every clinic screen.
  Keys are the English text; missing Filipino entries fall back to English.
*/

export type Lang = 'en' | 'fil'
const KEY = 'himsog-lang'
const EVT = 'himsog-lang-change'

const FIL: Record<string, string> = {
  'Check in': 'Mag-check in',
  'Check-in': 'Pag-check in',
  Queue: 'Pila',
  'Queue board': 'Listahan ng pila',
  Patients: 'Mga pasyente',
  'Patient registry': 'Talaan ng mga pasyente',
  'Employee list': 'Listahan ng empleyado',
  'My queue': 'Aking pila',
  Documents: 'Mga dokumento',
  'Daily report': 'Ulat sa araw',
  'Audit trail': 'Talaan ng pagbabago',
  Settings: 'Mga setting',
  'Waiting screen': 'Screen ng naghihintay',
  'Sign out': 'Mag-sign out',
  'Search by name or employee ID': 'Hanapin ayon sa pangalan o employee ID',
  'Search patients': 'Hanapin ang pasyente',
  Search: 'Hanapin',
  Verify: 'I-verify',
  'Verify identity': 'I-verify ang pagkakakilanlan',
  'Full name': 'Buong pangalan',
  Birthdate: 'Petsa ng kapanganakan',
  'Employee ID': 'Employee ID',
  Office: 'Tanggapan',
  Position: 'Posisyon',
  Age: 'Edad',
  Sex: 'Kasarian',
  Female: 'Babae',
  Male: 'Lalaki',
  'Civil status': 'Katayuang sibil',
  Single: 'Walang asawa',
  Married: 'May asawa',
  Widowed: 'Balo',
  Separated: 'Hiwalay',
  Contact: 'Numero ng telepono',
  'PhilHealth PIN': 'PhilHealth PIN',
  'PWD ID': 'PWD ID',
  'Old folder no.': 'Lumang folder no.',
  'Matches the HR list': 'Tugma sa listahan ng HR',
  'Does not match the HR list': 'Hindi tugma sa listahan ng HR',
  'Past patient with records?': 'Dating pasyente na may rekord?',
  'Yes, open the record': 'Oo, buksan ang rekord',
  'No, new to the clinic': 'Hindi, bago sa klinika',
  'Priority lane': 'Prayoridad na linya',
  Urgent: 'Kagyat',
  Pregnant: 'Buntis',
  PWD: 'PWD',
  Senior: 'Senior',
  Regular: 'Regular',
  Service: 'Serbisyo',
  Medical: 'Medikal',
  Dental: 'Dental',
  Laboratory: 'Laboratoryo',
  'Issue queue number': 'Magbigay ng numero sa pila',
  'Queue number': 'Numero sa pila',
  'Print slip': 'I-print ang slip',
  'Check in next patient': 'Susunod na pasyente',
  Waiting: 'Naghihintay',
  Called: 'Tinawag',
  'In consultation': 'Nasa konsulta',
  Done: 'Tapos na',
  'Left without being seen': 'Umalis bago matingnan',
  'Now serving': 'Kasalukuyang tinatawag',
  'Next in line': 'Susunod sa pila',
  'Please wait for your number to be called.': 'Pakihintay na tawagin ang inyong numero.',
  'Call next patient': 'Tawagin ang susunod',
  'Start consultation': 'Simulan ang konsulta',
  'Open record': 'Buksan ang rekord',
  Consultation: 'Konsulta',
  Consultations: 'Mga konsulta',
  'Chief complaint': 'Pangunahing reklamo',
  'Treatment notes': 'Mga tala sa gamutan',
  Diagnosis: 'Diyagnosis',
  Prescription: 'Reseta',
  'Medical certificate': 'Medical certificate',
  Templates: 'Mga template',
  'Vital signs': 'Vital signs',
  'Lab requests': 'Mga lab request',
  'Save and sign': 'I-save at pirmahan',
  'Save consultation': 'I-save ang konsulta',
  Sign: 'Pirmahan',
  'Enter your PIN': 'Ilagay ang iyong PIN',
  Print: 'I-print',
  Void: 'Ipawalang-bisa',
  Reissue: 'Muling ilabas',
  Reason: 'Dahilan',
  Signed: 'Napirmahan',
  Draft: 'Draft',
  Voided: 'Walang-bisa',
  'Not yet signed': 'Hindi pa napirmahan',
  Overview: 'Buod',
  Family: 'Pamilya',
  'Family history': 'Kasaysayan ng sakit sa pamilya',
  Relatives: 'Mga kamag-anak',
  'Old paper records': 'Lumang papel na rekord',
  'Attach scan': 'Ilakip ang scan',
  'Lab results': 'Resulta ng lab',
  Allergies: 'Mga allergy',
  'No known allergies': 'Walang kilalang allergy',
  'Print patient summary': 'I-print ang buod ng pasyente',
  'Visits today': 'Mga bisita ngayon',
  'Average wait': 'Karaniwang paghihintay',
  'New patients': 'Bagong pasyente',
  'Returning patients': 'Dating pasyente',
  'Common complaints': 'Karaniwang reklamo',
  'Documents issued': 'Mga dokumentong nailabas',
  Online: 'Online',
  'Clinic network only': 'Network ng klinika lamang',
  'Offline, saved on this computer': 'Offline, naka-save sa computer na ito',
  'waiting to sync': 'naghihintay ma-sync',
  Cancel: 'Kanselahin',
  Save: 'I-save',
  Back: 'Bumalik',
  Next: 'Susunod',
  Close: 'Isara',
  'Front desk': 'Front desk',
  Doctor: 'Doktor',
  Today: 'Ngayon',
  'Wait time': 'Tagal ng paghihintay',
  Dependent: 'Dependent',
  Employee: 'Empleyado',
  'Has records': 'May rekord',
  'New record': 'Bagong rekord',
  'Not on the employee list?': 'Wala sa listahan ng empleyado?',
  'Add dependent': 'Magdagdag ng dependent',
  'Possible duplicate': 'Posibleng doble',
  'Required field': 'Kailangang punan',
  'Recently opened': 'Kamakailang binuksan',
  'Mark urgent': 'Markahan bilang kagyat',
  'Mark left': 'Markahang umalis',
  Recap: 'Buod ng kasaysayan',
  yrs: 'taon',
  'seen today': 'natingnan ngayon',
  'in at': 'dumating',
  'with a doctor': 'kasama ng doktor',
  'Next patient': 'Susunod na pasyente',
  'Call': 'Tawagin',
  'No one is waiting': 'Walang naghihintay',
  'Signed documents': 'Mga napirmahang dokumento',
  'New dependent': 'Bagong dependent',
  'Edit details': 'I-edit ang detalye',
}

let current: Lang = (() => {
  try {
    return (localStorage.getItem(KEY) as Lang) || 'en'
  } catch {
    return 'en'
  }
})()

export function setLang(l: Lang) {
  current = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb)
  return () => window.removeEventListener(EVT, cb)
}

export function useLang() {
  return useSyncExternalStore(subscribe, () => current, () => 'en' as Lang)
}

export function useT() {
  const lang = useLang()
  return (s: string) => (lang === 'fil' ? FIL[s] ?? s : s)
}

/** Both languages at once, for the public waiting screen and printouts. */
export const both = (s: string) => (FIL[s] && FIL[s] !== s ? `${s} · ${FIL[s]}` : s)
export const fil = (s: string) => FIL[s] ?? s

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
  Receptionist: 'Resepsyonista',
  Nurse: 'Nars',
  // Machine-drafted, needs native-speaker review (added in the i18n gap-closing pass).
  'Change my password': 'Palitan ang aking password',
  'Change password': 'Palitan ang password',
  'Connection': 'Koneksyon',
  'Relationship to the employee': 'Relasyon sa empleyado',
  'No digital consultations yet. Older visits are in the paper folder; see Old paper records.': 'Wala pang digital na konsulta. Nasa papel na folder ang mas lumang bisita; tingnan ang Lumang papel na rekord.',
  'Correction': 'Pagwawasto',
  'Waiting for result': 'Naghihintay ng resulta',
  'Who created, edited, signed or voided each record, and when. Reviewed by the doctor in charge.': 'Sino ang gumawa, nag-edit, pumirma o nagpawalang-bisa ng bawat rekord, at kailan. Sinusuri ng doktor na namamahala.',
  'Search by patient, document no. or action': 'Hanapin ayon sa pasyente, numero ng dokumento o aksyon',
  'Staff': 'Kawani',
  'All staff': 'Lahat ng kawani',
  'System': 'Sistema',
  'No entries.': 'Walang entry.',
  'Filters and search apply to the entries loaded so far.': 'Ang mga filter at paghahanap ay para sa mga entry na na-load pa lamang.',
  'Nobody gets a queue number until their identity is checked against the HR list.': 'Walang makakakuha ng queue number hangga\'t hindi napapatunayan ang pagkakakilanlan sa listahan ng HR.',
  'Progress': 'Progreso',
  'Create a dependent linked to an employee': 'Gumawa ng dependent na naka-link sa empleyado',
  'Spouses, children and parents are patients too. Find the employee first.': 'Pasyente rin ang asawa, anak at magulang. Hanapin muna ang empleyado.',
  'Employee\'s name or employee ID': 'Pangalan o employee ID ng empleyado',
  'Checking against the HR list': 'Tinitingnan sa listahan ng HR',
  'Last visit': 'Huling bisita',
  'No dependents linked yet.': 'Wala pang naka-link na dependent.',
  'This ticket': 'Ang tiket na ito',
  'Only the clinic server issues queue numbers. Reconnect this computer first.': 'Ang server ng klinika lang ang nagbibigay ng queue number. Ikonekta muna ang computer na ito.',
  'Sign in to the clinic': 'Mag-sign in sa klinika',
  'Account': 'Account',
  'Password': 'Password',
  'Records are handled under the Data Privacy Act.': 'Ang mga rekord ay hinahawakan alinsunod sa Data Privacy Act.',
  'Runs on the clinic\'s own computers': 'Tumatakbo sa sariling computer ng klinika',
  'Keeps working with no internet': 'Gumagana kahit walang internet',
  'Every action is written to the audit trail': 'Naitatala sa talaan ng pagbabago ang bawat aksyon',
  'Patient not found': 'Hindi nakita ang pasyente',
  'No medicines. Add a drug or use a template.': 'Walang gamot. Magdagdag ng gamot o gumamit ng template.',
  'Report date': 'Petsa ng ulat',
  'Visits by priority lane': 'Mga bisita ayon sa prayoridad na linya',
  'Visits, last two weeks': 'Mga bisita, nakaraang dalawang linggo',
  'No consultations recorded.': 'Walang naitalang konsulta.',
  'Common diagnoses': 'Karaniwang diyagnosis',
  'No diagnoses recorded.': 'Walang naitalang diyagnosis.',
  'Seen by doctor': 'Natingnan ng doktor',
  'Offline: calling patients needs the clinic server. You can still open records you opened recently.': 'Offline: kailangan ang server ng klinika para tumawag ng pasyente. Maaari mo pa ring buksan ang mga rekord na kamakailan mong binuksan.',
  'Patient or document no.': 'Pasyente o numero ng dokumento',
  'Nothing here.': 'Walang laman.',
  'Record not found': 'Hindi nakita ang rekord',
  'It may not be cached on this computer while offline.': 'Maaaring wala ito sa computer na ito habang offline.',
  'Includes records merged into this one': 'Kasama ang mga rekord na pinagsama dito',
  'No changes recorded.': 'Walang naitalang pagbabago.',
  'No relatives linked.': 'Walang naka-link na kamag-anak.',
  'None recorded.': 'Walang naitala.',
  'Offline: showing only records opened recently on this computer.': 'Offline: mga rekord lang na kamakailang binuksan sa computer na ito ang ipinapakita.',
  'No records match.': 'Walang tugmang rekord.',
  'My signature': 'Aking lagda',
  'Current PIN': 'Kasalukuyang PIN',
  'New PIN': 'Bagong PIN',
  'My password': 'Aking password',
  'Used to sign in. Your signing PIN above is separate.': 'Ginagamit sa pag-sign in. Hiwalay ito sa iyong PIN sa pagpirma sa itaas.',
  'You will stay signed in.': 'Mananatili kang naka-sign in.',
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

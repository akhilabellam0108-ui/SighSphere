/**
 * Account types and the information each one must provide.
 *
 * One login (email + password) can hold several accounts — e.g. a doctor with a personal
 * Individual account who also manages their Hospital's account. Each type asks for the
 * details that type genuinely needs, validated here (pure functions, unit-tested).
 */

export type AccountType = 'individual' | 'hospital' | 'organisation';

export const ACCOUNT_TYPES: ReadonlyArray<{ type: AccountType; label: string; description: string; icon: string }> = [
  { type: 'individual', label: 'Individual', description: 'A Deaf or hard-of-hearing person, a family member, or a learner.', icon: '🙋' },
  { type: 'hospital', label: 'Hospital', description: 'Hospitals and clinics communicating with Deaf patients.', icon: '🏥' },
  { type: 'organisation', label: 'Organisation', description: 'Schools, NGOs, companies and government offices.', icon: '🏢' },
];

export type FieldKind = 'text' | 'email' | 'tel' | 'date' | 'select' | 'textarea' | 'number' | 'url';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly string[];
  hint?: string;
  autoComplete?: string;
  /** Only shown (and required) when this returns true. */
  when?: (values: Record<string, string>) => boolean;
  validate?: (value: string, values: Record<string, string>) => string | null;
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

export const SPOKEN_LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Odia', 'Urdu', 'Other'] as const;

// ------------------------------------------------------------------------ validators

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalisePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+91')) return digits.slice(3);
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits.replace(/\D/g, '');
}

export const validators = {
  email: (v: string) => (EMAIL.test(v.trim()) ? null : 'Enter a valid email address.'),
  /** Indian mobile (10 digits, starts 6–9) or landline with STD code (10–11 digits). */
  phone: (v: string) => {
    const n = normalisePhone(v);
    return /^[6-9]\d{9}$/.test(n) || /^[1-5]\d{9,10}$/.test(n) ? null : 'Enter a valid Indian phone number (10 digits).';
  },
  pincode: (v: string) => (/^[1-9]\d{5}$/.test(v.trim()) ? null : 'PIN code must be 6 digits.'),
  url: (v: string) => {
    try {
      const url = new URL(v.trim().startsWith('http') ? v.trim() : `https://${v.trim()}`);
      return url.hostname.includes('.') ? null : 'Enter a valid website address.';
    } catch {
      return 'Enter a valid website address.';
    }
  },
  positiveInt: (v: string) => (/^\d{1,7}$/.test(v.trim()) && Number(v) > 0 ? null : 'Enter a whole number.'),
  name: (v: string) => (v.trim().length >= 2 && v.trim().length <= 120 ? null : 'Enter at least 2 characters.'),
  registration: (v: string) => (/^[A-Za-z0-9/\-. ]{4,40}$/.test(v.trim()) ? null : 'Use 4–40 letters, numbers, / - or .'),
};

export function ageOn(dateOfBirth: string, today = new Date()): number | null {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

const isMinor = (values: Record<string, string>) => {
  const age = ageOn(values['dateOfBirth'] ?? '');
  return age !== null && age < 18;
};

const address: FieldDef[] = [
  { key: 'address', label: 'Address', kind: 'textarea', required: true, autoComplete: 'street-address', validate: (v) => (v.trim().length >= 8 ? null : 'Enter the full address.') },
  { key: 'city', label: 'City', kind: 'text', required: true, autoComplete: 'address-level2', validate: validators.name },
  { key: 'state', label: 'State / UT', kind: 'select', required: true, options: INDIAN_STATES },
  { key: 'pincode', label: 'PIN code', kind: 'text', required: true, autoComplete: 'postal-code', validate: validators.pincode },
];

const contactPerson: FieldDef[] = [
  { key: 'contactName', label: 'Contact person', kind: 'text', required: true, autoComplete: 'name', validate: validators.name },
  { key: 'contactDesignation', label: 'Their designation', kind: 'text', required: true, hint: 'e.g. Nursing Superintendent, Principal, HR Manager', validate: validators.name },
  { key: 'contactPhone', label: 'Contact phone', kind: 'tel', required: true, autoComplete: 'tel', validate: validators.phone },
  { key: 'officialEmail', label: 'Official email', kind: 'email', required: true, autoComplete: 'email', validate: validators.email },
];

export const FIELDS: Record<AccountType, FieldDef[]> = {
  individual: [
    { key: 'fullName', label: 'Full name', kind: 'text', required: true, autoComplete: 'name', validate: validators.name },
    {
      key: 'dateOfBirth',
      label: 'Date of birth',
      kind: 'date',
      required: true,
      autoComplete: 'bday',
      validate: (v) => {
        const age = ageOn(v);
        if (age === null) return 'Enter your date of birth.';
        if (age < 5 || age > 120) return 'Check the date of birth.';
        return null;
      },
    },
    { key: 'guardianName', label: 'Parent or guardian name', kind: 'text', required: true, when: isMinor, hint: 'Required for users under 18.', validate: validators.name },
    { key: 'guardianPhone', label: 'Parent or guardian phone', kind: 'tel', required: true, when: isMinor, validate: validators.phone },
    { key: 'phone', label: 'Mobile number', kind: 'tel', required: true, autoComplete: 'tel', validate: validators.phone },
    { key: 'city', label: 'City', kind: 'text', required: true, autoComplete: 'address-level2', validate: validators.name },
    { key: 'state', label: 'State / UT', kind: 'select', required: true, options: INDIAN_STATES },
    {
      key: 'hearing',
      label: 'Hearing',
      kind: 'select',
      required: true,
      options: ['Deaf', 'Hard of hearing', 'Hearing', 'Prefer not to say'],
      hint: 'Helps SignSphere show the right defaults. Kept private to your account.',
    },
    { key: 'spokenLanguage', label: 'Preferred spoken / written language', kind: 'select', required: true, options: SPOKEN_LANGUAGES },
    { key: 'emergencyName', label: 'Emergency contact name', kind: 'text', required: true, hint: 'Used by the Emergency screen.', validate: validators.name },
    { key: 'emergencyPhone', label: 'Emergency contact phone', kind: 'tel', required: true, validate: validators.phone },
  ],
  hospital: [
    { key: 'name', label: 'Hospital / clinic name', kind: 'text', required: true, autoComplete: 'organization', validate: validators.name },
    {
      key: 'registrationNumber',
      label: 'Registration number',
      kind: 'text',
      required: true,
      hint: 'Clinical establishment or state health-department registration number.',
      validate: validators.registration,
    },
    { key: 'hospitalType', label: 'Type', kind: 'select', required: true, options: ['Government hospital', 'Private hospital', 'Trust / charitable hospital', 'Clinic', 'Primary health centre'] },
    ...address,
    ...contactPerson,
    { key: 'departments', label: 'Departments using SignSphere', kind: 'textarea', required: true, hint: 'e.g. Emergency, OPD, ENT.', validate: (v) => (v.trim().length >= 2 ? null : 'List at least one department.') },
    { key: 'beds', label: 'Number of beds', kind: 'number', required: true, validate: validators.positiveInt },
  ],
  organisation: [
    { key: 'name', label: 'Organisation name', kind: 'text', required: true, autoComplete: 'organization', validate: validators.name },
    {
      key: 'orgType',
      label: 'Type',
      kind: 'select',
      required: true,
      options: ['School for the Deaf', 'School / college / university', 'NGO', 'Company', 'Government office', 'Other'],
    },
    {
      key: 'registrationNumber',
      label: 'Registration number',
      kind: 'text',
      required: true,
      hint: 'Society / trust / company (CIN) / UDISE code.',
      validate: validators.registration,
    },
    ...address,
    ...contactPerson,
    { key: 'website', label: 'Website', kind: 'url', required: true, validate: validators.url },
    { key: 'members', label: 'Number of Deaf members / students / staff', kind: 'number', required: true, validate: validators.positiveInt },
  ],
};

export function visibleFields(type: AccountType, values: Record<string, string>): FieldDef[] {
  return FIELDS[type].filter((field) => !field.when || field.when(values));
}

export function validateAccount(type: AccountType, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(type, values)) {
    const value = (values[field.key] ?? '').trim();
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.kind === 'select' && field.options && !field.options.includes(value)) {
      errors[field.key] = `Choose a ${field.label.toLowerCase()}.`;
      continue;
    }
    const problem = field.validate?.(value, values);
    if (problem) errors[field.key] = problem;
  }
  return errors;
}

/** Keep only the fields this type shows, trimmed; phone numbers normalised. */
export function cleanDetails(type: AccountType, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of visibleFields(type, values)) {
    const value = (values[field.key] ?? '').trim();
    if (!value) continue;
    out[field.key] = field.kind === 'tel' ? normalisePhone(value) : value;
  }
  return out;
}

export function displayNameFor(type: AccountType, details: Record<string, string>): string {
  return (type === 'individual' ? details['fullName'] : details['name'])?.trim() || 'Unnamed account';
}

export function typeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((t) => t.type === type)?.label ?? type;
}

import { z } from 'zod';

// ----------------------------------------------------------------
// Guest form (public) — every field required except notes
// ----------------------------------------------------------------
export const GuestFormSchema = z.object({
  name: z.string().min(1, 'Please enter your name').max(200),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(7, 'Please enter a valid phone number').max(30),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid arrival date'),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid departure date'),
  party_size: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type GuestForm = z.infer<typeof GuestFormSchema>;

// ----------------------------------------------------------------
// Host signup (public form) — every field required except notes
// ----------------------------------------------------------------
export const HostSignupSchema = z.object({
  name: z.string().min(2, 'Please enter your full name').max(200),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(7, 'Please enter a valid phone number').max(30),
  capacity: z.coerce.number().int().min(1).max(30),
  address: z.string().min(5, 'Please enter your address').max(500),
  notes: z.string().max(1000).optional().or(z.literal('')),
  // Honeypot: legit users won't fill this; bots will. Server rejects if non-empty.
  website: z.string().max(0, 'Spam detected').optional().or(z.literal('')),
});

export type HostSignup = z.infer<typeof HostSignupSchema>;

// ----------------------------------------------------------------
// Host self-edit (existing host updating their profile via token) —
// same strictness as signup. Imported hosts who lack phone/address
// will be required to provide them when they next edit their profile.
// ----------------------------------------------------------------
export const HostEditSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().min(7, 'Please enter a valid phone number').max(30),
  capacity: z.coerce.number().int().min(1).max(30),
  address: z.string().min(5, 'Please enter your address').max(500),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type HostEdit = z.infer<typeof HostEditSchema>;

// ----------------------------------------------------------------
// Guest edit — same strictness as signup
// ----------------------------------------------------------------
export const GuestEditSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7, 'Please enter a valid phone number').max(30),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party_size: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type GuestEdit = z.infer<typeof GuestEditSchema>;

// Disposable email domains we reject. Add more as needed.
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com',
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'throwaway.email',
  'trashmail.com',
  'yopmail.com',
  'getnada.com',
  'maildrop.cc',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

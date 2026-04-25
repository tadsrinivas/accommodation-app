import { z } from 'zod';

export const GuestFormSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(7).max(30).optional().or(z.literal('')),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party_size: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type GuestForm = z.infer<typeof GuestFormSchema>;

import { z } from 'zod';

const cleanText = z.string().max(200).trim().max(100).regex(/^[^\p{Cc}]*$/u);
const queryInteger = (max: number, fallback: number) => z.string().max(10)
  .regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).default(fallback);
export const emptyReadRequest = z.object({ query: z.object({}).strict() });
export const listRequest = z.object({ query: z.object({
  keyword: cleanText.transform((value) => value || undefined).optional(),
  category: cleanText.pipe(z.string().min(1)).optional(),
  page: queryInteger(10000, 1),
  pageSize: queryInteger(100, 20),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc']).default('newest'),
}).strict() });
export const detailRequest = z.object({ query: z.object({}).strict(), params: z.object({
  id: z.string().max(10).regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647)),
}) });
export type ProductQuery = z.output<typeof listRequest>['query'];
export const localMedia = z.string().max(2048).regex(/^\/media\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
  .refine((value) => !value.includes('..'));
export const stringList = z.array(z.string());

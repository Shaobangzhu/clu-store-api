import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);
const params = z.object({ id: z.string().max(10).regex(/^[1-9]\d*$/).transform(Number).pipe(id) });
const sort = z.enum(['newest', 'oldest']);
const cursorValue = z.object({ v: z.literal(1), sort, createdAt: z.iso.datetime({ precision: 3 }), id }).strict();
const cursor = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx) => {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error('Noncanonical cursor');
    return cursorValue.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
    return z.NEVER;
  }
});
export const orderListRequest = z.object({ body: z.undefined(), query: z.object({
  pageSize: z.string().max(3).regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(20)
    .meta({ description: 'Plain positive decimal integer, maximum 100, default 20. No repeated values.', default: '20' }),
  sort: sort.default('newest'), cursor: cursor.optional(),
}).strict().refine((query) => !query.cursor || query.cursor.sort === query.sort, { path: ['cursor'] }) });
export const orderDetailRequest = z.object({ params, query: z.object({}).strict(), body: z.undefined() });
export type OrderListQuery = z.output<typeof orderListRequest>['query'];
export function encodeOrderCursor(order: { id: number; createdAt: Date }, direction: OrderListQuery['sort']) {
  return Buffer.from(JSON.stringify({ v: 1, sort: direction, createdAt: order.createdAt.toISOString(), id: order.id })).toString('base64url');
}

// A human note only: no arbitrary JSON, authority, payment data or executable HTML.
const note = z.string().max(1000).trim().min(1).max(500).regex(/^[^\p{Cc}]*$/u);
export const decisionMetadata = z.object({ note }).strict();
const metadata = z.union([
  decisionMetadata.transform((value) => ({ value, legacy: false })),
  note.transform((value) => ({ value: { note: value }, legacy: true })).meta({ deprecated: true, description: 'Deprecated string metadata: trimmed into a plain note, never parsed as JSON or trusted for authority.' }),
]);
export const decisionRequest = z.object({ params, query: z.object({}).strict(), body: z.object({
  metadata: metadata.optional(),
}).strict().optional() });
export type DecisionMetadata = z.output<typeof decisionMetadata>;
export type Decision = 'approved' | 'rejected';

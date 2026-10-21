import { z } from 'zod';
import { localMedia } from '../products/schemas.js';

export const categoryRequest = z.object({ query: z.object({}).strict(), params: z.object({
  title: z.string().max(128).trim().min(1).regex(/^[^/\\\p{Cc}]+$/u),
}) });
export const categoryFeatures = z.array(z.object({ id: z.number().int(), title: z.string(), detail: z.string(),
  imageSrc: localMedia, textColor: z.enum(['black', 'white']),
}).strict());
export const categoryVideo = z.object({ id: z.number().int(), regularSrc: localMedia.nullable(), smallSrc: localMedia.nullable() }).strict();

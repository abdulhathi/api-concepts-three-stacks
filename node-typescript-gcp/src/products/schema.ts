// Concepts 6 and 7 · Request bodies and JSON serialization: one zod schema per shape, reused by OpenAPI.
import { z } from 'zod';
import { intInRange } from '../http/schemas.js';

const title = z.string().trim().min(1, 'must not be empty').max(200, 'must be at most 200 characters');
const author = z.string().trim().min(1, 'must not be empty').max(100, 'must be at most 100 characters');
const priceCents = z
  .number({ error: 'must be an integer number of cents' })
  .int('must be an integer number of cents')
  .min(0, 'must be between 0 and 10000000')
  .max(10_000_000, 'must be between 0 and 10000000');
const tags = z
  .array(z.string().regex(/^[a-z0-9-]{1,30}$/, 'must be lowercase letters, digits or hyphens (1-30)'), {
    error: 'must be an array of tags',
  })
  .max(10, 'must have at most 10 tags')
  .refine((list) => new Set(list).size === list.length, 'must not contain duplicates');

export const productSchema = z
  .object({
    id: z.string().meta({ example: 'prd_01' }),
    title,
    author,
    priceCents,
    currency: z.literal('USD'),
    tags,
    version: z.number().int().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Product' });

export const createProductSchema = z
  .object({ title, author, priceCents, tags: tags.default([]) })
  .meta({ id: 'CreateProduct' });
export const replaceProductSchema = z
  .object({ title, author, priceCents, tags })
  .meta({ id: 'ReplaceProduct' });
export const patchProductSchema = replaceProductSchema.partial().meta({ id: 'PatchProduct' });

export const listProductsQuerySchema = z.object({
  limit: intInRange('limit', 1, 50).default(10),
  cursor: z.string().min(1).optional(),
  tag: z.string().regex(/^[a-z0-9-]{1,30}$/, 'must be a valid tag').optional(),
});

export const pageSchema = z
  .object({ limit: z.number().int(), nextCursor: z.string().nullable(), hasMore: z.boolean() })
  .meta({ id: 'Page' });

export const productListSchema = z
  .object({ data: z.array(productSchema), page: pageSchema })
  .meta({ id: 'ProductList' });

export type Product = z.infer<typeof productSchema>;
export type CreateProduct = z.infer<typeof createProductSchema>;

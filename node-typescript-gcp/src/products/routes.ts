// Concepts 3, 16 and 19 · HTTP methods on a REST resource, with ETag caching and If-Match preconditions.
import { Router, type Request, type Response } from 'express';
import { requireScope } from '../auth/authenticate.js';
import { ifMatchPasses, noneMatchHits, strongEtag, weakEtagOf } from '../http/etag.js';
import { jsonBody } from '../http/body.js';
import { paginate } from '../http/pagination.js';
import { ApiProblem } from '../http/problem.js';
import { idParamsSchema } from '../http/schemas.js';
import { parse } from '../http/validate.js';
import { newId } from '../util/ids.js';
import { isoTimestamp } from '../util/time.js';
import type { ProductRepository } from './repository.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  patchProductSchema,
  replaceProductSchema,
  type Product,
} from './schema.js';

const notFound = (id: string) => new ApiProblem('not-found', `Product ${id} does not exist.`);

function sendConditional(req: Request, res: Response, etag: string, cacheControl: string, body: string): void {
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cacheControl);
  if (noneMatchHits(req.get('If-None-Match'), etag)) {
    res.status(304).end();
    return;
  }
  res.type('application/json').send(body);
}

function checkPrecondition(req: Request, product: Product): void {
  if (!ifMatchPasses(req.get('If-Match'), strongEtag(product.id, product.version))) {
    throw new ApiProblem('precondition-failed', 'If-Match does not match the current ETag. Re-read the product.');
  }
}

function sendProduct(res: Response, status: number, product: Product): void {
  res.setHeader('ETag', strongEtag(product.id, product.version));
  res.status(status).json(product);
}

export function productsRouter(products: ProductRepository): Router {
  const router = Router();

  router.get('/', requireScope('products:read'), async (req, res) => {
    const { limit, cursor, tag } = parse(listProductsQuerySchema, req.query, 'query');
    const all = await products.findAll();
    const page = paginate(tag ? all.filter((product) => product.tags.includes(tag)) : all, limit, cursor);

    if (page.hasMore) {
      const params = new URLSearchParams({ limit: String(limit), cursor: page.nextCursor! });
      if (tag) params.set('tag', tag);
      res.setHeader('Link', `</v1/products?${params}>; rel="next"`);
    }
    const body = JSON.stringify({
      data: page.items,
      page: { limit, nextCursor: page.nextCursor, hasMore: page.hasMore },
    });
    sendConditional(req, res, weakEtagOf(body), 'private, max-age=30', body);
  });

  router.get('/:id', requireScope('products:read'), async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    const product = await products.findById(id);
    if (!product) throw notFound(id);
    sendConditional(req, res, strongEtag(id, product.version), 'private, max-age=60', JSON.stringify(product));
  });

  router.post('/', requireScope('products:write'), jsonBody, async (req, res) => {
    const input = parse(createProductSchema, req.json);
    const now = isoTimestamp(Date.now());
    const product: Product = {
      id: newId('prd'),
      ...input,
      currency: 'USD',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await products.save(product);
    res.setHeader('Location', `/v1/products/${product.id}`);
    sendProduct(res, 201, product);
  });

  router.put('/:id', requireScope('products:write'), jsonBody, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    const input = parse(replaceProductSchema, req.json);
    const current = await products.findById(id);
    if (!current) throw notFound(id);
    checkPrecondition(req, current);
    const updated: Product = { ...current, ...input, version: current.version + 1, updatedAt: isoTimestamp(Date.now()) };
    await products.save(updated);
    sendProduct(res, 200, updated);
  });

  router.patch('/:id', requireScope('products:write'), jsonBody, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    const changes = parse(patchProductSchema, req.json);
    const current = await products.findById(id);
    if (!current) throw notFound(id);
    checkPrecondition(req, current);
    // zod leaves absent keys out, so spreading only overwrites what the client sent.
    const updated: Product = { ...current, ...changes, version: current.version + 1, updatedAt: isoTimestamp(Date.now()) };
    await products.save(updated);
    sendProduct(res, 200, updated);
  });

  router.delete('/:id', requireScope('admin'), async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    const current = await products.findById(id);
    if (!current) throw notFound(id);
    checkPrecondition(req, current);
    await products.remove(id);
    res.status(204).end();
  });

  return router;
}

// Concept 2 · Endpoints: storage sits behind this interface, so Firestore or Postgres can replace the Map.
import { byCreation } from '../http/pagination.js';
import type { Product } from './schema.js';

export interface ProductRepository {
  /** All products ordered by createdAt, then id. */
  findAll(): Promise<Product[]>;
  findById(id: string): Promise<Product | undefined>;
  save(product: Product): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();

  constructor(seed: Product[] = []) {
    for (const product of seed) this.products.set(product.id, structuredClone(product));
  }

  async findAll(): Promise<Product[]> {
    return [...this.products.values()].sort(byCreation).map((product) => structuredClone(product));
  }

  async findById(id: string): Promise<Product | undefined> {
    const product = this.products.get(id);
    return product && structuredClone(product);
  }

  async save(product: Product): Promise<void> {
    this.products.set(product.id, structuredClone(product));
  }

  async remove(id: string): Promise<boolean> {
    return this.products.delete(id);
  }
}

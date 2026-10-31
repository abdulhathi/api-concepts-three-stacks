import { byCreation } from '../http/pagination.js';
import type { Order } from './schema.js';

export interface OrderRepository {
  /** Every order, ordered by createdAt then id. */
  findAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async findAll(): Promise<Order[]> {
    return [...this.orders.values()].sort(byCreation).map((order) => structuredClone(order));
  }

  async findById(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order && structuredClone(order);
  }

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, structuredClone(order));
  }
}

// Concept 11 · Authorization: ownership rules live next to the order logic, not in the routes.
import { isAdmin, type Principal } from '../auth/principal.js';
import { ApiProblem } from '../http/problem.js';
import type { ProductRepository } from '../products/repository.js';
import { newId } from '../util/ids.js';
import { isoTimestamp } from '../util/time.js';
import type { OrderRepository } from './repository.js';
import type { CreateOrder, Order } from './schema.js';

/** Where domain events go. The webhook dispatcher implements it; a queue publisher could too. */
export interface EventPublisher {
  publish(type: 'order.created' | 'order.paid', data: { order: Order }): void;
}

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly products: ProductRepository,
    private readonly events: EventPublisher,
  ) {}

  async create(clientId: string, input: CreateOrder): Promise<Order> {
    const items: Order['items'] = [];
    for (const line of input.items) {
      const product = await this.products.findById(line.productId);
      if (!product) throw new ApiProblem('unknown-product', `Product ${line.productId} does not exist.`);
      items.push({
        productId: product.id,
        title: product.title,
        quantity: line.quantity,
        unitPriceCents: product.priceCents,
        lineTotalCents: product.priceCents * line.quantity,
      });
    }
    const now = isoTimestamp(Date.now());
    const order: Order = {
      id: newId('ord'),
      clientId,
      status: 'pending',
      items,
      totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      currency: 'USD',
      createdAt: now,
      updatedAt: now,
    };
    await this.orders.save(order);
    this.events.publish('order.created', { order });
    return order;
  }

  /** Another client's order is reported as missing, so ids cannot be probed. */
  async getVisible(principal: Principal, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || !(isAdmin(principal) || order.clientId === principal.clientId)) {
      throw new ApiProblem('not-found', `Order ${id} does not exist.`);
    }
    return order;
  }

  async listVisible(principal: Principal): Promise<Order[]> {
    const all = await this.orders.findAll();
    return isAdmin(principal) ? all : all.filter((order) => order.clientId === principal.clientId);
  }

  async pay(principal: Principal, id: string): Promise<Order> {
    const order = await this.getVisible(principal, id);
    if (order.status === 'paid') return order;
    const paid: Order = { ...order, status: 'paid', updatedAt: isoTimestamp(Date.now()) };
    await this.orders.save(paid);
    this.events.publish('order.paid', { order: paid });
    return paid;
  }
}

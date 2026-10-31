import type { Delivery, Subscription } from './schema.js';

export interface WebhookRepository {
  saveSubscription(subscription: Subscription): Promise<void>;
  findSubscription(id: string): Promise<Subscription | undefined>;
  listSubscriptions(): Promise<Subscription[]>;
  removeSubscription(id: string): Promise<boolean>;
  saveDelivery(subscriptionId: string, delivery: Delivery): Promise<void>;
  listDeliveries(subscriptionId: string): Promise<Delivery[]>;
}

export class InMemoryWebhookRepository implements WebhookRepository {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly deliveries = new Map<string, Map<string, Delivery>>(); // Map keeps insertion (creation) order

  async saveSubscription(subscription: Subscription): Promise<void> {
    this.subscriptions.set(subscription.id, { ...subscription });
  }

  async findSubscription(id: string): Promise<Subscription | undefined> {
    const found = this.subscriptions.get(id);
    return found && { ...found };
  }

  async listSubscriptions(): Promise<Subscription[]> {
    return [...this.subscriptions.values()].map((subscription) => ({ ...subscription }));
  }

  async removeSubscription(id: string): Promise<boolean> {
    this.deliveries.delete(id);
    return this.subscriptions.delete(id);
  }

  async saveDelivery(subscriptionId: string, delivery: Delivery): Promise<void> {
    const log = this.deliveries.get(subscriptionId) ?? new Map<string, Delivery>();
    log.set(delivery.id, { ...delivery });
    this.deliveries.set(subscriptionId, log);
  }

  async listDeliveries(subscriptionId: string): Promise<Delivery[]> {
    return [...(this.deliveries.get(subscriptionId)?.values() ?? [])].map((delivery) => ({ ...delivery }));
  }
}

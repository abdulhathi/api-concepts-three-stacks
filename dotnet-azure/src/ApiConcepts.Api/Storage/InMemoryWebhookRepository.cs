using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Storage;

public sealed class InMemoryWebhookRepository : IWebhookRepository
{
    private readonly Lock _gate = new();
    private readonly List<WebhookSubscription> _subscriptions = [];
    private readonly List<WebhookDelivery> _deliveries = [];

    public WebhookSubscription Add(WebhookSubscription subscription)
    {
        lock (_gate)
        {
            _subscriptions.Add(subscription);
            return subscription;
        }
    }

    public IReadOnlyList<WebhookSubscription> List()
    {
        lock (_gate)
        {
            return [.. _subscriptions];
        }
    }

    public WebhookSubscription? Find(string id)
    {
        lock (_gate)
        {
            return _subscriptions.FirstOrDefault(s => s.Id == id);
        }
    }

    public bool Remove(string id)
    {
        lock (_gate)
        {
            return _subscriptions.RemoveAll(s => s.Id == id) > 0;
        }
    }

    public WebhookDelivery AddDelivery(WebhookDelivery delivery)
    {
        lock (_gate)
        {
            _deliveries.Add(delivery);
            return delivery;
        }
    }

    public void UpdateDelivery(string id, Func<WebhookDelivery, WebhookDelivery> change)
    {
        lock (_gate)
        {
            var index = _deliveries.FindIndex(d => d.Id == id);
            if (index >= 0)
            {
                _deliveries[index] = change(_deliveries[index]);
            }
        }
    }

    public IReadOnlyList<WebhookDelivery> DeliveriesFor(string subscriptionId)
    {
        lock (_gate)
        {
            return [.. _deliveries.Where(d => d.SubscriptionId == subscriptionId)];
        }
    }
}

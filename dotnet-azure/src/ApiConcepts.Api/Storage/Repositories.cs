// The storage seam: everything the API needs from a database, so a managed store (Cosmos DB, Azure SQL)
// can replace the in-memory implementations without touching the endpoints.
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Storage;

/// <summary>The state of an entity before and after an atomic update.</summary>
public sealed record Change<T>(T Before, T After);

public interface IProductRepository
{
    Page<Product> List(int limit, Cursor? after, string? tag);
    Product? Find(string id);
    Product Add(Product product);

    /// <summary>Applies <paramref name="change"/> atomically; returns null when the id does not exist.</summary>
    Change<Product>? Update(string id, Func<Product, Product> change);

    /// <summary>Removes the product after <paramref name="guard"/> approves it (it may throw to refuse).</summary>
    bool Remove(string id, Action<Product> guard);
}

public interface IOrderRepository
{
    Order Add(Order order);
    Order? Find(string id);
    Page<Order> List(int limit, Cursor? after, Func<Order, bool> visible);
    Change<Order>? Update(string id, Func<Order, Order> change);
    IReadOnlyList<Order> All();
}

public interface IWebhookRepository
{
    WebhookSubscription Add(WebhookSubscription subscription);
    IReadOnlyList<WebhookSubscription> List();
    WebhookSubscription? Find(string id);
    bool Remove(string id);
    WebhookDelivery AddDelivery(WebhookDelivery delivery);
    void UpdateDelivery(string id, Func<WebhookDelivery, WebhookDelivery> change);
    IReadOnlyList<WebhookDelivery> DeliveriesFor(string subscriptionId);
}

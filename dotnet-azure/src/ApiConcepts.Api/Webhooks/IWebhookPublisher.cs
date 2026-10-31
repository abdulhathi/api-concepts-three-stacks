using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Webhooks;

public interface IWebhookPublisher
{
    /// <summary>Queues deliveries for every matching subscription and returns immediately.</summary>
    void Publish(string eventType, Order order);
}

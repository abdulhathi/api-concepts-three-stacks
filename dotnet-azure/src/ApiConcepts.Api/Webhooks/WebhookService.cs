// Concept 26 · Webhooks: publishing creates delivery records and hands them to a background worker,
// so the API response never waits on a receiver. In production this seam is a queue (Azure Service Bus).
using System.Text.Json;
using System.Threading.Channels;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;

namespace ApiConcepts.Api.Webhooks;

public sealed record DeliveryJob(string DeliveryId, string Url, string Secret, string EventId, byte[] Body);

public sealed class WebhookService(
    IWebhookRepository repository,
    JsonSerializerOptions json,
    TimeProvider time) : IWebhookPublisher
{
    private readonly Channel<DeliveryJob> _queue = Channel.CreateUnbounded<DeliveryJob>();

    public ChannelReader<DeliveryJob> Jobs => _queue.Reader;

    public void Publish(string eventType, Order order)
    {
        var subscribers = repository.List().Where(s => s.Events.Contains(eventType)).ToList();
        if (subscribers.Count == 0)
        {
            return;
        }

        var now = time.UtcNowMs();
        var eventId = Ids.New("evt_");
        var body = JsonSerializer.SerializeToUtf8Bytes(
            new { id = eventId, type = eventType, createdAt = now, data = new { order } }, json);

        foreach (var subscription in subscribers)
        {
            var delivery = repository.AddDelivery(new WebhookDelivery(
                Ids.New("dlv_"), subscription.Id, eventId, eventType, DeliveryStatus.Pending, 0, null, null, now, now));
            _queue.Writer.TryWrite(new DeliveryJob(delivery.Id, subscription.Url, subscription.Secret, eventId, body));
        }
    }
}

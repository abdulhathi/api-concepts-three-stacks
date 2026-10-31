namespace ApiConcepts.Api.Domain;

public static class WebhookEvents
{
    public const string OrderCreated = "order.created";
    public const string OrderPaid = "order.paid";

    public static readonly IReadOnlyList<string> All = [OrderCreated, OrderPaid];
}

public sealed record WebhookSubscription(string Id, string Url, IReadOnlyList<string> Events, string Secret, DateTimeOffset CreatedAt);

public static class DeliveryStatus
{
    public const string Pending = "pending";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
}

public sealed record WebhookDelivery(
    string Id,
    string SubscriptionId,
    string EventId,
    string EventType,
    string Status,
    int Attempts,
    int? LastStatusCode,
    string? LastError,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

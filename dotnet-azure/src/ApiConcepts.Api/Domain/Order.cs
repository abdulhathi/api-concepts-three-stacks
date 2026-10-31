namespace ApiConcepts.Api.Domain;

public static class OrderStatus
{
    public const string Pending = "pending";
    public const string Paid = "paid";
}

public sealed record OrderItem(string ProductId, string Title, int Quantity, int UnitPriceCents, int LineTotalCents);

public sealed record Order(
    string Id,
    string ClientId,
    string Status,
    IReadOnlyList<OrderItem> Items,
    int TotalCents,
    string Currency,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

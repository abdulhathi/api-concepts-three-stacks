namespace ApiConcepts.Client;

public sealed record Product(
    string Id, string Title, string Author, int PriceCents, string Currency,
    IReadOnlyList<string> Tags, int Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record PageInfo(int Limit, string? NextCursor, bool HasMore);

public sealed record ResultPage<T>(IReadOnlyList<T> Data, PageInfo Page);

public sealed record OrderLine(string ProductId, int Quantity);

public sealed record OrderItem(string ProductId, string Title, int Quantity, int UnitPriceCents, int LineTotalCents);

public sealed record Order(
    string Id, string ClientId, string Status, IReadOnlyList<OrderItem> Items, int TotalCents,
    string Currency, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record Me(string ClientId, IReadOnlyList<string> Scopes, string Plan, DateTimeOffset TokenExpiresAt);

public sealed record FlakyResult(string Key, int Attempts);

public sealed record NewProduct(string Title, string Author, int PriceCents, IReadOnlyList<string>? Tags = null);

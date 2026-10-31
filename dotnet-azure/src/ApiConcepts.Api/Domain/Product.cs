namespace ApiConcepts.Api.Domain;

public sealed record Product(
    string Id,
    string Title,
    string Author,
    int PriceCents,
    string Currency,
    IReadOnlyList<string> Tags,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

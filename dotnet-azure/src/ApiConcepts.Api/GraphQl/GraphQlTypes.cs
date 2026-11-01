// Concept 17 · GraphQL: the public schema types. Ids use the plain ID scalar, never Relay global ids.
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;
using HotChocolate;
using HotChocolate.Types;

namespace ApiConcepts.Api.GraphQl;

[GraphQLName("PageInfo")] public sealed record PageInfoType(string? EndCursor, bool HasNextPage);

public sealed record ProductConnection(IReadOnlyList<ProductType> Nodes, PageInfoType PageInfo);

[GraphQLName("Product")] public sealed record ProductType(
    [property: GraphQLType(typeof(NonNullType<IdType>))] string Id,
    string Title,
    string Author,
    int PriceCents,
    string Currency,
    IReadOnlyList<string> Tags)
{
    public static ProductType From(Product p) => new(p.Id, p.Title, p.Author, p.PriceCents, p.Currency, p.Tags);
}

[GraphQLName("Order")] public sealed record OrderType(
    [property: GraphQLType(typeof(NonNullType<IdType>))] string Id,
    string Status,
    int TotalCents,
    IReadOnlyList<OrderItemType> Items)
{
    public static OrderType From(Order o) =>
        new(o.Id, o.Status, o.TotalCents, [.. o.Items.Select(i => new OrderItemType(i.ProductId, i.Quantity, i.UnitPriceCents))]);
}

[GraphQLName("OrderItem")] public sealed class OrderItemType(string productId, int quantity, int unitPriceCents)
{
    public int Quantity { get; } = quantity;

    public int UnitPriceCents { get; } = unitPriceCents;

    /// <summary>The nested order -> product hop; null if the product was deleted after the order.</summary>
    public ProductType? Product([Service] IProductRepository products) =>
        products.Find(productId) is { } p ? ProductType.From(p) : null;
}

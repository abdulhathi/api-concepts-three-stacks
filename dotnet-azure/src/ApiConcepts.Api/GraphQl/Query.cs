// Concept 17 · GraphQL: one endpoint, a typed schema, nested order -> product resolution.
// Concept 11 · Authorization: the HTTP layer demands products:read; the order field adds orders:read itself.
using System.Security.Claims;
using ApiConcepts.Api.Auth;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Storage;
using HotChocolate;
using HotChocolate.Types;

namespace ApiConcepts.Api.GraphQl;

public sealed class Query
{
    public ProductConnection Products(
        [Service] IProductRepository products,
        int first = 10,
        string? after = null,
        string? tag = null)
    {
        if (first is < 1 or > 50)
        {
            throw Error("BAD_USER_INPUT", "first must be between 1 and 50");
        }

        Cursor? cursor;
        try
        {
            cursor = Cursor.Parse(after);
        }
        catch (ProblemException)
        {
            throw Error("BAD_USER_INPUT", "after is not a valid cursor");
        }

        var page = products.List(first, cursor, tag);
        var endCursor = page.Items.Count > 0 ? new Cursor(page.Items[^1].CreatedAt, page.Items[^1].Id).Encode() : null;
        return new ProductConnection(
            [.. page.Items.Select(ProductType.From)],
            new PageInfoType(endCursor, page.HasMore));
    }

    public ProductType? Product(
        [GraphQLType(typeof(NonNullType<IdType>))] string id,
        [Service] IProductRepository products) =>
        products.Find(id) is { } p ? ProductType.From(p) : null;

    public OrderType? Order(
        [GraphQLType(typeof(NonNullType<IdType>))] string id,
        ClaimsPrincipal user,
        [Service] IOrderRepository orders)
    {
        if (!user.HasScope("orders:read"))
        {
            throw Error("FORBIDDEN", "The token lacks the orders:read scope.");
        }

        // Another client's order is indistinguishable from a missing one.
        return orders.Find(id) is { } order && (user.IsAdmin() || order.ClientId == user.ClientId())
            ? OrderType.From(order)
            : null;
    }

    private static GraphQLException Error(string code, string message) =>
        new(ErrorBuilder.New().SetMessage(message).SetCode(code).Build());
}

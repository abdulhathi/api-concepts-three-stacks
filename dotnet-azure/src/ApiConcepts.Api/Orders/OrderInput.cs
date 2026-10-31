// Concept 6 · Request bodies: validate an order request and price it from the catalogue.
using System.Text.Json;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;

namespace ApiConcepts.Api.Orders;

public sealed record OrderLine(string ProductId, int Quantity);

public static class OrderInput
{
    public static IReadOnlyList<OrderLine> ParseLines(JsonElement? raw)
    {
        var body = JsonBody.RequireObject(raw);
        if (!body.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
        {
            throw ProblemException.Validation("items", "must be an array of 1 to 50 items");
        }

        var elements = items.EnumerateArray().ToList();
        if (elements.Count is < 1 or > 50)
        {
            throw ProblemException.Validation("items", "must be an array of 1 to 50 items");
        }

        var errors = new List<FieldIssue>();
        var lines = new List<OrderLine>();
        for (var i = 0; i < elements.Count; i++)
        {
            var element = elements[i];
            var productId = element.ValueKind == JsonValueKind.Object &&
                            element.TryGetProperty("productId", out var id) &&
                            id.ValueKind == JsonValueKind.String &&
                            id.GetString() is { Length: > 0 } text
                ? text
                : null;
            var quantity = element.ValueKind == JsonValueKind.Object &&
                           element.TryGetProperty("quantity", out var q) &&
                           q.ValueKind == JsonValueKind.Number &&
                           q.TryGetInt32(out var n) && n is >= 1 and <= 100
                ? n
                : 0;

            if (productId is null)
            {
                errors.Add(new FieldIssue($"items[{i}].productId", "must be a non-empty string"));
            }

            if (quantity == 0)
            {
                errors.Add(new FieldIssue($"items[{i}].quantity", "must be an integer between 1 and 100"));
            }

            if (productId is not null && quantity != 0)
            {
                lines.Add(new OrderLine(productId, quantity));
            }
        }

        return errors.Count > 0 ? throw ProblemException.Validation([.. errors]) : lines;
    }

    public static Order Price(
        IReadOnlyList<OrderLine> lines, string clientId, IProductRepository products, DateTimeOffset now)
    {
        var items = lines.Select(line =>
        {
            var product = products.Find(line.ProductId) ?? throw new ProblemException(
                ProblemType.UnknownProduct, $"Product {line.ProductId} does not exist.");
            return new OrderItem(
                product.Id, product.Title, line.Quantity, product.PriceCents, product.PriceCents * line.Quantity);
        }).ToList();

        return new Order(
            Ids.New("ord_"), clientId, OrderStatus.Pending, items, items.Sum(i => i.LineTotalCents), "USD", now, now);
    }
}

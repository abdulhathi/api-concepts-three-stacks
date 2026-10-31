// Concepts 11 and 22 · Authorization (ownership) and idempotency for order creation.
using System.Security.Cryptography;
using System.Text.Json;
using ApiConcepts.Api.Auth;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Orders;
using ApiConcepts.Api.Storage;
using ApiConcepts.Api.Webhooks;

namespace ApiConcepts.Api.Endpoints;

public static class OrderEndpoints
{
    public static void MapOrders(this RouteGroupBuilder v1)
    {
        var orders = v1.MapGroup("/orders").WithTags("Orders");

        orders.MapPost("/", Create).RequireAuthorization("orders:write")
            .WithSummary("Create an order (requires Idempotency-Key)")
            .WithBody<CreateOrderBody>("application/json")
            .Produces<Order>(201);
        orders.MapGet("/", List).RequireAuthorization("orders:read")
            .WithSummary("List the caller's orders (admin: all)")
            .Produces<OrderPage>();
        orders.MapGet("/{id}", Get).RequireAuthorization("orders:read")
            .WithSummary("Get an order (owner or admin)")
            .Produces<Order>();
        orders.MapPost("/{id}/pay", Pay).RequireAuthorization("orders:write")
            .WithSummary("Mark an order paid")
            .Produces<Order>();
    }

    public sealed record CreateOrderBody(CreateOrderLine[] Items);

    public sealed record CreateOrderLine(string ProductId, int Quantity);

    public sealed record OrderPage(IReadOnlyList<Order> Data, PageInfo Page);

    private static async Task<IResult> Create(
        HttpContext http,
        IProductRepository products,
        IOrderRepository orders,
        IIdempotencyStore idempotency,
        IWebhookPublisher webhooks,
        JsonSerializerOptions json,
        TimeProvider time)
    {
        var key = http.Request.Headers["Idempotency-Key"].ToString();
        if (key.Length is < 1 or > 255)
        {
            throw new ProblemException(
                ProblemType.IdempotencyKeyRequired, "Send an Idempotency-Key header of 1 to 255 characters.");
        }

        var raw = await JsonBody.ReadRawAsync(http.Request);
        var client = http.User.ClientId();
        var decision = idempotency.Begin(client, key, Convert.ToHexString(SHA256.HashData(raw)));

        switch (decision)
        {
            case IdempotencyDecision.Replay replay:
                return Created(replay.Response, replayed: true);
            case IdempotencyDecision.InProgress:
                throw new ProblemException(
                    ProblemType.IdempotencyKeyInProgress, "A request with this Idempotency-Key is still being processed.");
            case IdempotencyDecision.Reused:
                throw new ProblemException(
                    ProblemType.IdempotencyKeyReused, "This Idempotency-Key was already used with a different request body.");
        }

        try
        {
            var lines = OrderInput.ParseLines(JsonBody.Parse(raw));
            var order = orders.Add(OrderInput.Price(lines, client, products, time.UtcNowMs()));
            var stored = new StoredResponse(JsonSerializer.SerializeToUtf8Bytes(order, json), $"/v1/orders/{order.Id}");
            idempotency.Complete(client, key, stored);
            webhooks.Publish(WebhookEvents.OrderCreated, order);
            return Created(stored, replayed: false);
        }
        catch
        {
            idempotency.Abandon(client, key);
            throw;
        }
    }

    private static RawJsonResult Created(StoredResponse stored, bool replayed)
    {
        var headers = new Dictionary<string, string> { ["Location"] = stored.Location };
        if (replayed)
        {
            headers["Idempotent-Replayed"] = "true";
        }

        return new RawJsonResult(201, stored.Body, headers);
    }

    private static IResult List(HttpContext http, IOrderRepository orders)
    {
        var request = PageRequest.From(http.Request);
        var user = http.User;

        var page = orders.List(request.Limit, request.After, order => user.IsAdmin() || order.ClientId == user.ClientId());
        var info = request.Describe(page, o => new Cursor(o.CreatedAt, o.Id));
        if (info.NextCursor is not null)
        {
            http.Response.Headers.Link =
                $"</v1/orders?limit={info.Limit}&cursor={Uri.EscapeDataString(info.NextCursor)}>; rel=\"next\"";
        }

        return Results.Ok(new OrderPage(page.Items, info));
    }

    private static IResult Get(string id, HttpContext http, IOrderRepository orders) =>
        Results.Ok(Visible(orders.Find(id), http.User));

    private static IResult Pay(
        string id, HttpContext http, IOrderRepository orders, IWebhookPublisher webhooks, TimeProvider time)
    {
        Visible(orders.Find(id), http.User);
        var now = time.UtcNowMs();
        var change = orders.Update(id, order => order.Status == OrderStatus.Paid
            ? order
            : order with { Status = OrderStatus.Paid, UpdatedAt = now }) ?? throw ProblemException.NotFound("Order");

        // The update is atomic, so exactly one caller sees the pending -> paid transition and emits the event.
        if (change.Before.Status != OrderStatus.Paid)
        {
            webhooks.Publish(WebhookEvents.OrderPaid, change.After);
        }

        return Results.Ok(change.After);
    }

    /// <summary>Another client's order looks exactly like a missing one (404), so ids cannot be probed.</summary>
    private static Order Visible(Order? order, System.Security.Claims.ClaimsPrincipal user) =>
        order is not null && (user.IsAdmin() || order.ClientId == user.ClientId())
            ? order
            : throw ProblemException.NotFound("Order");
}

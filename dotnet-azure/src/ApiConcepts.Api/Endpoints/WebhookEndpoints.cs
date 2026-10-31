// Concept 26 · Webhooks: subscriptions and the delivery log (admin only).
using System.Text.Json;
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;

namespace ApiConcepts.Api.Endpoints;

public static class WebhookEndpoints
{
    public static void MapWebhooks(this RouteGroupBuilder v1)
    {
        var hooks = v1.MapGroup("/webhooks").WithTags("Webhooks").RequireAuthorization("admin");

        hooks.MapPost("/", Subscribe).WithSummary("Subscribe a URL to order events")
            .WithBody<SubscribeBody>("application/json")
            .Produces<WebhookSubscription>(201);
        hooks.MapGet("/", List).WithSummary("List subscriptions (secrets are not shown)");
        hooks.MapDelete("/{id}", Unsubscribe).WithSummary("Delete a subscription").Produces(204);
        hooks.MapGet("/{id}/deliveries", Deliveries).WithSummary("Delivery log for a subscription");
    }

    public sealed record SubscribeBody(string Url, string[] Events);

    private static async Task<IResult> Subscribe(HttpContext http, IWebhookRepository repo, TimeProvider time)
    {
        var body = JsonBody.RequireObject(JsonBody.Parse(await JsonBody.ReadRawAsync(http.Request)));
        var errors = new List<FieldIssue>();

        var url = body.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() : null;
        if (url is null || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            errors.Add(new FieldIssue("url", "must be an absolute http or https URL"));
        }

        var events = body.TryGetProperty("events", out var e) && e.ValueKind == JsonValueKind.Array
            ? e.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.String ? x.GetString()! : "").Distinct().ToList()
            : [];
        if (events.Count == 0 || events.Any(x => !WebhookEvents.All.Contains(x)))
        {
            errors.Add(new FieldIssue("events", $"must be a non-empty array of {string.Join(", ", WebhookEvents.All)}"));
        }

        if (errors.Count > 0)
        {
            throw ProblemException.Validation([.. errors]);
        }

        var subscription = repo.Add(new WebhookSubscription(
            Ids.New("whk_"), url!, events, "whsec_" + Ids.Hex(32), time.UtcNowMs()));
        http.Response.Headers.Location = $"/v1/webhooks/{subscription.Id}";
        return Results.Json(subscription, statusCode: 201);
    }

    private static IResult List(IWebhookRepository repo) =>
        Results.Ok(new
        {
            data = repo.List().Select(s => new { s.Id, s.Url, s.Events, s.CreatedAt }),
        });

    private static IResult Unsubscribe(string id, IWebhookRepository repo) =>
        repo.Remove(id) ? Results.NoContent() : throw ProblemException.NotFound("Webhook");

    private static IResult Deliveries(string id, IWebhookRepository repo)
    {
        _ = repo.Find(id) ?? throw ProblemException.NotFound("Webhook");
        return Results.Ok(new
        {
            data = repo.DeliveriesFor(id).Select(d => new
            {
                d.Id, d.EventId, d.EventType, d.Status, d.Attempts, d.LastStatusCode, d.LastError, d.CreatedAt, d.UpdatedAt,
            }),
        });
    }
}

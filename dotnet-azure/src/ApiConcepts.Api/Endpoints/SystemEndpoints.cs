// Concepts 1, 2, 4, 5 · Requests and responses, endpoints, headers, query parameters: root, health, /me and echo.
using System.Text.Json;
using ApiConcepts.Api.Auth;
using ApiConcepts.Api.Common;
using Microsoft.Extensions.Primitives;

namespace ApiConcepts.Api.Endpoints;

public static class SystemEndpoints
{
    public static void MapSystem(this IEndpointRouteBuilder app)
    {
        app.MapGet("/", () => new { name = "Bookshop API", docs = "/docs", openapi = "/openapi.json" })
            .WithTags("System").WithSummary("API index");
        app.MapGet("/health", () => new { status = "ok" })
            .WithTags("System").WithSummary("Liveness probe (never rate limited)");
    }

    public static void MapIdentity(this RouteGroupBuilder v1)
    {
        v1.MapGet("/me", (HttpContext http, DemoClients clients) =>
            {
                var user = http.User;
                var expiresAt = DateTimeOffset.FromUnixTimeSeconds(long.Parse(user.FindFirst("exp")!.Value));
                return new
                {
                    clientId = user.ClientId(),
                    scopes = user.Scopes(),
                    plan = (clients.Find(user.ClientId())?.Plan ?? Plan.Standard).Name,
                    tokenExpiresAt = expiresAt,
                };
            })
            .WithTags("System").WithSummary("Who am I");

        v1.MapMethods("/echo", ["GET", "POST"], Echo)
            .WithTags("System").WithSummary("Echo the request back");
    }

    private static async Task<IResult> Echo(HttpRequest request)
    {
        var body = JsonBody.Parse(await JsonBody.ReadRawAsync(request));

        return Results.Ok(new
        {
            method = request.Method,
            path = request.Path.Value,
            query = request.Query.ToDictionary(q => q.Key, q => q.Value.FirstOrDefault()),
            headers = request.Headers.ToDictionary(h => h.Key.ToLowerInvariant(), h => Mask(h.Key, h.Value)),
            body,
        });
    }

    // Echoing credentials back would defeat the point of keeping them out of logs.
    private static string Mask(string name, StringValues value) =>
        name.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ? "Bearer ***" : value.ToString();
}

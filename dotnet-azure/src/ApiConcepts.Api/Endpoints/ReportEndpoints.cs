// Concepts 21 and 24 · Throttling and timeouts: the slow report endpoint.
// The "reports" rate-limit policy bounds concurrency; the "report" timeout policy cancels slow work.
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.RateLimiting;
using ApiConcepts.Api.Storage;
using Microsoft.AspNetCore.Http.Timeouts;

namespace ApiConcepts.Api.Endpoints;

public static class ReportEndpoints
{
    public const string TimeoutPolicy = "report";

    public static void MapReports(this RouteGroupBuilder v1) =>
        v1.MapGet("/reports/sales", Sales)
            .RequireAuthorization("orders:read")
            .RequireRateLimiting(RateLimitSetup.ReportsPolicy)
            .WithRequestTimeout(TimeoutPolicy)
            .WithTags("Reports")
            .WithSummary("Sales report (at most 2 at once, 2 queued, then 503)");

    private static async Task<IResult> Sales(HttpContext http, IOrderRepository orders, TimeProvider time)
    {
        var raw = http.Request.Query["delayMs"].ToString();
        var delayMs = 300;
        if (raw.Length > 0 &&
            (!int.TryParse(raw, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out delayMs) ||
             delayMs is < 0 or > 10_000))
        {
            throw ProblemException.Validation("delayMs", "must be between 0 and 10000");
        }

        // RequestAborted is replaced by the timeout middleware's token, so a timeout cancels this delay.
        await Task.Delay(TimeSpan.FromMilliseconds(delayMs), time, http.RequestAborted);

        var all = orders.All();
        return Results.Ok(new
        {
            orderCount = all.Count,
            paidCount = all.Count(o => o.Status == OrderStatus.Paid),
            revenueCents = all.Where(o => o.Status == OrderStatus.Paid).Sum(o => (long)o.TotalCents),
            generatedAt = time.GetUtcNow(),
        });
    }
}

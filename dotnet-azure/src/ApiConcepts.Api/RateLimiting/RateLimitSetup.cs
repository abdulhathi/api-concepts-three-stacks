// Concepts 20 and 21 · Rate limiting and throttling, both on the built-in ASP.NET Core rate limiter:
// a global token bucket per client, plus a named concurrency policy (2 running, 2 queued) for reports.
using System.Threading.RateLimiting;
using ApiConcepts.Api.Common;
using Microsoft.AspNetCore.RateLimiting;

namespace ApiConcepts.Api.RateLimiting;

public static class RateLimitSetup
{
    public const string ReportsPolicy = "reports";

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services)
    {
        services.AddSingleton<ClientRateLimiter>();
        services.AddRateLimiter(_ => { });
        services.AddOptions<RateLimiterOptions>().Configure<ClientRateLimiter>((options, clientLimiter) =>
        {
            options.GlobalLimiter = clientLimiter;
            options.AddConcurrencyLimiter(ReportsPolicy, limiter =>
            {
                limiter.PermitLimit = 2;
                limiter.QueueLimit = 2;
                limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            });
            options.OnRejected = async (context, _) =>
            {
                var http = context.HttpContext;
                // The client bucket records a denial; if it did not deny, the report queue did.
                if (http.Items.TryGetValue(ClientRateLimiter.ItemKey, out var recorded) &&
                    recorded is RateLimitSnapshot { Allowed: false } snapshot)
                {
                    await ProblemWriter.WriteAsync(
                        http,
                        ProblemType.RateLimited,
                        $"Rate limit of {snapshot.Limit} requests per minute exceeded.",
                        headers: new Dictionary<string, string> { ["Retry-After"] = snapshot.ResetSeconds.ToString() });
                }
                else
                {
                    await ProblemWriter.WriteAsync(
                        http,
                        ProblemType.Throttled,
                        "Too many reports are running. Try again shortly.",
                        headers: new Dictionary<string, string> { ["Retry-After"] = "1" });
                }
            };
        });
        return services;
    }
}

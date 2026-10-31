// Concept 20 · Rate limiting: a built-in token bucket per client, wrapped so the RateLimit-* headers can be written.
// The built-in limiter decides allow or deny; it does not expose "remaining", so this decorator reads it.
using System.Globalization;
using System.Threading.RateLimiting;
using ApiConcepts.Api.Auth;

namespace ApiConcepts.Api.RateLimiting;

public sealed record RateLimitSnapshot(int Limit, int Remaining, int ResetSeconds, bool Allowed);

public sealed class ClientRateLimiter : PartitionedRateLimiter<HttpContext>
{
    public const string ItemKey = "rate-limit-snapshot";

    private static readonly string[] MeteredPrefixes = ["/v1", "/graphql"];

    private readonly PartitionedRateLimiter<HttpContext> _inner;
    private readonly DemoClients _clients;

    public ClientRateLimiter(DemoClients clients)
    {
        _clients = clients;
        _inner = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        {
            if (PlanFor(context) is not { } plan)
            {
                // Unauthenticated requests (and non-API paths) are not counted: a 401 costs nothing.
                return RateLimitPartition.GetNoLimiter("unmetered");
            }

            return RateLimitPartition.GetTokenBucketLimiter(context.User.ClientId(), _ => BucketFor(plan));
        });
    }

    /// <summary>Capacity is the plan limit; one token returns every 60/limit seconds, which is limit/60 per second.</summary>
    private static TokenBucketRateLimiterOptions BucketFor(Plan plan) => new()
    {
        TokenLimit = plan.RequestsPerMinute,
        TokensPerPeriod = 1,
        ReplenishmentPeriod = TimeSpan.FromSeconds(60.0 / plan.RequestsPerMinute),
        QueueLimit = 0,
        AutoReplenishment = true,
    };

    private Plan? PlanFor(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true ||
            !MeteredPrefixes.Any(prefix => context.Request.Path.StartsWithSegments(prefix)))
        {
            return null;
        }

        return _clients.Find(context.User.ClientId())?.Plan ?? Plan.Standard;
    }

    protected override RateLimitLease AttemptAcquireCore(HttpContext resource, int permitCount) =>
        Record(resource, _inner.AttemptAcquire(resource, permitCount));

    protected override async ValueTask<RateLimitLease> AcquireAsyncCore(
        HttpContext resource, int permitCount, CancellationToken cancellationToken) =>
        Record(resource, await _inner.AcquireAsync(resource, permitCount, cancellationToken));

    public override RateLimiterStatistics? GetStatistics(HttpContext resource) => _inner.GetStatistics(resource);

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _inner.Dispose();
        }

        base.Dispose(disposing);
    }

    private RateLimitLease Record(HttpContext context, RateLimitLease lease)
    {
        if (PlanFor(context) is not { } plan)
        {
            return lease;
        }

        var remaining = (int)(_inner.GetStatistics(context)?.CurrentAvailablePermits ?? 0);
        var period = (int)Math.Ceiling(60.0 / plan.RequestsPerMinute);
        var retryAfter = lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
            ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds))
            : period;
        var reset = remaining > 0 ? 0 : Math.Max(1, retryAfter);

        var snapshot = new RateLimitSnapshot(plan.RequestsPerMinute, remaining, reset, lease.IsAcquired);
        context.Items[ItemKey] = snapshot;
        context.Response.OnStarting(() =>
        {
            WriteHeaders(context.Response, snapshot);
            return Task.CompletedTask;
        });
        return lease;
    }

    private static void WriteHeaders(HttpResponse response, RateLimitSnapshot snapshot)
    {
        response.Headers["RateLimit-Limit"] = snapshot.Limit.ToString(CultureInfo.InvariantCulture);
        response.Headers["RateLimit-Remaining"] = snapshot.Remaining.ToString(CultureInfo.InvariantCulture);
        response.Headers["RateLimit-Reset"] = snapshot.ResetSeconds.ToString(CultureInfo.InvariantCulture);
    }
}

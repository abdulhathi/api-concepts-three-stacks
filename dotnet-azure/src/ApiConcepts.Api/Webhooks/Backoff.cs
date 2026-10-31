// Concept 25 · Exponential backoff: delay before retry n is random(0.5, 1.0) x min(cap, base x 2^(n-1)).
// The jitter keeps many failing deliveries from retrying in lockstep.
namespace ApiConcepts.Api.Webhooks;

public static class Backoff
{
    public static TimeSpan Delay(int retryNumber, TimeSpan baseDelay, TimeSpan cap, Func<double>? random = null)
    {
        var exponential = TimeSpan.FromTicks((long)Math.Min(cap.Ticks, baseDelay.Ticks * Math.Pow(2, retryNumber - 1)));
        var jitter = 0.5 + 0.5 * (random ?? Random.Shared.NextDouble)();
        return exponential * jitter;
    }
}

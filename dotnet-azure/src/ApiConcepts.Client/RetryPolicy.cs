// Concepts 23, 24, 25 · Retries, timeouts, backoff: the Polly v8 pipeline behind the HttpClient.
// Retry wraps the timeout, so every attempt (not the whole call) gets its own deadline.
using Microsoft.Extensions.Http.Resilience;
using Polly;
using Polly.Retry;
using Polly.Timeout;

namespace ApiConcepts.Client;

public static class RetryPolicy
{
    private static readonly HashSet<int> RetryableStatuses = [408, 429, 502, 503, 504];
    private static readonly HashSet<string> SafeMethods = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"];

    public static void Configure(ResiliencePipelineBuilder<HttpResponseMessage> pipeline, ApiClientOptions options)
    {
        pipeline.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = options.MaxRetries,
            ShouldHandle = args => ValueTask.FromResult(ShouldRetry(args)),
            DelayGenerator = args => ValueTask.FromResult<TimeSpan?>(DelayFor(args.AttemptNumber + 1, args.Outcome.Result, options)),
            OnRetry = args =>
            {
                var reason = args.Outcome.Exception is { } e
                    ? e.GetType().Name
                    : ((int)args.Outcome.Result!.StatusCode).ToString();
                options.OnRetry?.Invoke(new RetryEvent(args.AttemptNumber + 1, reason, args.RetryDelay));
                return default;
            },
        });
        pipeline.AddTimeout(options.AttemptTimeout);
    }

    private static bool ShouldRetry(RetryPredicateArguments<HttpResponseMessage> args)
    {
        var failed = args.Outcome switch
        {
            { Exception: HttpRequestException or TimeoutRejectedException } => true,
            { Result: { } response } => RetryableStatuses.Contains((int)response.StatusCode),
            _ => false,
        };
        return failed && IsReplayable(args.Context.GetRequestMessage());
    }

    /// <summary>Only requests that are safe to send twice: idempotent methods, or a POST carrying an Idempotency-Key.</summary>
    private static bool IsReplayable(HttpRequestMessage? request) =>
        request is not null &&
        (SafeMethods.Contains(request.Method.Method) || request.Headers.Contains("Idempotency-Key"));

    /// <summary>Retry-After wins when the server sent one; otherwise exponential backoff with jitter.</summary>
    internal static TimeSpan DelayFor(int retryNumber, HttpResponseMessage? response, ApiClientOptions options)
    {
        var retryAfter = response?.Headers.RetryAfter;
        if (retryAfter?.Delta is { } delta)
        {
            return delta;
        }

        if (retryAfter?.Date is { } date)
        {
            return date - DateTimeOffset.UtcNow is { Ticks: > 0 } wait ? wait : TimeSpan.Zero;
        }

        var exponential = TimeSpan.FromTicks((long)Math.Min(options.BackoffCap.Ticks, options.BackoffBase.Ticks * Math.Pow(2, retryNumber - 1)));
        return exponential * (0.5 + 0.5 * Random.Shared.NextDouble());
    }
}

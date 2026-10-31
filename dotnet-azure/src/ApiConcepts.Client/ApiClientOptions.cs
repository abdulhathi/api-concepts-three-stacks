namespace ApiConcepts.Client;

public sealed class ApiClientOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8003";

    public string ClientId { get; set; } = "reader";

    public string ClientSecret { get; set; } = "reader-secret";

    /// <summary>Concept 24 · Timeouts: each attempt gets its own deadline, so one hung call cannot eat the retries.</summary>
    public TimeSpan AttemptTimeout { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Concept 23 · Retries: retries after the first attempt (3 means at most 4 attempts).</summary>
    public int MaxRetries { get; set; } = 3;

    /// <summary>Concept 25 · Exponential backoff: delay before retry n is random(0.5, 1) x min(cap, base x 2^(n-1)).</summary>
    public TimeSpan BackoffBase { get; set; } = TimeSpan.FromMilliseconds(200);

    public TimeSpan BackoffCap { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Called before each retry; the demo script uses it to print every attempt and its delay.</summary>
    public Action<RetryEvent>? OnRetry { get; set; }
}

/// <param name="Attempt">The attempt that just failed (1 for the first).</param>
/// <param name="Reason">The status code (for example "503") or the exception type that caused the retry.</param>
/// <param name="Delay">How long the client will wait before the next attempt.</param>
public sealed record RetryEvent(int Attempt, string Reason, TimeSpan Delay);

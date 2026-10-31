// Concept 22 · Idempotency: remember the first 201 per (client, Idempotency-Key) for 24 hours.
// Per-instance memory here; a shared cache (Azure Cache for Redis) is what makes it safe to scale out.
namespace ApiConcepts.Api.Orders;

public sealed record StoredResponse(byte[] Body, string Location);

public abstract record IdempotencyDecision
{
    /// <summary>First time this key is seen: the caller must process the request, then Complete or Abandon.</summary>
    public sealed record Proceed : IdempotencyDecision;

    public sealed record Replay(StoredResponse Response) : IdempotencyDecision;

    public sealed record InProgress : IdempotencyDecision;

    public sealed record Reused : IdempotencyDecision;
}

public interface IIdempotencyStore
{
    IdempotencyDecision Begin(string clientId, string key, string bodyHash);

    void Complete(string clientId, string key, StoredResponse response);

    /// <summary>Forget a key whose request failed: only successful creations are replayed.</summary>
    void Abandon(string clientId, string key);
}

public sealed class InMemoryIdempotencyStore(TimeProvider time) : IIdempotencyStore
{
    private static readonly TimeSpan Retention = TimeSpan.FromHours(24);

    private sealed record Entry(string BodyHash, DateTimeOffset ExpiresAt, StoredResponse? Response);

    private readonly Lock _gate = new();
    private readonly Dictionary<(string Client, string Key), Entry> _entries = [];

    public IdempotencyDecision Begin(string clientId, string key, string bodyHash)
    {
        lock (_gate)
        {
            var now = time.GetUtcNow();
            if (_entries.TryGetValue((clientId, key), out var existing) && existing.ExpiresAt > now)
            {
                if (existing.BodyHash != bodyHash)
                {
                    return new IdempotencyDecision.Reused();
                }

                return existing.Response is { } stored
                    ? new IdempotencyDecision.Replay(stored)
                    : new IdempotencyDecision.InProgress();
            }

            _entries[(clientId, key)] = new Entry(bodyHash, now + Retention, null);
            return new IdempotencyDecision.Proceed();
        }
    }

    public void Complete(string clientId, string key, StoredResponse response)
    {
        lock (_gate)
        {
            if (_entries.TryGetValue((clientId, key), out var entry))
            {
                _entries[(clientId, key)] = entry with { Response = response };
            }
        }
    }

    public void Abandon(string clientId, string key)
    {
        lock (_gate)
        {
            _entries.Remove((clientId, key));
        }
    }
}

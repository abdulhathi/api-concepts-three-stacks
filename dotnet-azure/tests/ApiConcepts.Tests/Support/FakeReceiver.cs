using System.Net;

namespace ApiConcepts.Tests.Support;

public sealed record ReceivedWebhook(string Url, Dictionary<string, string> Headers, byte[] Body);

/// <summary>Stands in for a webhook receiver: records deliveries and fails the first few on demand.</summary>
public sealed class FakeReceiver : HttpMessageHandler
{
    private readonly List<ReceivedWebhook> _received = [];
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> _failuresLeft = new();

    /// <summary>Makes the next <paramref name="count"/> deliveries to <paramref name="url"/> answer 500.</summary>
    public void FailNext(string url, int count) => _failuresLeft[url] = count;

    public IReadOnlyList<ReceivedWebhook> Received
    {
        get
        {
            lock (_received)
            {
                return [.. _received];
            }
        }
    }

    private bool TakeFailure(string url)
    {
        lock (_failuresLeft)
        {
            if (!_failuresLeft.TryGetValue(url, out var left) || left <= 0)
            {
                return false;
            }

            _failuresLeft[url] = left - 1;
            return true;
        }
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var headers = request.Headers.Concat(request.Content!.Headers)
            .ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase);
        var body = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
        lock (_received)
        {
            _received.Add(new ReceivedWebhook(request.RequestUri!.ToString(), headers, body));
        }

        var url = request.RequestUri.ToString();
        var fail = TakeFailure(url);
        return fail
            ? new HttpResponseMessage(HttpStatusCode.InternalServerError)
            : new HttpResponseMessage(HttpStatusCode.OK);
    }
}

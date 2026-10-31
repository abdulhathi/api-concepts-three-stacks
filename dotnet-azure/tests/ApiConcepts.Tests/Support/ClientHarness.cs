using System.Net;
using System.Text;
using ApiConcepts.Client;
using Microsoft.Extensions.DependencyInjection;

namespace ApiConcepts.Tests.Support;

public sealed record RecordedCall(string Method, string Path, Dictionary<string, string> Headers);

/// <summary>A scripted server for client tests: answers token requests itself and records every other call.</summary>
public sealed class StubHandler(Func<int, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
{
    private readonly List<RecordedCall> _calls = [];

    public IReadOnlyList<RecordedCall> Calls
    {
        get
        {
            lock (_calls)
            {
                return [.. _calls];
            }
        }
    }

    public int TokenRequests;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri!.AbsolutePath == "/oauth/token")
        {
            Interlocked.Increment(ref TokenRequests);
            return Json(HttpStatusCode.OK, """{"access_token":"stub-token","token_type":"Bearer","expires_in":900,"scope":"x"}""");
        }

        int attempt;
        lock (_calls)
        {
            _calls.Add(new RecordedCall(
                request.Method.Method,
                request.RequestUri.PathAndQuery,
                request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase)));
            attempt = _calls.Count;
        }

        return await respond(attempt, cancellationToken);
    }

    public static HttpResponseMessage Json(HttpStatusCode status, string body, string mediaType = "application/json") =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, mediaType) };

    public static HttpResponseMessage Problem(HttpStatusCode status, string slug, string? retryAfter = null)
    {
        var response = Json(status, $$"""{"type":"/problems/{{slug}}","title":"t","status":{{(int)status}},"detail":"d","requestId":"r"}""", "application/problem+json");
        if (retryAfter is not null)
        {
            response.Headers.TryAddWithoutValidation("Retry-After", retryAfter);
        }

        return response;
    }
}

public static class ClientHarness
{
    /// <summary>The typed client with fast backoff, talking to <paramref name="handler"/>.</summary>
    public static ApiClient Create(HttpMessageHandler handler, Action<ApiClientOptions>? configure = null)
    {
        var services = new ServiceCollection();
        services.AddApiConceptsClient(options =>
        {
            options.BaseUrl = "http://localhost";
            options.BackoffBase = TimeSpan.FromMilliseconds(2);
            options.BackoffCap = TimeSpan.FromMilliseconds(20);
            configure?.Invoke(options);
        }).ConfigurePrimaryHttpMessageHandler(() => handler);
        return services.BuildServiceProvider().GetRequiredService<ApiClient>();
    }
}

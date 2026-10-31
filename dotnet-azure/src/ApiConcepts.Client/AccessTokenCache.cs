// Concept 13 · OAuth 2.0: fetch a client-credentials token once and reuse it until 30 s before it expires.
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ApiConcepts.Client;

internal sealed class AccessTokenCache(HttpClient http, ApiClientOptions options, TimeProvider time)
{
    private static readonly TimeSpan RefreshMargin = TimeSpan.FromSeconds(30);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _token;
    private DateTimeOffset _refreshAt;

    public async Task<string> GetAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_token is null || time.GetUtcNow() >= _refreshAt)
            {
                await FetchAsync(cancellationToken);
            }

            return _token!;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task FetchAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token")
        {
            Content = new FormUrlEncodedContent([new("grant_type", "client_credentials")]),
        };
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{options.ClientId}:{options.ClientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        using var response = await ApiClient.SendOrWrapAsync(http, request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw await ApiClient.ToExceptionAsync(response, cancellationToken);
        }

        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        _token = json.RootElement.GetProperty("access_token").GetString()!;
        var lifetime = TimeSpan.FromSeconds(json.RootElement.GetProperty("expires_in").GetInt32());
        _refreshAt = time.GetUtcNow() + lifetime - RefreshMargin;
    }
}

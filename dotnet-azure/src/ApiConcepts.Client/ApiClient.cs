// Concepts 23, 24, 25 · A typed client for the Bookshop API. Authentication and retries happen here,
// so callers just call methods; the retry rules themselves live in RetryPolicy.
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Polly.Timeout;

namespace ApiConcepts.Client;

public sealed class ApiClient
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly AccessTokenCache _tokens;

    public ApiClient(HttpClient http, IOptions<ApiClientOptions> options, TimeProvider time)
    {
        _http = http;
        _tokens = new AccessTokenCache(http, options.Value, time);
    }

    public Task<Me> GetMeAsync(CancellationToken ct = default) => GetAsync<Me>("v1/me", ct);

    public Task<ResultPage<Product>> GetProductsAsync(
        int? limit = null, string? cursor = null, string? tag = null, CancellationToken ct = default)
    {
        var query = new List<string>();
        if (limit is not null) query.Add($"limit={limit}");
        if (cursor is not null) query.Add($"cursor={Uri.EscapeDataString(cursor)}");
        if (tag is not null) query.Add($"tag={Uri.EscapeDataString(tag)}");
        return GetAsync<ResultPage<Product>>("v1/products" + (query.Count > 0 ? "?" + string.Join('&', query) : ""), ct);
    }

    public Task<Product> GetProductAsync(string id, CancellationToken ct = default) =>
        GetAsync<Product>($"v1/products/{Uri.EscapeDataString(id)}", ct);

    public Task<Product> CreateProductAsync(NewProduct product, CancellationToken ct = default) =>
        SendAsync<Product>(HttpMethod.Post, "v1/products", product, idempotencyKey: null, ct);

    /// <summary>
    /// Creates an order. One Idempotency-Key is generated for the call and reused by every retry, so a lost
    /// response can never create a second order.
    /// </summary>
    public Task<Order> CreateOrderAsync(IReadOnlyList<OrderLine> items, CancellationToken ct = default) =>
        SendAsync<Order>(HttpMethod.Post, "v1/orders", new { items }, Guid.NewGuid().ToString(), ct);

    public Task<Order> GetOrderAsync(string id, CancellationToken ct = default) =>
        GetAsync<Order>($"v1/orders/{Uri.EscapeDataString(id)}", ct);

    public Task<Order> PayOrderAsync(string id, CancellationToken ct = default) =>
        SendAsync<Order>(HttpMethod.Post, $"v1/orders/{Uri.EscapeDataString(id)}/pay", body: null, idempotencyKey: null, ct);

    public Task<FlakyResult> GetFlakyAsync(string key, int failTimes = 2, CancellationToken ct = default) =>
        GetAsync<FlakyResult>($"v1/demo/flaky?key={Uri.EscapeDataString(key)}&failTimes={failTimes}", ct);

    public Task<T> GetAsync<T>(string path, CancellationToken ct = default) =>
        SendAsync<T>(HttpMethod.Get, path, body: null, idempotencyKey: null, ct);

    private async Task<T> SendAsync<T>(
        HttpMethod method, string path, object? body, string? idempotencyKey, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _tokens.GetAsync(ct));
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: Json);
        }

        if (idempotencyKey is not null)
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        using var response = await SendOrWrapAsync(_http, request, ct);
        if (!response.IsSuccessStatusCode)
        {
            throw await ToExceptionAsync(response, ct);
        }

        return (await response.Content.ReadFromJsonAsync<T>(Json, ct))!;
    }

    /// <summary>Network failures and timeouts that survive every retry become an ApiException with status 0.</summary>
    internal static async Task<HttpResponseMessage> SendOrWrapAsync(
        HttpClient http, HttpRequestMessage request, CancellationToken ct)
    {
        try
        {
            return await http.SendAsync(request, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TimeoutRejectedException)
        {
            throw new ApiException(0, null, $"No response from the server: {e.Message}", e);
        }
    }

    internal static async Task<ApiException> ToExceptionAsync(HttpResponseMessage response, CancellationToken ct)
    {
        ProblemInfo? problem = null;
        try
        {
            problem = await response.Content.ReadFromJsonAsync<ProblemInfo>(Json, ct);
        }
        catch (JsonException)
        {
            // Not a problem document (for example an OAuth error); the status code still tells the story.
        }

        var status = (int)response.StatusCode;
        return new ApiException(status, problem, problem?.Detail ?? $"Request failed with HTTP {status}.");
    }
}

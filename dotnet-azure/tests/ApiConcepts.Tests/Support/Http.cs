using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace ApiConcepts.Tests.Support;

public static class Http
{
    public static StringContent Json(object body, string mediaType = "application/json") =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, mediaType);

    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response)
    {
        // Read as text so a test can look at the same response more than once.
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    public static async Task<string> ProblemSlugAsync(this HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var type = (await response.JsonAsync()).GetProperty("type").GetString()!;
        Assert.StartsWith("/problems/", type);
        return type["/problems/".Length..];
    }

    public static HttpRequestMessage Request(HttpMethod method, string url, HttpContent? content = null, params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(method, url) { Content = content };
        foreach (var (name, value) in headers)
        {
            request.Headers.TryAddWithoutValidation(name, value);
        }

        return request;
    }

    public static Task<HttpResponseMessage> PostOrderAsync(this HttpClient http, string key, params (string Product, int Qty)[] items) =>
        http.SendAsync(Request(
            HttpMethod.Post,
            "/v1/orders",
            Json(new { items = items.Select(i => new { productId = i.Product, quantity = i.Qty }) }),
            ("Idempotency-Key", key)));

    public static async Task<JsonElement> CreateProductAsync(this HttpClient http, string title = "Test Book")
    {
        var response = await http.PostAsync("/v1/products", Json(new { title, author = "Tester", priceCents = 1000 }));
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return await response.JsonAsync();
    }

    public static async Task<T> EventuallyAsync<T>(Func<Task<T>> read, Func<T, bool> done, int timeoutMs = 5000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        var value = await read();
        while (!done(value) && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20);
            value = await read();
        }

        return value;
    }
}

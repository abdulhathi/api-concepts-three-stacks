// Concepts 20-22: rate limiting, throttling and idempotency (server side).
using System.Diagnostics;
using System.Net;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;
using ApiConcepts.Tests.Support;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ApiConcepts.Tests;

public sealed class RateLimitTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task Test_20_Rate_Limit_Returns_429_With_Retry_After_When_The_Bucket_Is_Empty()
    {
        using var free = await api.As("free");

        var responses = new List<HttpResponseMessage>();
        for (var i = 0; i < 6; i++)
        {
            responses.Add(await free.GetAsync("/v1/products"));
        }

        Assert.All(responses.Take(5), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(["4", "3", "2", "1", "0"], responses.Take(5).Select(r => r.Headers.GetValues("RateLimit-Remaining").Single()));
        Assert.All(responses, r => Assert.Equal("5", r.Headers.GetValues("RateLimit-Limit").Single()));

        var limited = responses[5];
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("rate-limited", await limited.ProblemSlugAsync());
        var retryAfter = int.Parse(limited.Headers.GetValues("Retry-After").Single());
        Assert.InRange(retryAfter, 1, 12);
        Assert.Equal(retryAfter.ToString(), limited.Headers.GetValues("RateLimit-Reset").Single());
        Assert.Equal("0", limited.Headers.GetValues("RateLimit-Remaining").Single());
    }

    [Fact]
    public async Task Test_20_Rate_Limit_Is_Per_Client_And_Skips_Health_Unauthenticated_And_Preflight()
    {
        using var reader = await api.As("reader");
        using var anon = api.CreateClient();

        var first = await reader.GetAsync("/v1/me");
        var second = await reader.GetAsync("/v1/me");
        var health = await anon.GetAsync("/health");
        var unauth = await anon.GetAsync("/v1/me");
        var preflight = await anon.SendAsync(Http.Request(HttpMethod.Options, "/v1/me", null,
            ("Origin", "http://localhost:5173"), ("Access-Control-Request-Method", "GET")));

        Assert.Equal("1000", first.Headers.GetValues("RateLimit-Limit").Single());
        Assert.True(int.Parse(second.Headers.GetValues("RateLimit-Remaining").Single()) < int.Parse(first.Headers.GetValues("RateLimit-Remaining").Single()));
        Assert.False(health.Headers.Contains("RateLimit-Limit"));
        Assert.False(unauth.Headers.Contains("RateLimit-Limit"));
        Assert.False(preflight.Headers.Contains("RateLimit-Limit"));
    }
}

public sealed class ThrottleTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task Test_21_Throttle_Runs_Two_Queues_Two_And_Rejects_The_Fifth_And_Sixth_With_503()
    {
        using var admin = await ApiFixture.As(api.WithSettings(("REQUEST_TIMEOUT_MS", "5000")), "admin");

        var started = Stopwatch.StartNew();
        var calls = Enumerable.Range(0, 6).Select(async _ =>
        {
            var response = await admin.GetAsync("/v1/reports/sales?delayMs=500");
            return (response, At: started.ElapsedMilliseconds);
        }).ToList();
        var results = await Task.WhenAll(calls);

        var ok = results.Where(r => r.response.StatusCode == HttpStatusCode.OK).ToList();
        var busy = results.Where(r => r.response.StatusCode == HttpStatusCode.ServiceUnavailable).ToList();
        Assert.Equal(4, ok.Count);
        Assert.Equal(2, busy.Count);
        foreach (var (response, at) in busy)
        {
            Assert.Equal("throttled", await response.ProblemSlugAsync());
            Assert.Equal("1", response.Headers.GetValues("Retry-After").Single());
            Assert.True(at < 400, $"rejected after {at} ms, expected immediately");
        }

        // 2 ran at once (~500 ms) and 2 waited for them (~1000 ms).
        Assert.Equal(2, ok.Count(r => r.At >= 900));
        var report = await ok[0].response.JsonAsync();
        Assert.True(report.TryGetProperty("revenueCents", out _));
    }

    [Fact]
    public async Task Test_21_Reports_Are_Admitted_Again_Once_The_Queue_Drains()
    {
        using var reader = await api.As("reader");

        var response = await reader.GetAsync("/v1/reports/sales?delayMs=0");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

public sealed class IdempotencyTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task Test_22_Idempotency_Replays_The_Stored_201_Without_Creating_Another_Order()
    {
        using var writer = await api.As("writer");
        var key = Guid.NewGuid().ToString();

        var first = await writer.PostOrderAsync(key, ("prd_01", 2));
        var replay = await writer.PostOrderAsync(key, ("prd_01", 2));
        var list = await (await writer.GetAsync("/v1/orders?limit=50")).JsonAsync();

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.False(first.Headers.Contains("Idempotent-Replayed"));
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode);
        Assert.Equal("true", replay.Headers.GetValues("Idempotent-Replayed").Single());
        Assert.Equal(first.Headers.Location, replay.Headers.Location);
        Assert.Equal(await first.Content.ReadAsStringAsync(), await replay.Content.ReadAsStringAsync());
        var id = (await first.JsonAsync()).GetProperty("id").GetString();
        Assert.Single(list.GetProperty("data").EnumerateArray(), o => o.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Test_22_Reusing_A_Key_With_A_Different_Body_Is_422()
    {
        using var writer = await api.As("writer");
        var key = Guid.NewGuid().ToString();
        await writer.PostOrderAsync(key, ("prd_01", 1));

        var reused = await writer.PostOrderAsync(key, ("prd_01", 3));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, reused.StatusCode);
        Assert.Equal("idempotency-key-reused", await reused.ProblemSlugAsync());
    }

    [Fact]
    public async Task Test_22_Missing_Or_Oversized_Key_Is_400_And_Keys_Are_Scoped_Per_Client()
    {
        using var writer = await api.As("writer");
        using var partner = await api.As("partner");
        var key = Guid.NewGuid().ToString();

        var missing = await writer.PostAsync("/v1/orders", Http.Json(new { items = new[] { new { productId = "prd_01", quantity = 1 } } }));
        var tooLong = await writer.PostOrderAsync(new string('k', 256), ("prd_01", 1));
        var mine = await writer.PostOrderAsync(key, ("prd_01", 1));
        var theirs = await partner.PostOrderAsync(key, ("prd_01", 1));

        Assert.Equal("idempotency-key-required", await missing.ProblemSlugAsync());
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.False(theirs.Headers.Contains("Idempotent-Replayed"));
        Assert.NotEqual((await mine.JsonAsync()).GetProperty("id").GetString(), (await theirs.JsonAsync()).GetProperty("id").GetString());
    }

    [Fact]
    public async Task Test_22_A_Failed_First_Attempt_Does_Not_Poison_The_Key()
    {
        using var writer = await api.As("writer");
        var key = Guid.NewGuid().ToString();

        var unknown = await writer.PostOrderAsync(key, ("prd_nope", 1));
        var retry = await writer.PostOrderAsync(key, ("prd_01", 1));

        Assert.Equal("unknown-product", await unknown.ProblemSlugAsync());
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
    }

    [Fact]
    public async Task Test_22_Same_Key_While_The_First_Is_In_Flight_Is_409()
    {
        var gate = new BlockingOrderRepository(new InMemoryOrderRepository());
        using var host = api.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IOrderRepository>(gate)));
        using var writer = await ApiFixture.As(host, "writer");
        var key = Guid.NewGuid().ToString();

        var first = writer.PostOrderAsync(key, ("prd_01", 1));
        await gate.Entered.WaitAsync(TimeSpan.FromSeconds(5));
        var second = await writer.PostOrderAsync(key, ("prd_01", 1));
        gate.Release.Set();
        var firstResponse = await first;

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("idempotency-key-in-progress", await second.ProblemSlugAsync());
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
    }

    [Fact]
    public async Task Test_22_Pay_Is_Idempotent_Too_Paying_Twice_Leaves_The_Order_Unchanged()
    {
        using var writer = await api.As("writer");
        var id = (await (await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_01", 1))).JsonAsync()).GetProperty("id").GetString();

        var first = await (await writer.PostAsync($"/v1/orders/{id}/pay", null)).JsonAsync();
        var second = await (await writer.PostAsync($"/v1/orders/{id}/pay", null)).JsonAsync();

        Assert.Equal("paid", first.GetProperty("status").GetString());
        Assert.Equal(first.GetProperty("updatedAt").GetString(), second.GetProperty("updatedAt").GetString());
    }

    private sealed class BlockingOrderRepository(IOrderRepository inner) : IOrderRepository
    {
        public SemaphoreSlim Entered { get; } = new(0);

        public ManualResetEventSlim Release { get; } = new();

        public Order Add(Order order)
        {
            Entered.Release();
            Release.Wait(TimeSpan.FromSeconds(10));
            return inner.Add(order);
        }

        public Order? Find(string id) => inner.Find(id);

        public ApiConcepts.Api.Common.Page<Order> List(int limit, ApiConcepts.Api.Common.Cursor? after, Func<Order, bool> visible) =>
            inner.List(limit, after, visible);

        public Change<Order>? Update(string id, Func<Order, Order> change) => inner.Update(id, change);

        public IReadOnlyList<Order> All() => inner.All();
    }
}

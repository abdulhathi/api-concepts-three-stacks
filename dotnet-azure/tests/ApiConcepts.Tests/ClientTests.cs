// Concepts 23-25: the typed client's retries, per-attempt timeouts and backoff, plus the server's 504 and the backoff maths.
using System.Diagnostics;
using System.Net;
using ApiConcepts.Api.Webhooks;
using ApiConcepts.Client;
using ApiConcepts.Tests.Support;

namespace ApiConcepts.Tests;

public sealed class ClientRetryTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    private const string OrderJson = """{"id":"ord_1","clientId":"c","status":"pending","items":[],"totalCents":0,"currency":"USD","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}""";

    [Fact]
    public async Task Test_23_Client_Retries_503_Until_It_Succeeds_And_Caches_The_Token()
    {
        var stub = new StubHandler((attempt, _) => Task.FromResult(attempt < 3
            ? StubHandler.Problem(HttpStatusCode.ServiceUnavailable, "service-unavailable")
            : StubHandler.Json(HttpStatusCode.OK, """{"key":"k","attempts":3}""")));
        var client = ClientHarness.Create(stub);

        var result = await client.GetFlakyAsync("k");
        await client.GetFlakyAsync("k");

        Assert.Equal(3, result.Attempts);
        Assert.Equal(4, stub.Calls.Count);
        Assert.Equal(1, stub.TokenRequests);
        Assert.Equal("Bearer stub-token", stub.Calls[0].Headers["Authorization"]);
    }

    [Fact]
    public async Task Test_23_Client_Gives_Up_After_Four_Attempts_With_The_Problem_Details()
    {
        var stub = new StubHandler((_, _) => Task.FromResult(StubHandler.Problem(HttpStatusCode.ServiceUnavailable, "service-unavailable")));
        var client = ClientHarness.Create(stub);

        var error = await Assert.ThrowsAsync<ApiException>(() => client.GetFlakyAsync("k"));

        Assert.Equal(4, stub.Calls.Count);
        Assert.Equal(503, error.StatusCode);
        Assert.Equal("service-unavailable", error.ProblemSlug);
        Assert.Equal("r", error.Problem!.RequestId);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task Test_23_Client_Does_Not_Retry_Other_Statuses(HttpStatusCode status)
    {
        var stub = new StubHandler((_, _) => Task.FromResult(StubHandler.Problem(status, "x")));
        var client = ClientHarness.Create(stub);

        var error = await Assert.ThrowsAsync<ApiException>(() => client.GetProductAsync("prd_01"));

        Assert.Single(stub.Calls);
        Assert.Equal((int)status, error.StatusCode);
    }

    [Fact]
    public async Task Test_23_A_Post_Without_An_Idempotency_Key_Is_Never_Retried()
    {
        var stub = new StubHandler((_, _) => Task.FromResult(StubHandler.Problem(HttpStatusCode.ServiceUnavailable, "service-unavailable")));
        var client = ClientHarness.Create(stub);

        await Assert.ThrowsAsync<ApiException>(() => client.CreateProductAsync(new NewProduct("t", "a", 1)));

        Assert.Single(stub.Calls);
    }

    [Fact]
    public async Task Test_23_Create_Order_Reuses_One_Idempotency_Key_On_Every_Attempt()
    {
        var stub = new StubHandler((attempt, _) => Task.FromResult(attempt < 3
            ? StubHandler.Problem(HttpStatusCode.BadGateway, "bad-gateway")
            : StubHandler.Json(HttpStatusCode.Created, OrderJson)));
        var client = ClientHarness.Create(stub);

        var order = await client.CreateOrderAsync([new OrderLine("prd_01", 1)]);

        Assert.Equal("ord_1", order.Id);
        Assert.Equal(3, stub.Calls.Count);
        var keys = stub.Calls.Select(c => c.Headers["Idempotency-Key"]).Distinct().ToList();
        Assert.Single(keys);
        Assert.True(Guid.TryParse(keys[0], out _));
    }

    [Fact]
    public async Task Test_23_Client_Works_End_To_End_Against_The_Server_Including_Flaky_Retries()
    {
        var client = ClientHarness.Create(api.Server.CreateHandler(), o => { o.ClientId = "writer"; o.ClientSecret = "writer-secret"; });
        var key = "e2e-" + Guid.NewGuid().ToString("N")[..8];

        var flaky = await client.GetFlakyAsync(key, failTimes: 2);
        var page = await client.GetProductsAsync(limit: 2);
        var order = await client.CreateOrderAsync([new OrderLine("prd_01", 2)]);
        var missing = await Assert.ThrowsAsync<ApiException>(() => client.GetProductAsync("prd_99"));

        Assert.Equal(3, flaky.Attempts);
        Assert.Equal(2, page.Data.Count);
        Assert.Equal(2 * 3499, order.TotalCents);
        Assert.Equal("not-found", missing.ProblemSlug);
    }

    [Fact]
    public async Task Test_23_Retry_After_Overrides_The_Backoff_Delay()
    {
        var delays = new List<TimeSpan>();
        var stub = new StubHandler((attempt, _) => Task.FromResult(attempt == 1
            ? StubHandler.Problem(HttpStatusCode.TooManyRequests, "rate-limited", retryAfter: "1")
            : StubHandler.Json(HttpStatusCode.OK, """{"key":"k","attempts":2}""")));
        var client = ClientHarness.Create(stub, o => o.OnRetry = e => delays.Add(e.Delay));

        var watch = Stopwatch.StartNew();
        await client.GetFlakyAsync("k");

        Assert.Equal([TimeSpan.FromSeconds(1)], delays);
        Assert.True(watch.Elapsed >= TimeSpan.FromMilliseconds(900));
    }

    [Fact]
    public async Task Test_24_Client_Times_Out_Each_Attempt_Then_Retries_And_Finally_Gives_Up()
    {
        var stub = new StubHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return StubHandler.Json(HttpStatusCode.OK, "{}");
        });
        var client = ClientHarness.Create(stub, o => { o.AttemptTimeout = TimeSpan.FromMilliseconds(80); o.MaxRetries = 2; });

        var watch = Stopwatch.StartNew();
        var error = await Assert.ThrowsAsync<ApiException>(() => client.GetFlakyAsync("k"));

        Assert.Equal(3, stub.Calls.Count);
        Assert.Equal(0, error.StatusCode);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Test_24_Server_Cancels_A_Slow_Report_And_Answers_504_At_The_Timeout()
    {
        using var admin = await api.As("admin");

        var watch = Stopwatch.StartNew();
        var response = await admin.GetAsync("/v1/reports/sales?delayMs=5000");

        Assert.Equal(HttpStatusCode.GatewayTimeout, response.StatusCode);
        Assert.Equal("timeout", await response.ProblemSlugAsync());
        Assert.InRange(watch.ElapsedMilliseconds, 250, 2000);
    }

    [Fact]
    public async Task Test_24_A_Fast_Report_Finishes_Inside_The_Timeout()
    {
        using var admin = await api.As("admin");

        var response = await admin.GetAsync("/v1/reports/sales?delayMs=50");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Test_25_Client_Backoff_Doubles_With_Jitter_Up_To_The_Cap()
    {
        var delays = new List<TimeSpan>();
        var stub = new StubHandler((_, _) => Task.FromResult(StubHandler.Problem(HttpStatusCode.ServiceUnavailable, "service-unavailable")));
        var client = ClientHarness.Create(stub, o =>
        {
            o.BackoffBase = TimeSpan.FromMilliseconds(40);
            o.BackoffCap = TimeSpan.FromMilliseconds(100);
            o.OnRetry = e => delays.Add(e.Delay);
        });

        await Assert.ThrowsAsync<ApiException>(() => client.GetFlakyAsync("k"));

        // retry n: random(0.5, 1.0) x min(100, 40 x 2^(n-1)) ms -> ceilings 40, 80, 100
        Assert.Equal(3, delays.Count);
        Assert.InRange(delays[0].TotalMilliseconds, 20, 40);
        Assert.InRange(delays[1].TotalMilliseconds, 40, 80);
        Assert.InRange(delays[2].TotalMilliseconds, 50, 100);
    }

    [Theory]
    [InlineData(1, 0.0, 250)]
    [InlineData(1, 1.0, 500)]
    [InlineData(3, 0.0, 1000)]
    [InlineData(3, 1.0, 2000)]
    [InlineData(10, 1.0, 60000)]
    [InlineData(10, 0.0, 30000)]
    public void Test_25_Webhook_Backoff_Formula_Is_Jittered_Capped_Exponential(int retry, double random, double expectedMs)
    {
        var delay = Backoff.Delay(retry, TimeSpan.FromMilliseconds(500), TimeSpan.FromSeconds(60), () => random);

        Assert.Equal(expectedMs, delay.TotalMilliseconds, precision: 3);
    }
}

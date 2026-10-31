// Concepts 26-27: webhooks (signing, retries, delivery log) and RFC 9457 error handling.
using System.Net;
using System.Text.Json;
using ApiConcepts.Client;
using ApiConcepts.Tests.Support;

namespace ApiConcepts.Tests;

public sealed class WebhookTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    private async Task<(HttpClient Admin, string Id, string Secret, string Url)> SubscribeAsync(params string[] events)
    {
        var admin = await api.As("admin");
        // A URL per subscription, because every subscription in this host hears every order event.
        var url = $"http://receiver.test/hook/{Guid.NewGuid():N}";
        var response = await admin.PostAsync("/v1/webhooks", Http.Json(new { url, events }));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.JsonAsync();
        return (admin, body.GetProperty("id").GetString()!, body.GetProperty("secret").GetString()!, url);
    }

    private static async Task<JsonElement> DeliveriesAsync(HttpClient admin, string id, Func<JsonElement, bool> done) =>
        await Http.EventuallyAsync(
            async () => (await (await admin.GetAsync($"/v1/webhooks/{id}/deliveries")).JsonAsync()).GetProperty("data"),
            done);

    [Fact]
    public async Task Test_26_Subscription_Has_Whsec_Secret_Which_The_List_Hides()
    {
        var (admin, id, secret, url) = await SubscribeAsync("order.created");

        var list = await (await admin.GetAsync("/v1/webhooks")).JsonAsync();
        var mine = list.GetProperty("data").EnumerateArray().Single(s => s.GetProperty("id").GetString() == id);
        var bad = await admin.PostAsync("/v1/webhooks", Http.Json(new { url = "ftp://x", events = new[] { "nope" } }));
        var gone = await admin.DeleteAsync($"/v1/webhooks/{id}");

        Assert.Matches("^whk_[0-9a-f]{12}$", id);
        Assert.Matches("^whsec_[0-9a-f]{64}$", secret);
        Assert.False(mine.TryGetProperty("secret", out _));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, gone.StatusCode);
    }

    [Fact]
    public async Task Test_26_Webhook_Delivery_Is_Signed_And_Verifiable_By_The_Receiver_Helper()
    {
        var (admin, id, secret, url) = await SubscribeAsync("order.created");
        using var writer = await api.As("writer");
        var before = api.Receiver.Received.Count;

        var order = await (await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_01", 1))).JsonAsync();
        var deliveries = await DeliveriesAsync(admin, id, d => d.GetArrayLength() > 0 && d[0].GetProperty("status").GetString() == "succeeded");

        var hook = api.Receiver.Received.Skip(before).First(r => r.Url == url);
        var timestamp = hook.Headers["Webhook-Timestamp"];
        var signature = hook.Headers["Webhook-Signature"];
        var envelope = JsonDocument.Parse(hook.Body).RootElement;
        Assert.Matches("^v1=[0-9a-f]{64}$", signature);
        Assert.True(WebhookSignature.Verify(secret, timestamp, signature, hook.Body, DateTimeOffset.UtcNow));
        Assert.False(WebhookSignature.Verify(secret, timestamp, signature, [.. hook.Body, (byte)' '], DateTimeOffset.UtcNow));
        Assert.False(WebhookSignature.Verify("whsec_wrong", timestamp, signature, hook.Body, DateTimeOffset.UtcNow));
        Assert.False(WebhookSignature.Verify(secret, timestamp, signature, hook.Body, DateTimeOffset.UtcNow.AddSeconds(301)));
        Assert.Equal("application/json", hook.Headers["Content-Type"]);
        Assert.Equal(envelope.GetProperty("id").GetString(), hook.Headers["Webhook-Id"]);
        Assert.Equal("order.created", envelope.GetProperty("type").GetString());
        Assert.Equal(order.GetProperty("id").GetString(), envelope.GetProperty("data").GetProperty("order").GetProperty("id").GetString());
        Assert.Equal(1, deliveries[0].GetProperty("attempts").GetInt32());
    }

    [Fact]
    public async Task Test_26_Failed_Delivery_Is_Retried_With_Backoff_Until_The_Receiver_Recovers()
    {
        var (admin, id, secret, url) = await SubscribeAsync("order.created");
        using var writer = await api.As("writer");
        api.Receiver.FailNext(url, 2);
        var before = api.Receiver.Received.Count;

        await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_02", 1));
        var deliveries = await DeliveriesAsync(admin, id, d => d.GetArrayLength() > 0 && d[0].GetProperty("status").GetString() == "succeeded");

        var attempts = api.Receiver.Received.Skip(before).Where(r => r.Url == url).ToList();
        var delivery = deliveries[0];
        Assert.Equal(3, delivery.GetProperty("attempts").GetInt32());
        Assert.Equal(200, delivery.GetProperty("lastStatusCode").GetInt32());
        Assert.Equal(3, attempts.Count);
        Assert.Single(attempts.Select(a => a.Headers["Webhook-Id"]).Distinct());
        Assert.All(attempts, a => Assert.True(WebhookSignature.Verify(secret, a.Headers["Webhook-Timestamp"], a.Headers["Webhook-Signature"], a.Body, DateTimeOffset.UtcNow)));
    }

    [Fact]
    public async Task Test_26_Delivery_Fails_After_The_Maximum_Attempts_And_The_Log_Says_Why()
    {
        var (admin, id, _, url) = await SubscribeAsync("order.created");
        using var writer = await api.As("writer");
        api.Receiver.FailNext(url, 100);

        await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_03", 1));
        var deliveries = await DeliveriesAsync(admin, id, d => d.GetArrayLength() > 0 && d[0].GetProperty("status").GetString() == "failed");

        var delivery = deliveries[0];
        Assert.Equal("failed", delivery.GetProperty("status").GetString());
        Assert.Equal(5, delivery.GetProperty("attempts").GetInt32());
        Assert.Equal(500, delivery.GetProperty("lastStatusCode").GetInt32());
        Assert.Contains("500", delivery.GetProperty("lastError").GetString());
    }

    [Fact]
    public async Task Test_26_Only_Matching_Events_Are_Delivered_Replays_Send_Nothing_And_Fresh_Logs_Have_Nulls()
    {
        var (admin, paidId, _, _) = await SubscribeAsync("order.paid");
        using var writer = await api.As("writer");
        var key = Guid.NewGuid().ToString();

        var created = await writer.PostOrderAsync(key, ("prd_04", 1));
        await writer.PostOrderAsync(key, ("prd_04", 1));
        var orderId = (await created.JsonAsync()).GetProperty("id").GetString();
        await writer.PostAsync($"/v1/orders/{orderId}/pay", null);
        await writer.PostAsync($"/v1/orders/{orderId}/pay", null);
        var deliveries = await DeliveriesAsync(admin, paidId, d => d.GetArrayLength() > 0);
        await Task.Delay(150);
        deliveries = await DeliveriesAsync(admin, paidId, _ => true);

        Assert.Equal(1, deliveries.GetArrayLength());
        Assert.Equal("order.paid", deliveries[0].GetProperty("eventType").GetString());
        var fresh = await (await admin.GetAsync($"/v1/webhooks/{paidId}/deliveries")).JsonAsync();
        Assert.True(fresh.GetProperty("data")[0].TryGetProperty("lastError", out _), "nullable fields are present");
    }

    [Fact]
    public async Task Test_26_Unknown_Subscription_And_Non_Admin_Are_Refused()
    {
        using var admin = await api.As("admin");
        using var writer = await api.As("writer");

        var unknown = await admin.GetAsync("/v1/webhooks/whk_000000000000/deliveries");
        var forbidden = await writer.GetAsync("/v1/webhooks");

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }
}

public sealed class ErrorTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task Test_27_Every_Error_Is_Problem_Json_With_Request_Id_And_Instance_Without_Query()
    {
        using var reader = await api.As("reader");

        var response = await reader.GetAsync("/v1/products?limit=0&secret=1");
        var problem = await response.JsonAsync();

        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("/problems/validation-error", problem.GetProperty("type").GetString());
        Assert.Equal("Your request is not valid", problem.GetProperty("title").GetString());
        Assert.Equal(400, problem.GetProperty("status").GetInt32());
        Assert.Equal("/v1/products", problem.GetProperty("instance").GetString());
        Assert.Equal(response.Headers.GetValues("X-Request-Id").Single(), problem.GetProperty("requestId").GetString());
        Assert.Equal("must be between 1 and 50", problem.GetProperty("errors")[0].GetProperty("message").GetString());
    }

    [Fact]
    public async Task Test_27_Unhandled_Exception_Is_A_Safe_500_Without_Leaking_Details()
    {
        using var admin = await api.As("admin");

        var response = await admin.GetAsync("/v1/demo/crash");
        var text = await response.Content.ReadAsStringAsync();
        var problem = JsonDocument.Parse(text).RootElement;

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("internal-error", await response.ProblemSlugAsync());
        Assert.Equal("An unexpected error occurred.", problem.GetProperty("detail").GetString());
        Assert.False(problem.TryGetProperty("errors", out _));
        Assert.DoesNotContain("Deliberate", text);
        Assert.DoesNotContain("InvalidOperationException", text);
        Assert.Equal("no-store", response.Headers.GetValues("Cache-Control").Single());
    }

    [Fact]
    public async Task Test_27_Flaky_Endpoint_Fails_On_Purpose_Then_Recovers_And_Counts_Per_Key()
    {
        using var admin = await api.As("admin");
        var key = Guid.NewGuid().ToString("N")[..12];

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await admin.GetAsync($"/v1/demo/flaky?key={key}&failTimes=2")).StatusCode);
        }

        var failed = await admin.GetAsync($"/v1/demo/flaky?key={key}-x&failTimes=1");
        var bad = await admin.GetAsync("/v1/demo/flaky?key=&failTimes=99");

        Assert.Equal([HttpStatusCode.ServiceUnavailable, HttpStatusCode.ServiceUnavailable, HttpStatusCode.OK], statuses);
        Assert.Equal("service-unavailable", await failed.ProblemSlugAsync());
        Assert.False(failed.Headers.Contains("Retry-After"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Test_27_Sales_Report_Sums_Only_Paid_Orders()
    {
        using var admin = await api.As("admin");
        using var writer = await api.As("writer");
        var before = await (await admin.GetAsync("/v1/reports/sales?delayMs=0")).JsonAsync();

        var order = await (await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_01", 1))).JsonAsync();
        var pending = await (await admin.GetAsync("/v1/reports/sales?delayMs=0")).JsonAsync();
        await writer.PostAsync($"/v1/orders/{order.GetProperty("id").GetString()}/pay", null);
        var paid = await (await admin.GetAsync("/v1/reports/sales?delayMs=0")).JsonAsync();
        var bad = await admin.GetAsync("/v1/reports/sales?delayMs=20000");

        Assert.Equal(before.GetProperty("orderCount").GetInt32() + 1, pending.GetProperty("orderCount").GetInt32());
        Assert.Equal(before.GetProperty("revenueCents").GetInt64(), pending.GetProperty("revenueCents").GetInt64());
        Assert.Equal(before.GetProperty("revenueCents").GetInt64() + 3499, paid.GetProperty("revenueCents").GetInt64());
        Assert.Equal("validation-error", await bad.ProblemSlugAsync());
    }
}

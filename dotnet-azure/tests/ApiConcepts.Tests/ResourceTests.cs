// Concepts 16-19: REST, GraphQL, pagination and caching.
using System.Net;
using System.Text.Json;
using ApiConcepts.Tests.Support;

namespace ApiConcepts.Tests;

public sealed class ResourceTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task Test_16_Created_Resource_Is_Reachable_Through_Location()
    {
        using var admin = await api.As("admin");

        var response = await admin.PostAsync("/v1/products", Http.Json(new { title = "Rest", author = "Roy", priceCents = 100 }));
        var fetched = await admin.GetAsync(response.Headers.Location);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        Assert.Equal("Rest", (await fetched.JsonAsync()).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Test_16_Link_Header_Points_At_The_Next_Page()
    {
        using var reader = await api.As("reader");

        var first = await reader.GetAsync("/v1/products?limit=3&tag=design");
        var link = first.Headers.GetValues("Link").Single();
        var target = link[(link.IndexOf('<') + 1)..link.IndexOf('>')];
        var second = await (await reader.GetAsync(target)).JsonAsync();

        Assert.EndsWith("rel=\"next\"", link);
        Assert.Contains("tag=design", target);
        Assert.Equal("prd_13", second.GetProperty("data")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Test_17_GraphQL_Nested_Order_To_Product_Query_With_Plain_Ids()
    {
        using var writer = await api.As("writer");
        var order = await (await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_06", 2))).JsonAsync();
        var orderId = order.GetProperty("id").GetString();

        var response = await GraphQl(writer, $$"""{ order(id: "{{orderId}}") { id status totalCents items { quantity unitPriceCents product { id title tags } } } }""");
        var data = (await response.JsonAsync()).GetProperty("data").GetProperty("order");

        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(orderId, data.GetProperty("id").GetString());
        Assert.Equal("pending", data.GetProperty("status").GetString());
        var item = data.GetProperty("items")[0];
        Assert.Equal(2, item.GetProperty("quantity").GetInt32());
        Assert.Equal("prd_06", item.GetProperty("product").GetProperty("id").GetString());
        Assert.Equal("The GraphQL Field Guide", item.GetProperty("product").GetProperty("title").GetString());
    }

    [Fact]
    public async Task Test_17_GraphQL_Products_Connection_Pages_With_End_Cursor()
    {
        using var reader = await api.As("reader");

        var first = (await (await GraphQl(reader, "{ products(first: 3) { nodes { id } pageInfo { endCursor hasNextPage } } }")).JsonAsync())
            .GetProperty("data").GetProperty("products");
        var cursor = first.GetProperty("pageInfo").GetProperty("endCursor").GetString();
        var second = (await (await GraphQl(reader, $$"""{ products(first: 3, after: "{{cursor}}") { nodes { id } } }""")).JsonAsync())
            .GetProperty("data").GetProperty("products");

        Assert.Equal(["prd_01", "prd_02", "prd_03"], first.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()));
        Assert.True(first.GetProperty("pageInfo").GetProperty("hasNextPage").GetBoolean());
        Assert.Equal(["prd_04", "prd_05", "prd_06"], second.GetProperty("nodes").EnumerateArray().Select(n => n.GetProperty("id").GetString()));
    }

    [Fact]
    public async Task Test_17_GraphQL_Order_Without_Scope_Is_FORBIDDEN_And_Bad_First_Is_BAD_USER_INPUT()
    {
        using var free = await api.As("free");

        var forbidden = await (await GraphQl(free, """{ order(id: "ord_x") { id } }""")).JsonAsync();
        var bad = await (await GraphQl(free, "{ products(first: 99) { nodes { id } } }")).JsonAsync();

        Assert.Equal("FORBIDDEN", forbidden.GetProperty("errors")[0].GetProperty("extensions").GetProperty("code").GetString());
        Assert.Equal(JsonValueKind.Null, forbidden.GetProperty("data").GetProperty("order").ValueKind);
        Assert.Equal("BAD_USER_INPUT", bad.GetProperty("errors")[0].GetProperty("extensions").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Test_17_GraphQL_Needs_A_Token_With_Products_Read()
    {
        using var anon = api.CreateClient();
        var body = Http.Json(new { query = "{ __typename }" });

        var noToken = await anon.PostAsync("/graphql", body);

        Assert.Equal(HttpStatusCode.Unauthorized, noToken.StatusCode);
        Assert.Equal("unauthorized", await noToken.ProblemSlugAsync());
    }

    [Fact]
    public async Task Test_17_GraphQL_Hides_Another_Clients_Order()
    {
        using var writer = await api.As("writer");
        using var partner = await api.As("partner");
        var order = await (await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_01", 1))).JsonAsync();

        var seen = await (await GraphQl(partner, $$"""{ order(id: "{{order.GetProperty("id").GetString()}}") { id } }""")).JsonAsync();

        Assert.Equal(JsonValueKind.Null, seen.GetProperty("data").GetProperty("order").ValueKind);
    }

    // HttpClient re-serialises Cache-Control (max-age first), so compare the parsed directives.
    private static void AssertPrivateMaxAge(int seconds, HttpResponseMessage response)
    {
        Assert.True(response.Headers.CacheControl!.Private);
        Assert.Equal(TimeSpan.FromSeconds(seconds), response.Headers.CacheControl.MaxAge);
    }

    private static Task<HttpResponseMessage> GraphQl(HttpClient http, string query) =>
        http.SendAsync(Http.Request(HttpMethod.Post, "/graphql", Http.Json(new { query }), ("Accept", "application/json")));

    [Fact]
    public async Task Test_18_Cursor_Pagination_Walks_All_25_Seeds_In_Order()
    {
        using var reader = await api.As("reader");
        var ids = new List<string>();
        string? url = "/v1/products?limit=10";
        var pages = 0;

        while (url is not null)
        {
            var response = await reader.GetAsync(url);
            var body = await response.JsonAsync();
            ids.AddRange(body.GetProperty("data").EnumerateArray().Select(p => p.GetProperty("id").GetString()!));
            var page = body.GetProperty("page");
            pages++;
            var cursor = page.GetProperty("nextCursor");
            Assert.Equal(page.GetProperty("hasMore").GetBoolean(), cursor.ValueKind == JsonValueKind.String);
            Assert.Equal(page.GetProperty("hasMore").GetBoolean(), response.Headers.Contains("Link"));
            url = cursor.ValueKind == JsonValueKind.String ? $"/v1/products?limit=10&cursor={Uri.EscapeDataString(cursor.GetString()!)}" : null;
        }

        Assert.Equal(3, pages);
        Assert.Equal(Enumerable.Range(1, 25).Select(n => $"prd_{n:00}"), ids);
    }

    [Fact]
    public async Task Test_18_Bad_Cursor_And_Bad_Limit_Are_400_Problems()
    {
        using var reader = await api.As("reader");

        var cursor = await reader.GetAsync("/v1/products?cursor=%21%21%21");
        var limit = await reader.GetAsync("/v1/products?limit=51");

        Assert.Equal("invalid-cursor", await cursor.ProblemSlugAsync());
        var problem = await limit.JsonAsync();
        Assert.Equal("validation-error", await limit.ProblemSlugAsync());
        Assert.Equal("limit", problem.GetProperty("errors")[0].GetProperty("field").GetString());
        Assert.Equal("limit must be between 1 and 50", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Test_19_Etag_And_If_None_Match_Give_304_With_No_Body()
    {
        using var reader = await api.As("reader");
        var first = await reader.GetAsync("/v1/products/prd_03");

        var again = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products/prd_03", null, ("If-None-Match", first.Headers.ETag!.ToString())));
        var star = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products/prd_03", null, ("If-None-Match", "*")));

        Assert.Equal("\"prd_03-v1\"", first.Headers.ETag!.ToString());
        AssertPrivateMaxAge(60, first);
        Assert.Equal(HttpStatusCode.NotModified, again.StatusCode);
        Assert.Empty(await again.Content.ReadAsByteArrayAsync());
        Assert.Equal("\"prd_03-v1\"", again.Headers.ETag!.ToString());
        AssertPrivateMaxAge(60, again);
        Assert.Equal(HttpStatusCode.NotModified, star.StatusCode);
    }

    [Fact]
    public async Task Test_19_List_Has_A_Weak_Etag_And_Revalidates()
    {
        using var reader = await api.As("reader");
        var first = await reader.GetAsync("/v1/products?limit=3");

        var again = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products?limit=3", null, ("If-None-Match", first.Headers.ETag!.ToString())));
        var other = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products?limit=4", null, ("If-None-Match", first.Headers.ETag!.ToString())));

        Assert.True(first.Headers.ETag!.IsWeak);
        AssertPrivateMaxAge(30, first);
        Assert.Equal(HttpStatusCode.NotModified, again.StatusCode);
        Assert.Equal(HttpStatusCode.OK, other.StatusCode);
    }

    [Fact]
    public async Task Test_19_If_Match_Mismatch_Is_412_And_A_Match_Bumps_The_Version()
    {
        using var admin = await api.As("admin");
        var created = await admin.CreateProductAsync("Cached");
        var url = $"/v1/products/{created.GetProperty("id").GetString()}";

        var stale = await admin.SendAsync(Http.Request(HttpMethod.Patch, url, Http.Json(new { title = "Nope" }), ("If-Match", "\"stale\"")));
        var fresh = await admin.SendAsync(Http.Request(HttpMethod.Patch, url, Http.Json(new { title = "Yes" }), ("If-Match", "\"" + created.GetProperty("id").GetString() + "-v1\"")));
        var staleDelete = await admin.SendAsync(Http.Request(HttpMethod.Delete, url, null, ("If-Match", "\"" + created.GetProperty("id").GetString() + "-v1\"")));

        Assert.Equal(HttpStatusCode.PreconditionFailed, stale.StatusCode);
        Assert.Equal("precondition-failed", await stale.ProblemSlugAsync());
        Assert.Equal(HttpStatusCode.OK, fresh.StatusCode);
        Assert.EndsWith("-v2\"", fresh.Headers.ETag!.ToString());
        Assert.Equal(HttpStatusCode.PreconditionFailed, staleDelete.StatusCode);
    }
}

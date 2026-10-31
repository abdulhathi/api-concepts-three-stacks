// Concepts 1-9: requests and responses, endpoints, methods, headers, parameters, bodies, JSON, schemas, status codes.
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using ApiConcepts.Tests.Support;

namespace ApiConcepts.Tests;

public sealed partial class HttpBasicsTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")]
    private static partial Regex Rfc3339Millis();

    [Fact]
    public async Task Test_01_Echo_Returns_Request_And_Masks_Authorization()
    {
        using var http = await api.As("reader");

        var response = await http.PostAsync("/v1/echo?a=1&a=2&b=x", Http.Json(new { hello = "world" }));
        var body = await response.JsonAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("POST", body.GetProperty("method").GetString());
        Assert.Equal("/v1/echo", body.GetProperty("path").GetString());
        Assert.Equal("1", body.GetProperty("query").GetProperty("a").GetString());
        Assert.Equal("Bearer ***", body.GetProperty("headers").GetProperty("authorization").GetString());
        Assert.Equal("world", body.GetProperty("body").GetProperty("hello").GetString());
    }

    [Fact]
    public async Task Test_01_Request_Log_Line_Is_Structured_And_Has_No_Secrets()
    {
        using var http = await api.As("reader");
        var id = Guid.NewGuid().ToString();
        await http.SendAsync(Http.Request(HttpMethod.Get, "/v1/me", null, ("X-Request-Id", id)));

        var line = api.Log.Lines.Select(l => JsonDocument.Parse(l).RootElement).Last(l => l.GetProperty("requestId").GetString() == id);

        Assert.Equal("GET", line.GetProperty("method").GetString());
        Assert.Equal("/v1/me", line.GetProperty("path").GetString());
        Assert.Equal(200, line.GetProperty("status").GetInt32());
        Assert.Equal("reader", line.GetProperty("clientId").GetString());
        Assert.True(line.TryGetProperty("durationMs", out _));
        Assert.DoesNotContain("eyJ", line.ToString());
    }

    [Fact]
    public async Task Test_02_Root_Health_And_Unknown_Routes()
    {
        using var http = api.CreateClient();

        var root = await (await http.GetAsync("/")).JsonAsync();
        var health = await http.GetAsync("/health");
        var unknown = await http.GetAsync("/v1/does-not-exist");

        Assert.Equal("Bookshop API", root.GetProperty("name").GetString());
        Assert.Equal("/docs", root.GetProperty("docs").GetString());
        Assert.Equal("ok", (await health.JsonAsync()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("not-found", await unknown.ProblemSlugAsync());
    }

    [Fact]
    public async Task Test_03_Methods_Create_Replace_Patch_Delete_A_Product()
    {
        using var admin = await api.As("admin");
        var created = await admin.CreateProductAsync("Methods");
        var url = $"/v1/products/{created.GetProperty("id").GetString()}";

        var replaced = await admin.PutAsync(url, Http.Json(new { title = "Replaced", author = "A", priceCents = 1, tags = new[] { "x" } }));
        var partialPut = await admin.PutAsync(url, Http.Json(new { title = "Only title" }));
        var patched = await admin.PatchAsync(url, Http.Json(new { priceCents = 2 }, "application/merge-patch+json"));
        var deleted = await admin.DeleteAsync(url);
        var gone = await admin.GetAsync(url);

        Assert.Equal("Replaced", (await replaced.JsonAsync()).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, partialPut.StatusCode);
        var patchedBody = await patched.JsonAsync();
        Assert.Equal(2, patchedBody.GetProperty("priceCents").GetInt32());
        Assert.Equal("Replaced", patchedBody.GetProperty("title").GetString());
        Assert.Equal(3, patchedBody.GetProperty("version").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task Test_04_Request_Id_Is_Echoed_Or_Generated_On_Every_Response()
    {
        using var http = api.CreateClient();

        var echoed = await http.SendAsync(Http.Request(HttpMethod.Get, "/health", null, ("X-Request-Id", "abc.123_-X")));
        var replaced = await http.SendAsync(Http.Request(HttpMethod.Get, "/health", null, ("X-Request-Id", "bad id!")));
        var onError = await http.GetAsync("/v1/nope");

        Assert.Equal("abc.123_-X", echoed.Headers.GetValues("X-Request-Id").Single());
        Assert.True(Guid.TryParse(replaced.Headers.GetValues("X-Request-Id").Single(), out _));
        Assert.True(onError.Headers.Contains("X-Request-Id"));
    }

    [Fact]
    public async Task Test_04_Wrong_Content_Type_Is_415_And_Merge_Patch_Is_Accepted()
    {
        using var admin = await api.As("admin");
        var created = await admin.CreateProductAsync("Headers");
        var url = $"/v1/products/{created.GetProperty("id").GetString()}";

        var wrong = await admin.PostAsync("/v1/products", new StringContent("{}", System.Text.Encoding.UTF8, "text/plain"));
        var charset = await admin.PostAsync("/v1/products", new StringContent(
            """{"title":"T","author":"A","priceCents":1}""", System.Text.Encoding.UTF8, "application/json"));
        var mergePatch = await admin.PatchAsync(url, Http.Json(new { title = "New" }, "application/merge-patch+json"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, wrong.StatusCode);
        Assert.Equal("unsupported-media-type", await wrong.ProblemSlugAsync());
        Assert.Equal(HttpStatusCode.Created, charset.StatusCode);
        Assert.StartsWith("/v1/products/prd_", charset.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.OK, mergePatch.StatusCode);
    }

    [Fact]
    public async Task Test_04_Security_Headers_Are_On_Every_Response()
    {
        using var http = api.CreateClient();

        var response = await http.GetAsync("/health");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task Test_05_Path_And_Query_Parameters_Select_And_Filter()
    {
        using var http = await api.As("reader");

        var one = await (await http.GetAsync("/v1/products/prd_05")).JsonAsync();
        var tagged = await (await http.GetAsync("/v1/products?tag=oauth")).JsonAsync();
        var missing = await http.GetAsync("/v1/products/prd_99");

        Assert.Equal("OAuth Without Tears", one.GetProperty("title").GetString());
        Assert.Equal(["prd_05"], tagged.GetProperty("data").EnumerateArray().Select(p => p.GetProperty("id").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Test_06_Body_Validation_Reports_Every_Bad_Field()
    {
        using var admin = await api.As("admin");

        var response = await admin.PostAsync("/v1/products", Http.Json(new { title = "  ", author = 5, priceCents = -1, tags = new[] { "OK", "ok" } }));
        var problem = await response.JsonAsync();
        var fields = problem.GetProperty("errors").EnumerateArray().Select(e => e.GetProperty("field").GetString()).ToList();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation-error", await response.ProblemSlugAsync());
        Assert.Equal(["title", "author", "priceCents", "tags"], fields);
    }

    [Fact]
    public async Task Test_06_Body_Is_Trimmed_Unknown_Properties_Ignored_And_Bad_Json_Is_400()
    {
        using var admin = await api.As("admin");

        var ok = await admin.PostAsync("/v1/products", Http.Json(new { title = "  Padded  ", author = "A", priceCents = 5, surprise = true }));
        var malformed = await admin.PostAsync("/v1/products", new StringContent("{nope", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal("Padded", (await ok.JsonAsync()).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        Assert.Equal("malformed-json", await malformed.ProblemSlugAsync());
    }

    [Fact]
    public async Task Test_07_Json_Is_CamelCase_With_Integer_Cents_And_Millisecond_Utc_Timestamps()
    {
        using var http = await api.As("reader");

        var product = await (await http.GetAsync("/v1/products/prd_01")).JsonAsync();
        var me = await (await http.GetAsync("/v1/me")).JsonAsync();

        Assert.Equal(JsonValueKind.Number, product.GetProperty("priceCents").ValueKind);
        Assert.Equal("USD", product.GetProperty("currency").GetString());
        Assert.Equal("2026-01-01T00:00:00.000Z", product.GetProperty("createdAt").GetString());
        Assert.Matches(Rfc3339Millis(), me.GetProperty("tokenExpiresAt").GetString()!);
        Assert.All(product.EnumerateObject(), p => Assert.True(char.IsLower(p.Name[0])));
    }

    [Fact]
    public async Task Test_08_OpenApi_Document_And_Docs_Ui_Are_Served()
    {
        using var http = api.CreateClient();

        var spec = await (await http.GetAsync("/openapi.json")).JsonAsync();
        var docs = await http.GetAsync("/docs");

        Assert.StartsWith("3.", spec.GetProperty("openapi").GetString());
        Assert.True(spec.GetProperty("paths").TryGetProperty("/v1/products", out _));
        Assert.True(spec.GetProperty("paths").TryGetProperty("/oauth/token", out _));
        Assert.Equal(HttpStatusCode.OK, docs.StatusCode);
        Assert.Equal("text/html", docs.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Test_09_Status_Codes_Cover_The_Contract()
    {
        var seen = new HashSet<int>();
        void Note(HttpResponseMessage r) => seen.Add((int)r.StatusCode);

        using var anon = api.CreateClient();
        using var admin = await api.As("admin");
        using var reader = await api.As("reader");
        using var free = await api.As("free");
        using var impatient = await ApiFixture.As(api.WithSettings(("REQUEST_TIMEOUT_MS", "100")), "admin");

        Note(await anon.GetAsync("/health"));                                              // 200
        var product = await admin.CreateProductAsync("Codes");
        seen.Add(201);
        var url = $"/v1/products/{product.GetProperty("id").GetString()}";
        Note(await admin.DeleteAsync(url));                                                // 204
        var etagged = await admin.GetAsync("/v1/products/prd_01");
        Note(await admin.SendAsync(Http.Request(HttpMethod.Get, "/v1/products/prd_01", null, ("If-None-Match", etagged.Headers.ETag!.ToString())))); // 304
        Note(await admin.GetAsync("/v1/products?limit=0"));                                // 400
        Note(await anon.GetAsync("/v1/me"));                                               // 401
        Note(await reader.PostAsync("/v1/products", Http.Json(new { })));                  // 403
        Note(await admin.GetAsync("/v1/products/nope"));                                   // 404
        Note(await admin.SendAsync(Http.Request(HttpMethod.Patch, "/v1/products/prd_02", Http.Json(new { title = "x" }), ("If-Match", "\"stale\""))));  // 412
        Note(await admin.PostAsync("/v1/products", new StringContent("x", System.Text.Encoding.UTF8, "text/plain"))); // 415
        Note(await admin.PostOrderAsync("codes-422", ("prd_nope", 1)));                    // 422
        for (var i = 0; i < 6; i++)
        {
            Note(await free.GetAsync("/v1/products"));                                     // 429
        }

        Note(await admin.GetAsync("/v1/demo/crash"));                                      // 500
        Note(await admin.GetAsync("/v1/demo/flaky?key=codes&failTimes=1"));                // 503
        Note(await impatient.GetAsync("/v1/reports/sales?delayMs=1000"));                  // 504

        foreach (var expected in new[] { 200, 201, 204, 304, 400, 401, 403, 404, 412, 415, 422, 429, 500, 503, 504 })
        {
            Assert.Contains(expected, seen);
        }
    }
}

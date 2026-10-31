// Concepts 10-15: authentication, authorization, JWT, OAuth 2.0, HTTPS and CORS.
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ApiConcepts.Tests.Support;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ApiConcepts.Tests;

public sealed class SecurityTests(ApiFixture api) : IClassFixture<ApiFixture>
{
    private const string DevSecret = "dev-only-secret-change-me-0123456789abcdef";

    [Fact]
    public async Task Test_10_Missing_Token_Is_401_With_Bearer_Challenge()
    {
        using var http = api.CreateClient();

        var response = await http.GetAsync("/v1/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", await response.ProblemSlugAsync());
        Assert.Equal("Bearer realm=\"api-concepts\"", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task Test_10_Bad_Token_Is_401_With_Invalid_Token_Error()
    {
        using var http = api.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not.a.jwt");

        var response = await http.GetAsync("/v1/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("error=\"invalid_token\"", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task Test_11_Missing_Scope_Is_403_And_Names_The_Needed_Scope()
    {
        using var reader = await api.As("reader");

        var response = await reader.PostAsync("/v1/products", Http.Json(new { title = "x", author = "y", priceCents = 1 }));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("forbidden", await response.ProblemSlugAsync());
        Assert.Equal(
            "Bearer realm=\"api-concepts\", error=\"insufficient_scope\", scope=\"products:write\"",
            response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task Test_11_Another_Clients_Order_Is_404_Unless_Admin()
    {
        using var writer = await api.As("writer");
        using var partner = await api.As("partner");
        using var admin = await api.As("admin");
        var created = await writer.PostOrderAsync(Guid.NewGuid().ToString(), ("prd_01", 1));
        var id = (await created.JsonAsync()).GetProperty("id").GetString();

        var asOwner = await writer.GetAsync($"/v1/orders/{id}");
        var asOther = await partner.GetAsync($"/v1/orders/{id}");
        var payOther = await partner.PostAsync($"/v1/orders/{id}/pay", null);
        var asAdmin = await admin.GetAsync($"/v1/orders/{id}");
        var otherList = await (await partner.GetAsync("/v1/orders")).JsonAsync();

        Assert.Equal(HttpStatusCode.OK, asOwner.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, asOther.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, payOther.StatusCode);
        Assert.Equal(HttpStatusCode.OK, asAdmin.StatusCode);
        Assert.DoesNotContain(otherList.GetProperty("data").EnumerateArray(), o => o.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Test_12_Jwt_Has_The_Contracted_Header_And_Claims()
    {
        var token = new JsonWebTokenHandler().ReadJsonWebToken(await api.TokenAsync("writer"));

        Assert.Equal("HS256", token.Alg);
        Assert.Equal("JWT", token.Typ);
        Assert.Equal("api-concepts", token.Issuer);
        Assert.Equal("api-concepts-clients", token.Audiences.Single());
        Assert.Equal("writer", token.Subject);
        Assert.Equal("products:read products:write orders:read orders:write", token.GetClaim("scope").Value);
        Assert.True(Guid.TryParse(token.Id, out _));
        Assert.Equal(900, (token.ValidTo - token.IssuedAt).TotalSeconds);
    }

    [Fact]
    public async Task Test_12_Expired_Tampered_And_Foreign_Algorithm_Tokens_Are_Rejected()
    {
        var good = await api.TokenAsync("reader");
        var tampered = good[..^3] + (good[^3] == 'A' ? "BBB" : "AAA");
        var expired = Sign(SecurityAlgorithms.HmacSha256, DevSecret, issuedAgo: TimeSpan.FromMinutes(10), lifetime: TimeSpan.FromMinutes(5));
        var hs512 = Sign(SecurityAlgorithms.HmacSha512, DevSecret + DevSecret, issuedAgo: TimeSpan.Zero, lifetime: TimeSpan.FromMinutes(5));
        var fresh = Sign(SecurityAlgorithms.HmacSha256, DevSecret, issuedAgo: TimeSpan.Zero, lifetime: TimeSpan.FromMinutes(5));

        Assert.Equal(HttpStatusCode.OK, await StatusWith(good));
        Assert.Equal(HttpStatusCode.OK, await StatusWith(fresh));
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWith(tampered));
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWith(expired));
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWith(hs512));

        async Task<HttpStatusCode> StatusWith(string token)
        {
            using var http = api.CreateClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return (await http.GetAsync("/v1/me")).StatusCode;
        }
    }

    private static string Sign(string algorithm, string secret, TimeSpan issuedAgo, TimeSpan lifetime)
    {
        var now = DateTime.UtcNow - issuedAgo;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "api-concepts",
            Audience = "api-concepts-clients",
            IssuedAt = now,
            NotBefore = now,
            Expires = now + lifetime,
            Claims = new Dictionary<string, object> { ["sub"] = "reader", ["scope"] = "products:read" },
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), algorithm),
        });
    }

    [Fact]
    public async Task Test_13_Client_Credentials_Work_With_Basic_Or_Form_And_Narrow_Scope()
    {
        using var http = api.CreateClient();
        var basic = Http.Request(HttpMethod.Post, "/oauth/token", new FormUrlEncodedContent([new("grant_type", "client_credentials"), new("scope", "products:read")]));
        basic.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("admin:admin-secret")));

        var viaBasic = await http.SendAsync(basic);
        var granted = await viaBasic.JsonAsync();
        var viaForm = await http.PostAsync("/oauth/token", new FormUrlEncodedContent(
            [new("grant_type", "client_credentials"), new("client_id", "reader"), new("client_secret", "reader-secret")]));

        Assert.Equal(HttpStatusCode.OK, viaBasic.StatusCode);
        Assert.Equal("Bearer", granted.GetProperty("token_type").GetString());
        Assert.Equal(900, granted.GetProperty("expires_in").GetInt32());
        Assert.Equal("products:read", granted.GetProperty("scope").GetString());
        Assert.Equal("no-store", viaBasic.Headers.CacheControl?.ToString());
        Assert.Equal("products:read orders:read", (await viaForm.JsonAsync()).GetProperty("scope").GetString());
    }

    [Fact]
    public async Task Test_13_Token_Endpoint_Errors_Follow_Rfc_6749()
    {
        using var http = api.CreateClient();
        Task<HttpResponseMessage> Post(params (string, string)[] fields) =>
            http.PostAsync("/oauth/token", new FormUrlEncodedContent(fields.Select(f => new KeyValuePair<string, string>(f.Item1, f.Item2))));

        var badSecret = await Post(("grant_type", "client_credentials"), ("client_id", "reader"), ("client_secret", "nope"));
        var badGrant = await Post(("grant_type", "password"), ("client_id", "reader"), ("client_secret", "reader-secret"));
        var badScope = await Post(("grant_type", "client_credentials"), ("client_id", "reader"), ("client_secret", "reader-secret"), ("scope", "admin"));
        var noGrant = await Post(("client_id", "reader"), ("client_secret", "reader-secret"));

        Assert.Equal(HttpStatusCode.Unauthorized, badSecret.StatusCode);
        Assert.Equal("invalid_client", (await badSecret.JsonAsync()).GetProperty("error").GetString());
        Assert.Equal("Basic realm=\"api-concepts\"", badSecret.Headers.WwwAuthenticate.ToString());
        Assert.Equal("unsupported_grant_type", (await badGrant.JsonAsync()).GetProperty("error").GetString());
        Assert.Equal("invalid_scope", (await badScope.JsonAsync()).GetProperty("error").GetString());
        Assert.Equal("invalid_request", (await noGrant.JsonAsync()).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, noGrant.StatusCode);
    }

    [Fact]
    public async Task Test_14_Hsts_Is_Sent_Only_When_The_Request_Arrived_Over_Https()
    {
        using var http = api.CreateClient();

        var plain = await http.GetAsync("/health");
        var forwarded = await http.SendAsync(Http.Request(HttpMethod.Get, "/health", null, ("X-Forwarded-Proto", "https")));
        var forwardedHttp = await http.SendAsync(Http.Request(HttpMethod.Get, "/health", null, ("X-Forwarded-Proto", "http")));

        Assert.False(plain.Headers.Contains("Strict-Transport-Security"));
        Assert.False(forwardedHttp.Headers.Contains("Strict-Transport-Security"));
        Assert.Equal("max-age=31536000; includeSubDomains", forwarded.Headers.GetValues("Strict-Transport-Security").Single());
    }

    [Fact]
    public async Task Test_15_Cors_Preflight_From_An_Allowed_Origin_Is_Answered_Without_Auth()
    {
        using var http = api.CreateClient();
        var request = Http.Request(HttpMethod.Options, "/v1/products", null,
            ("Origin", "http://localhost:5173"),
            ("Access-Control-Request-Method", "POST"),
            ("Access-Control-Request-Headers", "authorization,content-type,idempotency-key"));

        var response = await http.SendAsync(request);

        Assert.True(response.StatusCode is HttpStatusCode.NoContent or HttpStatusCode.OK);
        Assert.Equal("http://localhost:5173", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("600", response.Headers.GetValues("Access-Control-Max-Age").Single());
        var methods = response.Headers.GetValues("Access-Control-Allow-Methods").Single();
        foreach (var method in new[] { "GET", "POST", "PUT", "PATCH", "DELETE" })
        {
            Assert.Contains(method, methods);
        }

        var headers = response.Headers.GetValues("Access-Control-Allow-Headers").Single();
        foreach (var header in new[] { "Authorization", "Content-Type", "Idempotency-Key", "If-Match", "If-None-Match", "X-Request-Id" })
        {
            Assert.Contains(header, headers);
        }

        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task Test_15_Cors_Actual_Request_Exposes_Headers_And_Other_Origins_Get_Nothing()
    {
        using var reader = await api.As("reader");

        var allowed = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products", null, ("Origin", "http://localhost:5173")));
        var denied = await reader.SendAsync(Http.Request(HttpMethod.Get, "/v1/products", null, ("Origin", "https://evil.example")));

        Assert.Equal("http://localhost:5173", allowed.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Contains("Origin", allowed.Headers.Vary);
        var exposed = allowed.Headers.GetValues("Access-Control-Expose-Headers").Single();
        foreach (var header in new[] { "ETag", "Link", "Location", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "X-Request-Id", "Idempotent-Replayed" })
        {
            Assert.Contains(header, exposed);
        }

        Assert.False(denied.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(allowed.Headers.Contains("Access-Control-Allow-Credentials"));
    }
}

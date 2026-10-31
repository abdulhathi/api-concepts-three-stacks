// Concept 13 · OAuth 2.0: the client credentials grant (RFC 6749 section 4.4) with Basic or form client authentication.
using System.Text;
using ApiConcepts.Api.Endpoints;

namespace ApiConcepts.Api.Auth;

public static class OAuthEndpoints
{
    public static void MapOAuth(this IEndpointRouteBuilder app) =>
        app.MapPost("/oauth/token", IssueToken)
            .WithTags("OAuth")
            .WithSummary("Client credentials grant")
            .WithBody<TokenForm>("application/x-www-form-urlencoded")
            .Produces<TokenResponse>()
            .Produces<OAuthError>(400)
            .Produces<OAuthError>(401);

    // Documents the form fields in OpenAPI; the handler reads them from the request itself.
    public sealed record TokenForm(
        [property: System.Text.Json.Serialization.JsonPropertyName("grant_type")] string GrantType,
        string? Scope,
        [property: System.Text.Json.Serialization.JsonPropertyName("client_id")] string? ClientId,
        [property: System.Text.Json.Serialization.JsonPropertyName("client_secret")] string? ClientSecret);

    public sealed record TokenResponse(string AccessToken, string TokenType, int ExpiresIn, string Scope);

    public sealed record OAuthError(string Error, string ErrorDescription);

    private static async Task<IResult> IssueToken(HttpRequest request, DemoClients clients, TokenService tokens)
    {
        if (!request.HasFormContentType)
        {
            return Error(400, "invalid_request", "Send application/x-www-form-urlencoded.");
        }

        var form = await request.ReadFormAsync();
        var grantType = form["grant_type"].ToString();
        if (grantType.Length == 0)
        {
            return Error(400, "invalid_request", "grant_type is required.");
        }

        var (clientId, secret) = ReadCredentials(request, form);
        var client = clientId is null || secret is null ? null : clients.Find(clientId);
        if (client is null || !client.SecretMatches(secret!))
        {
            return Error(401, "invalid_client", "Client authentication failed.", "Basic realm=\"api-concepts\"");
        }

        if (grantType != "client_credentials")
        {
            return Error(400, "unsupported_grant_type", "Only client_credentials is supported.");
        }

        var requested = form["scope"].ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var granted = requested.Length == 0 ? client.Scopes : requested;
        if (granted.Any(scope => !client.Scopes.Contains(scope)))
        {
            return Error(400, "invalid_scope", "The client may not request that scope.");
        }

        var issued = tokens.Issue(client, granted);
        return Results.Json(new Dictionary<string, object>
        {
            ["access_token"] = issued.AccessToken,
            ["token_type"] = "Bearer",
            ["expires_in"] = issued.ExpiresIn,
            ["scope"] = issued.Scope,
        });
    }

    /// <summary>client_secret_basic wins over client_secret_post when both are present.</summary>
    private static (string? Id, string? Secret) ReadCredentials(HttpRequest request, IFormCollection form)
    {
        var header = request.Headers.Authorization.ToString();
        if (header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..].Trim()));
                var split = decoded.IndexOf(':');
                return split < 0
                    ? (null, null)
                    : (Uri.UnescapeDataString(decoded[..split]), Uri.UnescapeDataString(decoded[(split + 1)..]));
            }
            catch (FormatException)
            {
                return (null, null);
            }
        }

        return (form["client_id"].FirstOrDefault(), form["client_secret"].FirstOrDefault());
    }

    private static IResult Error(int status, string error, string description, string? challenge = null)
    {
        var body = Results.Json(
            new Dictionary<string, string> { ["error"] = error, ["error_description"] = description },
            statusCode: status);
        return challenge is null ? body : new ChallengeResult(body, challenge);
    }

    private sealed class ChallengeResult(IResult inner, string challenge) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.Headers.WWWAuthenticate = challenge;
            return inner.ExecuteAsync(httpContext);
        }
    }
}

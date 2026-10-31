// Concept 12 · Access tokens and JWT: HS256 tokens with iss, aud, sub, scope, iat, exp and jti.
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ApiConcepts.Api.Auth;

public sealed record IssuedToken(string AccessToken, int ExpiresIn, string Scope);

public sealed class TokenService(AppSettings settings, TimeProvider time)
{
    private readonly JsonWebTokenHandler _handler = new();

    public static SymmetricSecurityKey SigningKey(AppSettings settings) =>
        new(Encoding.UTF8.GetBytes(settings.JwtSecret));

    public IssuedToken Issue(DemoClient client, IReadOnlyList<string> scopes)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var scope = string.Join(' ', scopes);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = settings.JwtIssuer,
            Audience = settings.JwtAudience,
            IssuedAt = now,
            Expires = now + settings.TokenTtl,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = client.Id,
                ["scope"] = scope,
                ["jti"] = Guid.NewGuid().ToString(),
            },
            SigningCredentials = new SigningCredentials(SigningKey(settings), SecurityAlgorithms.HmacSha256),
        };
        return new IssuedToken(_handler.CreateToken(descriptor), (int)settings.TokenTtl.TotalSeconds, scope);
    }
}

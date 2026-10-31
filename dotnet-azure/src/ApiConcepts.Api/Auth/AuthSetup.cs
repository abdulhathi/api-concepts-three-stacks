// Concepts 10 and 11 · Authentication and authorization: JwtBearer validates the token, one policy per scope
// decides access, and both failures are rendered as problem+json with the right WWW-Authenticate challenge.
using ApiConcepts.Api.Common;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ApiConcepts.Api.Auth;

public static class AuthSetup
{
    public static readonly string[] Scopes =
        ["products:read", "products:write", "orders:read", "orders:write", ClaimsExtensions.AdminScope];

    private const string Realm = "api-concepts";

    public static IServiceCollection AddApiAuth(this IServiceCollection services)
    {
        services.AddSingleton<DemoClients>();
        services.AddSingleton<TokenService>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<AppSettings>(Configure);

        services.AddAuthorization(options =>
        {
            foreach (var scope in Scopes)
            {
                options.AddPolicy(scope, policy => policy
                    .RequireAuthenticatedUser()
                    .RequireAssertion(context => context.User.HasScope(scope)));
            }
        });
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, ProblemAuthorizationResultHandler>();
        return services;
    }

    private static void Configure(JwtBearerOptions options, AppSettings settings)
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            IssuerSigningKey = TokenService.SigningKey(settings),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidIssuer = settings.JwtIssuer,
            ValidAudience = settings.JwtAudience,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = "sub",
        };
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                var rejected = context.AuthenticateFailure is not null;
                var challenge = rejected
                    ? $"Bearer realm=\"{Realm}\", error=\"invalid_token\""
                    : $"Bearer realm=\"{Realm}\"";
                await ProblemWriter.WriteAsync(
                    context.HttpContext,
                    ProblemType.Unauthorized,
                    rejected ? "The access token is invalid or expired." : "A bearer access token is required.",
                    headers: new Dictionary<string, string> { ["WWW-Authenticate"] = challenge });
            },
        };
    }
}

public sealed class ProblemAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(
        RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        if (!result.Forbidden)
        {
            await _default.HandleAsync(next, context, policy, result);
            return;
        }

        // The endpoint's policy name is the scope it needs.
        var needed = context.GetEndpoint()?.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Select(data => data.Policy).LastOrDefault(name => name is not null);
        await ProblemWriter.WriteAsync(
            context,
            ProblemType.Forbidden,
            needed is null ? "The token lacks a required scope." : $"The token lacks the {needed} scope.",
            headers: new Dictionary<string, string>
            {
                ["WWW-Authenticate"] = $"Bearer realm=\"api-concepts\", error=\"insufficient_scope\", scope=\"{needed}\"",
            });
    }
}

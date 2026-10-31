using System.Security.Claims;

namespace ApiConcepts.Api.Auth;

public static class ClaimsExtensions
{
    public const string AdminScope = "admin";

    public static string ClientId(this ClaimsPrincipal user) => user.FindFirst("sub")?.Value ?? "";

    public static IReadOnlyList<string> Scopes(this ClaimsPrincipal user) =>
        user.FindFirst("scope")?.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];

    public static bool HasScope(this ClaimsPrincipal user, string scope) => user.Scopes().Contains(scope);

    public static bool IsAdmin(this ClaimsPrincipal user) => user.HasScope(AdminScope);
}

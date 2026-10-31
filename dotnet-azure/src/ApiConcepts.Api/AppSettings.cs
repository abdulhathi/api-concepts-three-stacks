namespace ApiConcepts.Api;

/// <summary>Environment-driven settings; the variable names are shared by all three stacks.</summary>
public sealed record AppSettings(
    string JwtSecret,
    string JwtIssuer,
    string JwtAudience,
    TimeSpan TokenTtl,
    IReadOnlyList<string> CorsOrigins,
    TimeSpan RequestTimeout,
    TimeSpan WebhookRetryBase,
    int WebhookMaxAttempts)
{
    public const string DefaultSecret = "dev-only-secret-change-me-0123456789abcdef";

    public static AppSettings From(IConfiguration config)
    {
        var secret = config["JWT_SECRET"] ?? DefaultSecret;
        if (System.Text.Encoding.UTF8.GetByteCount(secret) < 32)
        {
            throw new InvalidOperationException("JWT_SECRET must be at least 32 bytes for HS256.");
        }

        return new AppSettings(
            secret,
            config["JWT_ISSUER"] ?? "api-concepts",
            config["JWT_AUDIENCE"] ?? "api-concepts-clients",
            TimeSpan.FromSeconds(Number(config, "TOKEN_TTL_SECONDS", 900)),
            (config["CORS_ORIGINS"] ?? "http://localhost:5173")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            TimeSpan.FromMilliseconds(Number(config, "REQUEST_TIMEOUT_MS", 2000)),
            TimeSpan.FromMilliseconds(Number(config, "WEBHOOK_RETRY_BASE_MS", 500)),
            (int)Number(config, "WEBHOOK_MAX_ATTEMPTS", 5));
    }

    private static double Number(IConfiguration config, string key, double fallback) =>
        double.TryParse(config[key], System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
}

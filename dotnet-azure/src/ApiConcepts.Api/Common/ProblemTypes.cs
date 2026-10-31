// Concept 27 · Error handling: the closed list of RFC 9457 problem types this API can return.
namespace ApiConcepts.Api.Common;

public sealed record ProblemType(string Slug, int Status, string Title)
{
    public static readonly ProblemType ValidationError = new("validation-error", 400, "Your request is not valid");
    public static readonly ProblemType MalformedJson = new("malformed-json", 400, "The request body is not valid JSON");
    public static readonly ProblemType InvalidCursor = new("invalid-cursor", 400, "The pagination cursor is not valid");
    public static readonly ProblemType IdempotencyKeyRequired = new("idempotency-key-required", 400, "An Idempotency-Key header is required");
    public static readonly ProblemType Unauthorized = new("unauthorized", 401, "Authentication is required");
    public static readonly ProblemType Forbidden = new("forbidden", 403, "You do not have permission to do that");
    public static readonly ProblemType NotFound = new("not-found", 404, "Resource not found");
    public static readonly ProblemType MethodNotAllowed = new("method-not-allowed", 405, "Method not allowed");
    public static readonly ProblemType InvalidState = new("invalid-state", 409, "The resource is not in a valid state for this action");
    public static readonly ProblemType IdempotencyKeyInProgress = new("idempotency-key-in-progress", 409, "A request with this Idempotency-Key is still being processed");
    public static readonly ProblemType PreconditionFailed = new("precondition-failed", 412, "The resource has changed");
    public static readonly ProblemType UnsupportedMediaType = new("unsupported-media-type", 415, "Unsupported media type");
    public static readonly ProblemType UnknownProduct = new("unknown-product", 422, "An ordered product does not exist");
    public static readonly ProblemType IdempotencyKeyReused = new("idempotency-key-reused", 422, "The Idempotency-Key was already used with a different request");
    public static readonly ProblemType RateLimited = new("rate-limited", 429, "Too many requests");
    public static readonly ProblemType InternalError = new("internal-error", 500, "Internal server error");
    public static readonly ProblemType Throttled = new("throttled", 503, "The server is busy");
    public static readonly ProblemType ServiceUnavailable = new("service-unavailable", 503, "Service temporarily unavailable");
    public static readonly ProblemType Timeout = new("timeout", 504, "The request took too long");

    /// <summary>Fallback for bare status codes produced by the framework (for example a 405 from routing).</summary>
    public static ProblemType FromStatus(int status) => status switch
    {
        404 => NotFound,
        405 => MethodNotAllowed,
        415 => UnsupportedMediaType,
        500 => InternalError,
        504 => Timeout,
        _ => new ProblemType($"http-{status}", status, "Request failed"),
    };
}

public sealed record FieldIssue(string Field, string Message);

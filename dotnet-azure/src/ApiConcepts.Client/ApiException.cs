// Concept 27 · Error handling: callers get one typed exception that carries the RFC 9457 problem details.
namespace ApiConcepts.Client;

public sealed record ProblemInfo(
    string? Type,
    string? Title,
    int? Status,
    string? Detail,
    string? Instance,
    string? RequestId,
    IReadOnlyList<FieldIssue>? Errors);

public sealed record FieldIssue(string Field, string Message);

public sealed class ApiException(int statusCode, ProblemInfo? problem, string message, Exception? inner = null)
    : Exception(message, inner)
{
    /// <summary>The HTTP status, or 0 when no response arrived (network failure or timeout).</summary>
    public int StatusCode { get; } = statusCode;

    public ProblemInfo? Problem { get; } = problem;

    /// <summary>The problem slug, for example "rate-limited", or null when the server sent none.</summary>
    public string? ProblemSlug => Problem?.Type?.Split('/').LastOrDefault();
}

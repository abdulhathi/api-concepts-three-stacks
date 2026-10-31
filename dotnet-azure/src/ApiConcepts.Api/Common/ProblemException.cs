// Concept 27 · Error handling: expected failures are thrown as ProblemException and rendered in one place.
namespace ApiConcepts.Api.Common;

public sealed class ProblemException(
    ProblemType type,
    string? detail = null,
    IReadOnlyList<FieldIssue>? errors = null,
    IReadOnlyDictionary<string, string>? headers = null) : Exception(detail ?? type.Title)
{
    public ProblemType Type { get; } = type;
    public string? Detail { get; } = detail;
    public IReadOnlyList<FieldIssue>? Errors { get; } = errors;
    public IReadOnlyDictionary<string, string>? Headers { get; } = headers;

    public static ProblemException Validation(params FieldIssue[] errors) =>
        new(ProblemType.ValidationError, string.Join("; ", errors.Select(e => $"{e.Field} {e.Message}")), errors);

    public static ProblemException Validation(string field, string message) => Validation(new FieldIssue(field, message));

    public static ProblemException NotFound(string what) => new(ProblemType.NotFound, $"{what} was not found.");
}

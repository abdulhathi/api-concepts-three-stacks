// Concept 6 · Request bodies: validate JSON into typed fields, collecting every problem before failing.
using System.Text.Json;
using System.Text.RegularExpressions;
using ApiConcepts.Api.Common;

namespace ApiConcepts.Api.Endpoints;

public enum ProductInputMode { Create, Replace, Patch }

public sealed record ProductFields(string? Title, string? Author, int? PriceCents, IReadOnlyList<string>? Tags);

public static partial class ProductInput
{
    [GeneratedRegex("^[a-z0-9-]{1,30}$")]
    private static partial Regex TagPattern();

    public static ProductFields Parse(JsonElement? raw, ProductInputMode mode)
    {
        var body = JsonBody.RequireObject(raw);
        var errors = new List<FieldIssue>();

        var title = Text(body, "title", 200, mode != ProductInputMode.Patch, errors);
        var author = Text(body, "author", 100, mode != ProductInputMode.Patch, errors);
        var price = Price(body, mode != ProductInputMode.Patch, errors);
        var tags = Tags(body, mode == ProductInputMode.Replace, errors);

        if (errors.Count > 0)
        {
            throw ProblemException.Validation([.. errors]);
        }

        return new ProductFields(title, author, price, tags ?? (mode == ProductInputMode.Create ? [] : null));
    }

    private static string? Text(JsonElement body, string name, int max, bool required, List<FieldIssue> errors)
    {
        if (!body.TryGetProperty(name, out var value))
        {
            if (required)
            {
                errors.Add(new FieldIssue(name, "is required"));
            }

            return null;
        }

        var text = value.ValueKind == JsonValueKind.String ? value.GetString()!.Trim() : null;
        if (text is null)
        {
            errors.Add(new FieldIssue(name, "must be a string"));
        }
        else if (text.Length is 0 || text.Length > max)
        {
            errors.Add(new FieldIssue(name, $"must be between 1 and {max} characters"));
        }
        else
        {
            return text;
        }

        return null;
    }

    private static int? Price(JsonElement body, bool required, List<FieldIssue> errors)
    {
        if (!body.TryGetProperty("priceCents", out var value))
        {
            if (required)
            {
                errors.Add(new FieldIssue("priceCents", "is required"));
            }

            return null;
        }

        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var cents) || cents is < 0 or > 10_000_000)
        {
            errors.Add(new FieldIssue("priceCents", "must be an integer between 0 and 10000000"));
            return null;
        }

        return cents;
    }

    private static List<string>? Tags(JsonElement body, bool required, List<FieldIssue> errors)
    {
        if (!body.TryGetProperty("tags", out var value))
        {
            if (required)
            {
                errors.Add(new FieldIssue("tags", "is required"));
            }

            return null;
        }

        if (value.ValueKind != JsonValueKind.Array ||
            value.EnumerateArray().Any(t => t.ValueKind != JsonValueKind.String))
        {
            errors.Add(new FieldIssue("tags", "must be an array of strings"));
            return null;
        }

        var tags = value.EnumerateArray().Select(t => t.GetString()!).ToList();
        if (tags.Count > 10)
        {
            errors.Add(new FieldIssue("tags", "must contain at most 10 tags"));
        }
        else if (tags.Distinct().Count() != tags.Count)
        {
            errors.Add(new FieldIssue("tags", "must not contain duplicates"));
        }
        else if (tags.Any(t => !TagPattern().IsMatch(t)))
        {
            errors.Add(new FieldIssue("tags", "must only contain 1-30 characters of a-z, 0-9 and -"));
        }
        else
        {
            return tags;
        }

        return null;
    }
}

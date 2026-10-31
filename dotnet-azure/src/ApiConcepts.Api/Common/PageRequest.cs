// Concept 5 · Path and query parameters / Concept 18 · Pagination: ?limit and ?cursor, validated once.
using System.Globalization;

namespace ApiConcepts.Api.Common;

public sealed record PageInfo(int Limit, string? NextCursor, bool HasMore);

public sealed record PageRequest(int Limit, Cursor? After)
{
    private const int DefaultLimit = 10;

    public static PageRequest From(HttpRequest request)
    {
        var query = request.Query;
        var raw = query["limit"].ToString();
        var limit = DefaultLimit;
        if (raw.Length > 0 &&
            (!int.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out limit) || limit is < 1 or > 50))
        {
            throw ProblemException.Validation("limit", "must be between 1 and 50");
        }

        return new PageRequest(limit, Cursor.Parse(query.TryGetValue("cursor", out var cursor) ? cursor.ToString() : null));
    }

    public PageInfo Describe<T>(Page<T> page, Func<T, Cursor> key) =>
        new(Limit, page.HasMore && page.Items.Count > 0 ? key(page.Items[^1]).Encode() : null, page.HasMore);
}

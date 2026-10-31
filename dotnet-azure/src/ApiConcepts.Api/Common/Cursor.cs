// Concept 18 · Pagination: an opaque keyset cursor (createdAt, id) so pages stay stable while data changes.
using System.Buffers.Text;
using System.Globalization;
using System.Text;

namespace ApiConcepts.Api.Common;

public sealed record Cursor(DateTimeOffset CreatedAt, string Id)
{
    public string Encode() =>
        Base64Url.EncodeToString(Encoding.UTF8.GetBytes($"{CreatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture)}:{Id}"));

    public static Cursor? Parse(string? value)
    {
        if (value is null)
        {
            return null;
        }

        try
        {
            var text = Encoding.UTF8.GetString(Base64Url.DecodeFromChars(value));
            var split = text.IndexOf(':');
            if (split > 0 && split < text.Length - 1 &&
                long.TryParse(text.AsSpan(0, split), NumberStyles.None, CultureInfo.InvariantCulture, out var ticks) &&
                ticks > 0 && ticks <= DateTime.MaxValue.Ticks)
            {
                return new Cursor(new DateTimeOffset(ticks, TimeSpan.Zero), text[(split + 1)..]);
            }
        }
        catch (FormatException)
        {
        }
        catch (ArgumentException)
        {
        }

        throw new ProblemException(ProblemType.InvalidCursor, "The cursor cannot be decoded.");
    }
}

public sealed record Page<T>(IReadOnlyList<T> Items, bool HasMore);

public static class Paging
{
    /// <summary>Takes one page from items already ordered by (createdAt, id), starting after the cursor.</summary>
    public static Page<T> Take<T>(IEnumerable<T> ordered, Cursor? after, int limit, Func<T, Cursor> key)
    {
        var rest = after is null
            ? ordered
            : ordered.Where(item =>
            {
                var k = key(item);
                var byTime = k.CreatedAt.CompareTo(after.CreatedAt);
                return byTime > 0 || (byTime == 0 && string.CompareOrdinal(k.Id, after.Id) > 0);
            });
        var window = rest.Take(limit + 1).ToList();
        return new Page<T>(window.Take(limit).ToList(), window.Count > limit);
    }
}

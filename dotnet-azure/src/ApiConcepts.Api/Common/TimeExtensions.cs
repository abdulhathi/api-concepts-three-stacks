namespace ApiConcepts.Api.Common;

public static class TimeExtensions
{
    /// <summary>UTC now truncated to milliseconds, the precision the API exposes, so sorting matches what clients see.</summary>
    public static DateTimeOffset UtcNowMs(this TimeProvider time)
    {
        var now = time.GetUtcNow();
        return new DateTimeOffset(now.Ticks - now.Ticks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);
    }
}

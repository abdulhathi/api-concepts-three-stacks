using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;

namespace ApiConcepts.Client;

public static class ServiceCollectionExtensions
{
    /// <summary>Registers <see cref="ApiClient"/> with the retry and timeout pipeline. Returns the builder so tests can swap the handler.</summary>
    public static IHttpClientBuilder AddApiConceptsClient(this IServiceCollection services, Action<ApiClientOptions> configure)
    {
        services.Configure(configure);
        services.AddSingleton(TimeProvider.System);

        var builder = services.AddHttpClient<ApiClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<ApiClientOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            // The resilience pipeline owns timeouts; HttpClient's own 100 s default must not interfere.
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        builder.AddResilienceHandler("api-retry", (pipeline, context) =>
            RetryPolicy.Configure(pipeline, context.ServiceProvider.GetRequiredService<IOptions<ApiClientOptions>>().Value));
        return builder;
    }
}

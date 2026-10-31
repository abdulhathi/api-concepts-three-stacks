// Concepts 25 and 26 · Webhooks: deliver each event, retrying failures with exponential backoff and jitter.
using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;
using ApiConcepts.Api.Storage;

namespace ApiConcepts.Api.Webhooks;

public sealed class WebhookWorker(
    WebhookService service,
    IWebhookRepository repository,
    IHttpClientFactory httpClients,
    AppSettings settings,
    TimeProvider time,
    ILogger<WebhookWorker> logger) : BackgroundService
{
    public const string HttpClientName = "webhooks";

    private static readonly TimeSpan RetryCap = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Each delivery gets its own task so one slow receiver never delays another.
        await foreach (var job in service.Jobs.ReadAllAsync(stoppingToken))
        {
            _ = Task.Run(() => DeliverAsync(job, stoppingToken), stoppingToken);
        }
    }

    private async Task DeliverAsync(DeliveryJob job, CancellationToken stoppingToken)
    {
        try
        {
            for (var attempt = 1; attempt <= settings.WebhookMaxAttempts; attempt++)
            {
                var (statusCode, error) = await TryPostAsync(job, stoppingToken);
                var succeeded = error is null;
                var final = succeeded || attempt == settings.WebhookMaxAttempts;
                Record(job.DeliveryId, attempt, statusCode, error, succeeded ? DeliveryStatus.Succeeded
                    : final ? DeliveryStatus.Failed : DeliveryStatus.Pending);
                if (final)
                {
                    return;
                }

                await Task.Delay(Backoff.Delay(attempt, settings.WebhookRetryBase, RetryCap), time, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down: the delivery stays pending in the log.
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Webhook delivery {DeliveryId} crashed", job.DeliveryId);
        }
    }

    private async Task<(int? StatusCode, string? Error)> TryPostAsync(DeliveryJob job, CancellationToken stoppingToken)
    {
        // A fresh timestamp and signature per attempt keeps retries inside the receiver's replay window.
        var timestamp = time.GetUtcNow().ToUnixTimeSeconds();
        using var request = new HttpRequestMessage(HttpMethod.Post, job.Url) { Content = new ByteArrayContent(job.Body) };
        request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        request.Headers.Add("Webhook-Id", job.EventId);
        request.Headers.Add("Webhook-Timestamp", timestamp.ToString());
        request.Headers.Add("Webhook-Signature", WebhookSignature.Sign(job.Secret, timestamp, job.Body));

        try
        {
            using var client = httpClients.CreateClient(HttpClientName);
            using var response = await client.SendAsync(request, stoppingToken);
            var code = (int)response.StatusCode;
            return response.IsSuccessStatusCode ? (code, null) : (code, $"Receiver answered {code}");
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !stoppingToken.IsCancellationRequested)
        {
            return (null, exception is TaskCanceledException ? "Receiver did not answer within 5 seconds" : exception.Message);
        }
    }

    private void Record(string deliveryId, int attempts, int? statusCode, string? error, string status) =>
        repository.UpdateDelivery(deliveryId, d => d with
        {
            Status = status,
            Attempts = attempts,
            LastStatusCode = statusCode,
            LastError = error,
            UpdatedAt = time.UtcNowMs(),
        });
}

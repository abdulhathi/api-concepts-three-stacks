// Concept 27 · Error handling: IExceptionHandler maps ProblemException to its problem and everything else to a safe 500.
using Microsoft.AspNetCore.Diagnostics;

namespace ApiConcepts.Api.Common;

public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is ProblemException problem)
        {
            await ProblemWriter.WriteAsync(context, problem.Type, problem.Detail, problem.Errors, problem.Headers);
            return true;
        }

        logger.LogError(exception, "Unhandled exception for request {RequestId}", context.TraceIdentifier);
        await ProblemWriter.WriteAsync(context, ProblemType.InternalError, "An unexpected error occurred.");
        return true;
    }
}

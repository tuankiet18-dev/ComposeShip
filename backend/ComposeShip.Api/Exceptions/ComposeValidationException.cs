namespace ComposeShip.Api.Exceptions;

public sealed class ComposeValidationException : Exception
{
    public IReadOnlyList<string> Issues { get; }

    public ComposeValidationException(IEnumerable<string> issues)
        : base("This Compose configuration cannot be deployed. Review the deployment checks and choose a production-ready Compose file.")
    {
        Issues = issues.Distinct(StringComparer.Ordinal).ToList();
    }
}

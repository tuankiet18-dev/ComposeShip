namespace OneClickHost.Api.Services;

public sealed class CorrelationContext
{
    private static readonly AsyncLocal<string?> Current = new();

    public string? Id
    {
        get => Current.Value;
        set => Current.Value = value;
    }
}

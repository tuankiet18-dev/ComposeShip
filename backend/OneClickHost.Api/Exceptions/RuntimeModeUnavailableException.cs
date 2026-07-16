namespace OneClickHost.Api.Exceptions;

public sealed class RuntimeModeUnavailableException : InvalidOperationException
{
    public RuntimeModeUnavailableException(string message) : base(message)
    {
    }
}

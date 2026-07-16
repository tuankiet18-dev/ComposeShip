namespace OneClickHost.Api.Exceptions;

public sealed class PlatformCapacityException : Exception
{
    public PlatformCapacityException(string message) : base(message)
    {
    }
}

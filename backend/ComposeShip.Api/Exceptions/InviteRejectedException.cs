namespace ComposeShip.Api.Exceptions;

public class InviteRejectedException : Exception
{
    public InviteRejectedException(string message) : base(message) { }
}

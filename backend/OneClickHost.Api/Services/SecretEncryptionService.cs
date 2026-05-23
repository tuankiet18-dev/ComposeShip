using System.Security.Cryptography;
using System.Text;

namespace OneClickHost.Api.Services;

public class SecretEncryptionService
{
    private const string Prefix = "enc:v1:";
    private readonly byte[] _key;

    public SecretEncryptionService(IConfiguration configuration)
    {
        var configuredKey = configuration["SecretEncryption:Key"]
            ?? configuration["ONECLICK_SECRET_KEY"]
            ?? configuration["Jwt:Secret"];

        if (string.IsNullOrWhiteSpace(configuredKey))
            throw new InvalidOperationException("Secret encryption key is not configured.");

        _key = DeriveKey(configuredKey);
    }

    public string Encrypt(string value)
    {
        if (string.IsNullOrEmpty(value) || IsEncrypted(value))
            return value;

        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintext = Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(_key, tag.Length);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        return string.Join(':',
            "enc",
            "v1",
            Convert.ToBase64String(nonce),
            Convert.ToBase64String(tag),
            Convert.ToBase64String(ciphertext));
    }

    public string Decrypt(string value)
    {
        if (string.IsNullOrEmpty(value) || !IsEncrypted(value))
            return value;

        var parts = value.Split(':', 5);
        if (parts.Length != 5)
            throw new InvalidOperationException("Encrypted secret value is malformed.");

        var nonce = Convert.FromBase64String(parts[2]);
        var tag = Convert.FromBase64String(parts[3]);
        var ciphertext = Convert.FromBase64String(parts[4]);
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(_key, tag.Length);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }

    public bool IsEncrypted(string value) => value.StartsWith(Prefix, StringComparison.Ordinal);

    private static byte[] DeriveKey(string configuredKey)
    {
        try
        {
            var decoded = Convert.FromBase64String(configuredKey);
            if (decoded.Length == 32)
                return decoded;
        }
        catch (FormatException)
        {
            // Plain-text deployment keys are supported and derived with SHA-256.
        }

        return SHA256.HashData(Encoding.UTF8.GetBytes(configuredKey));
    }
}

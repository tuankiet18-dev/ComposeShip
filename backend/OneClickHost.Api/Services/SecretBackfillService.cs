using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;

namespace OneClickHost.Api.Services;

public class SecretBackfillService
{
    private readonly AppDbContext _db;
    private readonly SecretEncryptionService _secrets;
    private readonly ILogger<SecretBackfillService> _logger;

    public SecretBackfillService(AppDbContext db, SecretEncryptionService secrets, ILogger<SecretBackfillService> logger)
    {
        _db = db;
        _secrets = secrets;
        _logger = logger;
    }

    public async Task EncryptLegacyEnvironmentValuesAsync()
    {
        var changed = false;
        var envVars = await _db.EnvironmentVariables.ToListAsync();
        foreach (var env in envVars)
        {
            if (string.IsNullOrEmpty(env.Value) || _secrets.IsEncrypted(env.Value))
                continue;

            env.Value = _secrets.Encrypt(env.Value);
            changed = true;
        }

        var projects = await _db.Projects
            .Where(project => project.ComposeEnvJson != null && project.ComposeEnvJson != "")
            .ToListAsync();

        foreach (var project in projects)
        {
            if (EncryptComposeEnvJson(project.ComposeEnvJson) is not { } encryptedJson)
                continue;

            project.ComposeEnvJson = encryptedJson;
            changed = true;
        }

        if (!changed)
            return;

        await _db.SaveChangesAsync();
        _logger.LogInformation("Encrypted legacy environment variable values at rest.");
    }

    private string? EncryptComposeEnvJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            var root = JsonNode.Parse(json);
            if (root is not JsonArray rows)
                return null;

            var changed = false;
            foreach (var row in rows.OfType<JsonObject>())
            {
                var value = row["value"]?.GetValue<string>();
                if (string.IsNullOrEmpty(value) || _secrets.IsEncrypted(value))
                    continue;

                row["value"] = _secrets.Encrypt(value);
                changed = true;
            }

            return changed ? rows.ToJsonString() : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not encrypt legacy Compose environment JSON for a project.");
            return null;
        }
    }
}

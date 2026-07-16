using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using ComposeShip.Api.Data;
using ComposeShip.Api.DTOs.Deployments;
using ComposeShip.Api.Models;

namespace ComposeShip.Api.Services;

public class AiDeploymentDiagnosisService : IAiDeploymentDiagnosisService
{
    private const string PromptVersion = "deployment_diagnosis_v1";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> ValidConfidence = ["low", "medium", "high"];

    private readonly AppDbContext _db;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AiDeploymentDiagnosisService> _logger;

    public AiDeploymentDiagnosisService(
        AppDbContext db,
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<AiDeploymentDiagnosisService> logger)
    {
        _db = db;
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<DeploymentAiDiagnosisResponse> GetDiagnosisAsync(Guid deploymentId, Guid userId)
    {
        var diagnosis = await FindAuthorizedDiagnosisAsync(deploymentId, userId)
            ?? throw new KeyNotFoundException("AI diagnosis not found.");

        return ToResponse(diagnosis);
    }

    public async Task<DeploymentAiDiagnosisResponse> GenerateDiagnosisAsync(Guid deploymentId, Guid userId)
    {
        var existing = await FindAuthorizedDiagnosisAsync(deploymentId, userId);
        if (existing is not null) return ToResponse(existing);

        var snapshot = await _db.DeploymentDiagnosticSnapshots
            .Include(s => s.Deployment)
                .ThenInclude(d => d.Service)
                    .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(s =>
                s.DeploymentId == deploymentId &&
                s.Deployment.Service.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Diagnostic snapshot not found.");

        var provider = _configuration["AI:Provider"] ?? "OpenAI";
        if (!string.Equals(provider, "OpenAI", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("AI diagnosis provider is not supported.");
        }

        var model = _configuration["AI:Model"] ?? "gpt-4o-mini";
        var diagnosisContent = await GenerateWithOpenAiAsync(snapshot, model);
        var diagnosis = new DeploymentAiDiagnosis
        {
            DeploymentId = deploymentId,
            DiagnosisJson = JsonSerializer.Serialize(diagnosisContent, JsonOptions),
            ModelName = model,
            PromptVersion = PromptVersion
        };

        _db.DeploymentAiDiagnoses.Add(diagnosis);
        await _db.SaveChangesAsync();

        return ToResponse(diagnosis);
    }

    private async Task<DeploymentAiDiagnosis?> FindAuthorizedDiagnosisAsync(Guid deploymentId, Guid userId)
    {
        return await _db.DeploymentAiDiagnoses
            .Include(d => d.Deployment)
                .ThenInclude(d => d.Service)
                    .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(d =>
                d.DeploymentId == deploymentId &&
                d.Deployment.Service.Project.UserId == userId);
    }

    private async Task<AiDiagnosisContentResponse> GenerateWithOpenAiAsync(
        DeploymentDiagnosticSnapshot snapshot,
        string model)
    {
        var apiKey = _configuration["AI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("AI diagnosis is not configured.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(
            JsonSerializer.Serialize(BuildOpenAiRequest(snapshot, model), JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(request);
        var responseText = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("AI diagnosis provider returned HTTP {StatusCode}", (int)response.StatusCode);
            throw new InvalidOperationException("AI diagnosis provider is temporarily unavailable.");
        }

        try
        {
            var json = JsonNode.Parse(responseText);
            var outputText = json?["output_text"]?.GetValue<string>()
                ?? FindOutputText(json)
                ?? throw new JsonException("OpenAI response did not include output text.");
            var diagnosis = JsonSerializer.Deserialize<AiDiagnosisContentResponse>(outputText, JsonOptions)
                ?? throw new JsonException("AI diagnosis response was empty.");
            return ValidateDiagnosis(diagnosis);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "AI diagnosis provider returned an invalid structured response.");
            throw new InvalidOperationException("AI diagnosis provider returned an invalid response.");
        }
    }

    private static object BuildOpenAiRequest(DeploymentDiagnosticSnapshot snapshot, string model)
    {
        var snapshotJson = JsonSerializer.Serialize(new
        {
            failureStep = snapshot.FailureStep,
            detectedStack = snapshot.DetectedStack,
            errorSummary = snapshot.ErrorSummary,
            relevantLogExcerpt = snapshot.RelevantLogExcerpt,
            repositoryTree = ParseJsonOrDefault(snapshot.RepositoryTree, new JsonArray()),
            selectedFiles = ParseJsonOrDefault(snapshot.SelectedFiles, new JsonObject())
        }, JsonOptions);

        return new
        {
            model,
            max_output_tokens = 900,
            input = new object[]
            {
                new
                {
                    role = "system",
                    content = """
                    You are a deployment failure diagnosis assistant for ComposeShip.
                    Diagnose only from the supplied diagnostic snapshot.
                    Do not fabricate files that are not present.
                    Do not claim a file contains something unless it appears in SelectedFiles.
                    Distinguish user repository issues from ComposeShip platform limitations or detector/build mismatches.
                    If evidence is weak, use low or medium confidence and explain missing information.
                    Return only the structured JSON requested by the schema.
                    """
                },
                new
                {
                    role = "user",
                    content = $"""
                    Diagnostic snapshot:
                    {snapshotJson}

                    Root cause categories must be stable snake_case values such as:
                    unsupported_or_undetected_stack, missing_build_script, missing_dependency,
                    docker_build_failure, container_startup_failure, configuration_error,
                    missing_environment_configuration, source_repository_issue, unknown.

                    Evidence must be grounded only in the diagnostic snapshot.
                    filesToInspect should mention only files that appear in SelectedFiles or RepositoryTree when possible.
                    suggestedFixes must be concise and actionable.
                    """
                }
            },
            text = new
            {
                format = new
                {
                    type = "json_schema",
                    name = "deployment_ai_diagnosis",
                    strict = true,
                    schema = DiagnosisSchema()
                }
            }
        };
    }

    private static object DiagnosisSchema()
    {
        return new
        {
            type = "object",
            additionalProperties = false,
            properties = new Dictionary<string, object>
            {
                ["diagnosis"] = new { type = "string" },
                ["rootCauseCategory"] = new { type = "string" },
                ["confidence"] = new { type = "string", @enum = new[] { "low", "medium", "high" } },
                ["evidence"] = new { type = "array", items = new { type = "string" } },
                ["filesToInspect"] = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new Dictionary<string, object>
                        {
                            ["path"] = new { type = "string" },
                            ["reason"] = new { type = "string" }
                        },
                        required = new[] { "path", "reason" }
                    }
                },
                ["suggestedFixes"] = new { type = "array", items = new { type = "string" } },
                ["isLikelyPlatformIssue"] = new { type = "boolean" },
                ["platformIssueReason"] = new
                {
                    anyOf = new object[]
                    {
                        new { type = "string" },
                        new { type = "null" }
                    }
                },
                ["missingInformation"] = new { type = "array", items = new { type = "string" } }
            },
            required = new[]
            {
                "diagnosis",
                "rootCauseCategory",
                "confidence",
                "evidence",
                "filesToInspect",
                "suggestedFixes",
                "isLikelyPlatformIssue",
                "platformIssueReason",
                "missingInformation"
            }
        };
    }

    private static JsonNode ParseJsonOrDefault(string? json, JsonNode fallback)
    {
        if (string.IsNullOrWhiteSpace(json)) return fallback;
        try
        {
            return JsonNode.Parse(json) ?? fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    private static string? FindOutputText(JsonNode? response)
    {
        var output = response?["output"]?.AsArray();
        if (output is null) return null;

        foreach (var item in output)
        {
            var content = item?["content"]?.AsArray();
            if (content is null) continue;
            foreach (var part in content)
            {
                var text = part?["text"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(text)) return text;
            }
        }

        return null;
    }

    private static AiDiagnosisContentResponse ValidateDiagnosis(AiDiagnosisContentResponse diagnosis)
    {
        var confidence = diagnosis.Confidence.ToLowerInvariant();
        if (!ValidConfidence.Contains(confidence))
        {
            throw new JsonException("Invalid confidence value.");
        }

        return diagnosis with { Confidence = confidence };
    }

    private static DeploymentAiDiagnosisResponse ToResponse(DeploymentAiDiagnosis diagnosis)
    {
        var content = JsonSerializer.Deserialize<AiDiagnosisContentResponse>(diagnosis.DiagnosisJson, JsonOptions)
            ?? throw new InvalidOperationException("Stored AI diagnosis is invalid.");

        return new DeploymentAiDiagnosisResponse(
            diagnosis.Id,
            diagnosis.DeploymentId,
            ValidateDiagnosis(content),
            diagnosis.ModelName,
            diagnosis.PromptVersion,
            diagnosis.CreatedAt,
            diagnosis.UpdatedAt);
    }
}

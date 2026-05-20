using OneClickHost.Api.DTOs.Deployments;

namespace OneClickHost.Api.Services;

public interface IAiDeploymentDiagnosisService
{
    Task<DeploymentAiDiagnosisResponse> GetDiagnosisAsync(Guid deploymentId, Guid userId);
    Task<DeploymentAiDiagnosisResponse> GenerateDiagnosisAsync(Guid deploymentId, Guid userId);
}

using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectDeployment> ProjectDeployments => Set<ProjectDeployment>();
    public DbSet<Service> Services => Set<Service>();
    public DbSet<Deployment> Deployments => Set<Deployment>();
    public DbSet<DeploymentDiagnosticSnapshot> DeploymentDiagnosticSnapshots => Set<DeploymentDiagnosticSnapshot>();
    public DbSet<DeploymentAiDiagnosis> DeploymentAiDiagnoses => Set<DeploymentAiDiagnosis>();
    public DbSet<EnvironmentVariable> EnvironmentVariables => Set<EnvironmentVariable>();
    public DbSet<ExecutionNode> ExecutionNodes => Set<ExecutionNode>();
    public DbSet<RouteTarget> RouteTargets => Set<RouteTarget>();
    public DbSet<ProjectEvent> ProjectEvents => Set<ProjectEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── User ──────────────────────────────────
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.HasMany(u => u.Projects)
             .WithOne(p => p.User)
             .HasForeignKey(p => p.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Project ───────────────────────────────
        modelBuilder.Entity<Project>(e =>
        {
            e.HasMany(p => p.Services)
             .WithOne(s => s.Project)
             .HasForeignKey(s => s.ProjectId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(p => p.ProjectDeployments)
             .WithOne(d => d.Project)
             .HasForeignKey(d => d.ProjectId)
             .OnDelete(DeleteBehavior.Cascade);

            e.Property(p => p.ComposeRoutesJson).HasColumnType("text");
            e.Property(p => p.ComposeEnvJson).HasColumnType("text");
            e.Property(p => p.ComposePostStartCommands).HasColumnType("text");
            e.Property(p => p.ComposeLiveUrlsJson).HasColumnType("text");

            e.HasMany(p => p.RouteTargets)
             .WithOne(r => r.Project)
             .HasForeignKey(r => r.ProjectId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(p => p.Events)
             .WithOne(ev => ev.Project)
             .HasForeignKey(ev => ev.ProjectId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Service ───────────────────────────────
        modelBuilder.Entity<Service>(e =>
        {
            e.HasMany(s => s.Deployments)
             .WithOne(d => d.Service)
             .HasForeignKey(d => d.ServiceId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(s => s.EnvironmentVariables)
             .WithOne(ev => ev.Service)
             .HasForeignKey(ev => ev.ServiceId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(s => s.RouteTargets)
             .WithOne(r => r.Service)
             .HasForeignKey(r => r.ServiceId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // ── Deployment ────────────────────────────
        modelBuilder.Entity<Deployment>(e =>
        {
            e.Property(d => d.BuildLogs).HasColumnType("text");

            e.HasOne(d => d.DiagnosticSnapshot)
             .WithOne(s => s.Deployment)
             .HasForeignKey<DeploymentDiagnosticSnapshot>(s => s.DeploymentId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(d => d.AiDiagnosis)
             .WithOne(s => s.Deployment)
             .HasForeignKey<DeploymentAiDiagnosis>(s => s.DeploymentId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(d => d.LockedByNode)
             .WithMany(n => n.Deployments)
             .HasForeignKey(d => d.LockedByNodeId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasIndex(d => new { d.Status, d.NextRunAt, d.CreatedAt });
        });

        modelBuilder.Entity<DeploymentDiagnosticSnapshot>(e =>
        {
            e.Property(s => s.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(s => s.RelevantLogExcerpt).HasColumnType("text");
            e.Property(s => s.RepositoryTree).HasColumnType("jsonb");
            e.Property(s => s.SelectedFiles).HasColumnType("jsonb");
        });

        modelBuilder.Entity<DeploymentAiDiagnosis>(e =>
        {
            e.Property(d => d.DiagnosisJson).HasColumnType("jsonb");
            e.Property(d => d.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(d => d.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        modelBuilder.Entity<ProjectDeployment>(e =>
        {
            e.Property(d => d.BuildLogs).HasColumnType("text");
            e.Property(d => d.PublicUrlsJson).HasColumnType("text");

            e.HasOne(d => d.LockedByNode)
             .WithMany(n => n.ProjectDeployments)
             .HasForeignKey(d => d.LockedByNodeId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasMany(d => d.RouteTargets)
             .WithOne(r => r.ProjectDeployment)
             .HasForeignKey(r => r.ProjectDeploymentId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasMany(d => d.Events)
             .WithOne(ev => ev.Deployment)
             .HasForeignKey(ev => ev.DeploymentId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasIndex(d => new { d.Status, d.NextRunAt, d.CreatedAt });
        });

        modelBuilder.Entity<ExecutionNode>(e =>
        {
            e.HasIndex(n => n.Name).IsUnique();
            e.Property(n => n.LabelsJson).HasColumnType("jsonb");
            e.HasMany(n => n.Events)
             .WithOne(ev => ev.ExecutionNode)
             .HasForeignKey(ev => ev.ExecutionNodeId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<RouteTarget>(e =>
        {
            e.HasIndex(r => r.Host);
            e.HasIndex(r => new { r.ProjectId, r.Status });
            e.HasOne(r => r.ExecutionNode)
             .WithMany(n => n.RouteTargets)
             .HasForeignKey(r => r.ExecutionNodeId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasMany(r => r.Events)
             .WithOne(ev => ev.RouteTarget)
             .HasForeignKey(ev => ev.RouteTargetId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProjectEvent>(e =>
        {
            e.Property(ev => ev.MetadataJson).HasColumnType("jsonb");
            e.HasIndex(ev => new { ev.ProjectId, ev.CreatedAt });
            e.HasIndex(ev => ev.Type);
        });
    }
}

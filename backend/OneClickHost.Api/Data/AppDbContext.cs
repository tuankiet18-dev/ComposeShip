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
        });
    }
}

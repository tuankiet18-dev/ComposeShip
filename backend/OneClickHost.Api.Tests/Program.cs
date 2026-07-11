using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Exceptions;
using OneClickHost.Api.Models;
using OneClickHost.Api.Services;

var tests = new (string Name, Func<Task> Test)[]
{
    ("parses core compose resources", AsTask(ParsesCoreComposeResources)),
    ("classifies infrastructure services", AsTask(ClassifiesInfrastructureServices)),
    ("maps compose services for services tab", AsTask(MapsComposeServicesForServicesTab)),
    ("returns empty graph for compose without services", AsTask(ReturnsEmptyGraphForMissingServices)),
    ("blocks service-level active project from deploying another project", BlocksServiceLevelActiveProject),
    ("blocks compose active project from service-level deploy in another project", BlocksComposeActiveProject),
    ("allows redeploy within the same active project", AllowsSameProjectRedeploy),
    ("cleanup states keep the runtime slot reserved", CleanupStatesKeepRuntimeSlot),
    ("terminal cleanup states release the runtime slot", TerminalCleanupStatesReleaseRuntimeSlot),
    ("enforces configured project service and env quotas", EnforcesConfiguredQuotaCaps),
};

foreach (var test in tests)
{
    await test.Test();
    Console.WriteLine($"PASS {test.Name}");
}

static Func<Task> AsTask(Action action) => () =>
{
    action();
    return Task.CompletedTask;
};

static void ParsesCoreComposeResources()
{
    const string yaml = """
services:
  web:
    build: ./web
    ports:
      - "8080:80"
    environment:
      API_URL: http://api:8000
      SECRET_TOKEN: keep-me-private
    depends_on:
      api:
        condition: service_started
    volumes:
      - web-cache:/app/cache:rw
    networks:
      - public
  api:
    image: ghcr.io/example/api:latest
    environment:
      DATABASE_URL: postgres://db:5432/app
    depends_on:
      - db
  db:
    image: postgres:16-alpine
volumes:
  web-cache:
networks:
  public:
""";

    var graph = DeploymentGraphParser.Parse(yaml);

    AssertContainsNode(graph.Nodes, "service:web", "service");
    AssertContainsNode(graph.Nodes, "service:api", "service");
    AssertContainsNode(graph.Nodes, "service:db", "database");
    AssertContainsNode(graph.Nodes, "env:web:API_URL", "env_var");
    AssertContainsNode(graph.Nodes, "volume:web-cache", "volume");
    AssertContainsNode(graph.Nodes, "network:public", "network");
    AssertContainsEdge(graph.Edges, "depends_on", "service:web", "service:api");
    AssertContainsEdge(graph.Edges, "depends_on", "service:api", "service:db");
    AssertContainsEdge(graph.Edges, "uses_env", "service:web", "env:web:API_URL");
    AssertContainsEdge(graph.Edges, "mounts", "service:web", "volume:web-cache");
    AssertContainsEdge(graph.Edges, "exposes", "service:web", "network:public");
    AssertContainsEdge(graph.Edges, "connects_to", "service:web", "service:api");
}

static void ClassifiesInfrastructureServices()
{
    const string yaml = """
services:
  db:
    image: postgres:16-alpine
  redis:
    image: redis:7-alpine
  worker:
    image: example/app
    command: celery worker
  traefik:
    image: traefik:v3.4
""";

    var graph = DeploymentGraphParser.Parse(yaml);

    AssertContainsNode(graph.Nodes, "service:db", "database");
    AssertContainsNode(graph.Nodes, "service:redis", "cache");
    AssertContainsNode(graph.Nodes, "service:worker", "worker");
    AssertContainsNode(graph.Nodes, "service:traefik", "reverse_proxy");
}

static void MapsComposeServicesForServicesTab()
{
    const string yaml = """
services:
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    environment:
      API_URL: http://api:8000
    depends_on:
      - api
  api:
    image: ghcr.io/example/api:latest
    environment:
      DATABASE_URL: postgres://db:5432/app
    depends_on:
      - db
      - redis
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
volumes:
  pgdata:
""";

    var services = ComposeServiceListParser.Parse(
        yaml,
        [
            new ComposeRouteResponse("frontend", "app", 80, "traefik", "/", "https://app.example.test"),
            new ComposeRouteResponse("api", "api", 8000, "traefik", "/health", "https://api.example.test")
        ],
        [new ComposeEnvVarResponse("api", "JWT_SECRET", "********", true)],
        "live");

    var frontend = services.Single(service => service.Name == "frontend");
    var apiService = services.Single(service => service.Name == "api");
    var db = services.Single(service => service.Name == "db");
    var redis = services.Single(service => service.Name == "redis");

    AssertEqual("service", frontend.Type, "frontend type");
    AssertContains(frontend.Ports, 80, "frontend ports");
    AssertContains(frontend.Dependencies, "api", "frontend dependencies");
    AssertEqual(true, frontend.IsPublic, "frontend public flag");
    AssertEqual("live", frontend.Status, "frontend status");
    AssertContains(apiService.EnvironmentKeys, "JWT_SECRET", "api env keys");
    AssertEqual("database", db.Type, "db type");
    AssertContains(db.Volumes, "pgdata:/var/lib/postgresql/data", "db volumes");
    AssertEqual("cache", redis.Type, "redis type");
}

static void AssertContains<T>(IEnumerable<T> values, T expected, string name)
{
    if (!values.Contains(expected))
        throw new Exception($"Expected {name} to contain {expected}.");
}

static void ReturnsEmptyGraphForMissingServices()
{
    const string yaml = """
name: no-services
volumes:
  data:
""";

    var graph = DeploymentGraphParser.Parse(yaml);
    AssertEqual(0, graph.Nodes.Count, "node count");
    AssertEqual(0, graph.Edges.Count, "edge count");
}

static void AssertContainsNode(IEnumerable<DeploymentGraphNodeResponse> nodes, string id, string type)
{
    if (!nodes.Any(node => node.Id == id && node.Type == type))
        throw new Exception($"Expected node {id} with type {type}.");
}

static void AssertContainsEdge(IEnumerable<DeploymentGraphEdgeResponse> edges, string type, string source, string target)
{
    if (!edges.Any(edge => edge.Type == type && edge.Source == source && edge.Target == target))
        throw new Exception($"Expected edge {type}: {source} -> {target}.");
}

static void AssertEqual<T>(T expected, T actual, string name)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new Exception($"Expected {name} to be {expected}, got {actual}.");
}

static async Task BlocksServiceLevelActiveProject()
{
    var userId = Guid.NewGuid();
    await using var db = CreateDbContext();
    var activeProject = SeedProject(db, userId, "service-active", projectStatus: "active");
    SeedService(db, activeProject.Id, "api", "queued");
    var targetProject = SeedProject(db, userId, "target", projectStatus: "active");
    await db.SaveChangesAsync();

    var quota = CreateQuotaService(db);
    var ex = await AssertThrowsAsync<QuotaExceededException>(() =>
        quota.EnsureCanDeployProjectAsync(userId, targetProject.Id));
    if (!ex.Message.Contains("Stop your running project", StringComparison.Ordinal))
        throw new Exception($"Expected quota message to be actionable, got {ex.Message}.");
}

static async Task BlocksComposeActiveProject()
{
    var userId = Guid.NewGuid();
    await using var db = CreateDbContext();
    SeedProject(db, userId, "compose-live", projectStatus: "live");
    var targetProject = SeedProject(db, userId, "target", projectStatus: "active");
    await db.SaveChangesAsync();

    var quota = CreateQuotaService(db);
    await AssertThrowsAsync<QuotaExceededException>(() =>
        quota.EnsureCanDeployProjectAsync(userId, targetProject.Id));
}

static async Task AllowsSameProjectRedeploy()
{
    var userId = Guid.NewGuid();
    await using var db = CreateDbContext();
    var activeProject = SeedProject(db, userId, "same-project", projectStatus: "live");
    SeedService(db, activeProject.Id, "api", "queued");
    await db.SaveChangesAsync();

    var quota = CreateQuotaService(db);
    await quota.EnsureCanDeployProjectAsync(userId, activeProject.Id);
}

static async Task CleanupStatesKeepRuntimeSlot()
{
    foreach (var status in new[] { "stopping", "deleting", "deleting_failed", "cleanup_failed" })
    {
        var userId = Guid.NewGuid();
        await using var db = CreateDbContext();
        SeedProject(db, userId, $"cleanup-{status}", projectStatus: status);
        var target = SeedProject(db, userId, "target", projectStatus: "active");
        await db.SaveChangesAsync();

        var quota = CreateQuotaService(db);
        await AssertThrowsAsync<QuotaExceededException>(() => quota.EnsureCanDeployProjectAsync(userId, target.Id));
    }
}

static async Task TerminalCleanupStatesReleaseRuntimeSlot()
{
    foreach (var status in new[] { "stopped", "failed" })
    {
        var userId = Guid.NewGuid();
        await using var db = CreateDbContext();
        SeedProject(db, userId, $"terminal-{status}", projectStatus: status);
        var target = SeedProject(db, userId, "target", projectStatus: "active");
        await db.SaveChangesAsync();

        var quota = CreateQuotaService(db);
        await quota.EnsureCanDeployProjectAsync(userId, target.Id);
    }
}

static async Task EnforcesConfiguredQuotaCaps()
{
    var userId = Guid.NewGuid();
    await using var db = CreateDbContext();
    var project = SeedProject(db, userId, "quota-project", projectStatus: "active");
    SeedProject(db, userId, "quota-project-2", projectStatus: "active");
    SeedService(db, project.Id, "api", "created");
    SeedService(db, project.Id, "web", "created");
    await db.SaveChangesAsync();

    var quota = CreateQuotaService(db, new Dictionary<string, string?>
    {
        ["Quotas:MaxProjectsPerUser"] = "2",
        ["Quotas:MaxServicesPerProject"] = "2",
        ["Quotas:MaxRoutesPerProject"] = "1",
        ["Quotas:MaxEnvVarsPerProject"] = "1"
    });

    await AssertThrowsAsync<QuotaExceededException>(() => quota.EnsureMaxProjectsAsync(userId));
    await AssertThrowsAsync<QuotaExceededException>(() => quota.EnsureMaxServicesAsync(project.Id));
    AssertThrows<QuotaExceededException>(() => quota.EnsureComposeLimitsAsync(routesCount: 2, envVarsCount: 0));
    AssertThrows<QuotaExceededException>(() => quota.EnsureComposeLimitsAsync(routesCount: 1, envVarsCount: 2));
}

static AppDbContext CreateDbContext()
{
    var options = new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase($"quota-tests-{Guid.NewGuid()}")
        .Options;
    return new AppDbContext(options);
}

static QuotaService CreateQuotaService(AppDbContext db, Dictionary<string, string?>? values = null)
{
    values ??= new Dictionary<string, string?>
    {
        ["Quotas:MaxProjectsPerUser"] = "3",
        ["Quotas:MaxServicesPerProject"] = "5",
        ["Quotas:MaxRoutesPerProject"] = "10",
        ["Quotas:MaxEnvVarsPerProject"] = "50"
    };

    var configuration = new ConfigurationBuilder()
        .AddInMemoryCollection(values)
        .Build();

    return new QuotaService(db, configuration);
}

static Project SeedProject(AppDbContext db, Guid userId, string name, string projectStatus)
{
    var project = new Project
    {
        UserId = userId,
        Name = name,
        Status = projectStatus
    };
    db.Projects.Add(project);
    return project;
}

static Service SeedService(AppDbContext db, Guid projectId, string name, string status)
{
    var service = new Service
    {
        ProjectId = projectId,
        Name = name,
        RepoUrl = "https://github.com/example/repo",
        Status = status
    };
    db.Services.Add(service);
    return service;
}

static async Task<T> AssertThrowsAsync<T>(Func<Task> action) where T : Exception
{
    try
    {
        await action();
    }
    catch (T ex)
    {
        return ex;
    }

    throw new Exception($"Expected exception {typeof(T).Name}.");
}

static void AssertThrows<T>(Action action) where T : Exception
{
    try
    {
        action();
    }
    catch (T)
    {
        return;
    }

    throw new Exception($"Expected exception {typeof(T).Name}.");
}

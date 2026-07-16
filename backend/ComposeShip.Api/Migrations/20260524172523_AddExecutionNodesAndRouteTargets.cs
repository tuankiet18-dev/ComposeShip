using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComposeShip.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddExecutionNodesAndRouteTargets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FailureCategory",
                table: "ProjectDeployments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "HeartbeatAt",
                table: "ProjectDeployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedAt",
                table: "ProjectDeployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LockedByNodeId",
                table: "ProjectDeployments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "NextRunAt",
                table: "ProjectDeployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RetryCount",
                table: "ProjectDeployments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "FailureCategory",
                table: "Deployments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "HeartbeatAt",
                table: "Deployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedAt",
                table: "Deployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LockedByNodeId",
                table: "Deployments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "NextRunAt",
                table: "Deployments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RetryCount",
                table: "Deployments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "ExecutionNodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    PublicOrPrivateBaseUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Architecture = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    LabelsJson = table.Column<string>(type: "jsonb", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MaxConcurrentBuilds = table.Column<int>(type: "integer", nullable: false),
                    CurrentBuilds = table.Column<int>(type: "integer", nullable: false),
                    LastHeartbeatAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AgentTokenHash = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExecutionNodes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RouteTargets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectDeploymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ServiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExecutionNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Host = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TargetUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RouteTargets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RouteTargets_ExecutionNodes_ExecutionNodeId",
                        column: x => x.ExecutionNodeId,
                        principalTable: "ExecutionNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RouteTargets_ProjectDeployments_ProjectDeploymentId",
                        column: x => x.ProjectDeploymentId,
                        principalTable: "ProjectDeployments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_RouteTargets_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RouteTargets_Services_ServiceId",
                        column: x => x.ServiceId,
                        principalTable: "Services",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectDeployments_LockedByNodeId",
                table: "ProjectDeployments",
                column: "LockedByNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectDeployments_Status_NextRunAt_CreatedAt",
                table: "ProjectDeployments",
                columns: new[] { "Status", "NextRunAt", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Deployments_LockedByNodeId",
                table: "Deployments",
                column: "LockedByNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_Deployments_Status_NextRunAt_CreatedAt",
                table: "Deployments",
                columns: new[] { "Status", "NextRunAt", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ExecutionNodes_Name",
                table: "ExecutionNodes",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RouteTargets_ExecutionNodeId",
                table: "RouteTargets",
                column: "ExecutionNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_RouteTargets_Host",
                table: "RouteTargets",
                column: "Host");

            migrationBuilder.CreateIndex(
                name: "IX_RouteTargets_ProjectDeploymentId",
                table: "RouteTargets",
                column: "ProjectDeploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_RouteTargets_ProjectId_Status",
                table: "RouteTargets",
                columns: new[] { "ProjectId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_RouteTargets_ServiceId",
                table: "RouteTargets",
                column: "ServiceId");

            migrationBuilder.AddForeignKey(
                name: "FK_Deployments_ExecutionNodes_LockedByNodeId",
                table: "Deployments",
                column: "LockedByNodeId",
                principalTable: "ExecutionNodes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectDeployments_ExecutionNodes_LockedByNodeId",
                table: "ProjectDeployments",
                column: "LockedByNodeId",
                principalTable: "ExecutionNodes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Deployments_ExecutionNodes_LockedByNodeId",
                table: "Deployments");

            migrationBuilder.DropForeignKey(
                name: "FK_ProjectDeployments_ExecutionNodes_LockedByNodeId",
                table: "ProjectDeployments");

            migrationBuilder.DropTable(
                name: "RouteTargets");

            migrationBuilder.DropTable(
                name: "ExecutionNodes");

            migrationBuilder.DropIndex(
                name: "IX_ProjectDeployments_LockedByNodeId",
                table: "ProjectDeployments");

            migrationBuilder.DropIndex(
                name: "IX_ProjectDeployments_Status_NextRunAt_CreatedAt",
                table: "ProjectDeployments");

            migrationBuilder.DropIndex(
                name: "IX_Deployments_LockedByNodeId",
                table: "Deployments");

            migrationBuilder.DropIndex(
                name: "IX_Deployments_Status_NextRunAt_CreatedAt",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "FailureCategory",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "HeartbeatAt",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "LockedAt",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "LockedByNodeId",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "NextRunAt",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "RetryCount",
                table: "ProjectDeployments");

            migrationBuilder.DropColumn(
                name: "FailureCategory",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "HeartbeatAt",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "LockedAt",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "LockedByNodeId",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "NextRunAt",
                table: "Deployments");

            migrationBuilder.DropColumn(
                name: "RetryCount",
                table: "Deployments");
        }
    }
}

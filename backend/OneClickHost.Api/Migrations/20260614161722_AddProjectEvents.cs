using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OneClickHost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeploymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExecutionNodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    RouteTargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Severity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Message = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    MetadataJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectEvents_ExecutionNodes_ExecutionNodeId",
                        column: x => x.ExecutionNodeId,
                        principalTable: "ExecutionNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectEvents_ProjectDeployments_DeploymentId",
                        column: x => x.DeploymentId,
                        principalTable: "ProjectDeployments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectEvents_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectEvents_RouteTargets_RouteTargetId",
                        column: x => x.RouteTargetId,
                        principalTable: "RouteTargets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEvents_DeploymentId",
                table: "ProjectEvents",
                column: "DeploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEvents_ExecutionNodeId",
                table: "ProjectEvents",
                column: "ExecutionNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEvents_ProjectId_CreatedAt",
                table: "ProjectEvents",
                columns: new[] { "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEvents_RouteTargetId",
                table: "ProjectEvents",
                column: "RouteTargetId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEvents_Type",
                table: "ProjectEvents",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectEvents");
        }
    }
}

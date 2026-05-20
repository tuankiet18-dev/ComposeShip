using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OneClickHost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDeploymentDiagnosticSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DeploymentDiagnosticSnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeploymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    FailureStep = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DetectedStack = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ErrorSummary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RelevantLogExcerpt = table.Column<string>(type: "text", nullable: true),
                    RepositoryTree = table.Column<string>(type: "jsonb", nullable: true),
                    SelectedFiles = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeploymentDiagnosticSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeploymentDiagnosticSnapshots_Deployments_DeploymentId",
                        column: x => x.DeploymentId,
                        principalTable: "Deployments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DeploymentDiagnosticSnapshots_DeploymentId",
                table: "DeploymentDiagnosticSnapshots",
                column: "DeploymentId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DeploymentDiagnosticSnapshots");
        }
    }
}

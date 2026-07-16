# ─────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:ea8bde36c11b6e7eec2656d0e59101d4462f6bd630730f2c8201ed0572b295d5 AS build
WORKDIR /src

# Copy solution and project files first (layer caching)
COPY ComposeShip.Api/*.csproj ComposeShip.Api/
RUN dotnet restore ComposeShip.Api/ComposeShip.Api.csproj

# Copy everything and build
COPY . .
WORKDIR /src/ComposeShip.Api
RUN dotnet publish -c Release -o /app/publish

# ─────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:7644f992230d35cf230017189d4038c0ae0f7388b13f4f7ae1900a155bafb597 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "ComposeShip.Api.dll"]

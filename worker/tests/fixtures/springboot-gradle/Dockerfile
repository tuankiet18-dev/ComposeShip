# ─────────────────────────────────────
# Spring Boot (Gradle) Dockerfile Template
# ─────────────────────────────────────
FROM gradle:8.5-jdk21-alpine AS build
WORKDIR /app

# Copy source and build
COPY . .
RUN if [ -f gradlew ]; then chmod +x ./gradlew && ./gradlew bootJar --no-daemon -x test; else gradle bootJar --no-daemon -x test; fi

# Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

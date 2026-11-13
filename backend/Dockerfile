FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN mkdir -p /app/data/documents && chown -R 10001:10001 /app
COPY --from=build /workspace/target/kaly-api-0.0.1-SNAPSHOT.jar /app/kaly-api.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/kaly-api.jar"]

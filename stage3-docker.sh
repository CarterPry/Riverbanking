#!/bin/bash

echo "======================================"
echo "Stage 3: Docker Infrastructure Setup"
echo "======================================"

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker daemon is not running"
    echo "Please start Docker and try again"
    exit 1
fi

echo "✅ Docker is installed and running"
echo ""
echo "Pulling security testing Docker images..."
echo "This may take several minutes depending on your internet connection..."
echo ""

# Array of images to pull
declare -a images=(
    "projectdiscovery/subfinder:latest"
    "instrumentisto/nmap:latest"
    "ghcr.io/owasp/zap:stable"
    "ghcr.io/sqlmapproject/sqlmap:latest"
    "drwetter/testssl.sh:latest"
    "aquasec/trivy:latest"
    "ticarpi/jwt_tool:latest"
)

# Pull each image
failed_images=()
for image in "${images[@]}"; do
    echo "----------------------------------------"
    echo "Pulling: $image"
    if docker pull "$image"; then
        echo "✅ Successfully pulled $image"
    else
        echo "❌ Failed to pull $image"
        failed_images+=("$image")
    fi
done

echo ""
echo "----------------------------------------"
echo "Docker Image Pull Summary:"
echo "----------------------------------------"

# Check results
if [ ${#failed_images[@]} -eq 0 ]; then
    echo "✅ All images pulled successfully!"
else
    echo "⚠️  Some images failed to pull:"
    for image in "${failed_images[@]}"; do
        echo "  - $image"
    done
    echo ""
    echo "You can try pulling failed images manually with:"
    echo "docker pull <image-name>"
fi

# Test Docker socket access
echo ""
echo "Testing Docker socket access..."
if [ -S /var/run/docker.sock ]; then
    echo "✅ Docker socket is accessible"
else
    echo "⚠️  Docker socket not found at /var/run/docker.sock"
    echo "The application may need to be configured for your Docker setup"
fi

# Create Docker network for testing tools
echo ""
echo "Creating Docker network for security tools..."
docker network create restraint-network 2>/dev/null || echo "Network already exists"

echo ""
echo "Stage 3 Complete! ✅"
echo ""
echo "Docker infrastructure is ready"
echo "Next: Run stage4-core-updates.sh to update core files"
#!/bin/bash

# SOC2 Testing Platform - Docker Cleanup Script
# This script cleans up Docker containers, volumes, and networks

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧹 SOC2 Testing Platform - Docker Cleanup"
echo "========================================"

# Parse command line arguments
FORCE=false
CLEAN_VOLUMES=false
CLEAN_IMAGES=false
PRUNE_SYSTEM=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --force|-f)
      FORCE=true
      shift
      ;;
    --volumes|-v)
      CLEAN_VOLUMES=true
      shift
      ;;
    --images|-i)
      CLEAN_IMAGES=true
      shift
      ;;
    --prune|-p)
      PRUNE_SYSTEM=true
      shift
      ;;
    --all|-a)
      CLEAN_VOLUMES=true
      CLEAN_IMAGES=true
      PRUNE_SYSTEM=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 [--force] [--volumes] [--images] [--prune] [--all]"
      exit 1
      ;;
  esac
done

# Confirmation prompt
if [ "$FORCE" != true ]; then
    echo -e "${YELLOW}This will stop and remove Docker containers.${NC}"
    if [ "$CLEAN_VOLUMES" = true ]; then
        echo -e "${YELLOW}⚠️  WARNING: This will also remove volumes (data will be lost!)${NC}"
    fi
    if [ "$CLEAN_IMAGES" = true ]; then
        echo -e "${YELLOW}This will also remove Docker images.${NC}"
    fi
    read -p "Are you sure you want to continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
fi

# Stop containers
echo -e "${YELLOW}Stopping containers...${NC}"
docker-compose down

# Remove volumes if requested
if [ "$CLEAN_VOLUMES" = true ]; then
    echo -e "${YELLOW}Removing volumes...${NC}"
    docker-compose down -v
fi

# Remove images if requested
if [ "$CLEAN_IMAGES" = true ]; then
    echo -e "${YELLOW}Removing images...${NC}"
    docker-compose down --rmi all
fi

# Clean up orphaned containers
echo -e "${YELLOW}Cleaning up orphaned containers...${NC}"
docker container prune -f

# Clean up unused networks
echo -e "${YELLOW}Cleaning up unused networks...${NC}"
docker network prune -f

# System prune if requested
if [ "$PRUNE_SYSTEM" = true ]; then
    echo -e "${YELLOW}Running system prune...${NC}"
    docker system prune -f
    if [ "$CLEAN_VOLUMES" = true ]; then
        docker volume prune -f
    fi
fi

# Show disk usage
echo -e "${GREEN}Current Docker disk usage:${NC}"
docker system df

echo -e "${GREEN}✅ Docker cleanup complete!${NC}"
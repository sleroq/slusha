#!/usr/bin/env bash

set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")
cd "$(dirname "$SCRIPTPATH")"

IMAGE_NAME="slusha"
TAG="latest"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  -t, --tag TAG     Set image tag (default: latest)"
            echo "  -n, --name NAME   Set image name (default: slusha-bot)"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

echo "Building Docker image: $FULL_IMAGE_NAME"
echo "Build context: $(pwd)"

docker build -t "$FULL_IMAGE_NAME" .

echo "Docker image built successfully: $FULL_IMAGE_NAME"
echo ""
echo "To run the container:"
echo "  docker run -d --name slusha-bot --restart unless-stopped \\"
echo "    -e BOT_TOKEN=your_bot_token \\"
echo "    -e AI_TOKEN=your_ai_token \\"
echo "    $FULL_IMAGE_NAME" 
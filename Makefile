# Docker image name
IMAGE_NAME = retcon-black-mountain
CONTAINER_NAME = retcon-black-mountain-container
PORT = 3000

# Default target
.PHONY: help
help:
	@echo "Available commands:"
	@echo "  build    - Build the Docker image"
	@echo "  run      - Run the container (detached)"
	@echo "  dev      - Run the container interactively"
	@echo "  stop     - Stop the running container"
	@echo "  restart  - Restart the container"
	@echo "  logs     - Show container logs"
	@echo "  shell    - Open shell in running container"
	@echo "  clean    - Remove container and image"
	@echo "  rebuild  - Clean and rebuild everything"

# Build the Docker image
.PHONY: build
build:
	docker build -t $(IMAGE_NAME) .

# Run container in detached mode
.PHONY: run
run:
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) $(IMAGE_NAME)
	@echo "Container started at http://localhost:$(PORT)"

# Run container interactively (for development)
.PHONY: dev
dev:
	docker run -it --rm --name $(CONTAINER_NAME) -p $(PORT):$(PORT) $(IMAGE_NAME)

# Stop the container
.PHONY: stop
stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

# Restart the container
.PHONY: restart
restart: stop run

# Show container logs
.PHONY: logs
logs:
	docker logs -f $(CONTAINER_NAME)

# Open shell in running container
.PHONY: shell
shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

# Clean up container and image
.PHONY: clean
clean:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)
	-docker rmi $(IMAGE_NAME)

# Rebuild everything from scratch
.PHONY: rebuild
rebuild: clean build

# Check if container is running
.PHONY: status
status:
	@docker ps --filter name=$(CONTAINER_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
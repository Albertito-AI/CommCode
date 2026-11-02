FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
USER node
CMD ["node", "--version"]

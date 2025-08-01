# docker/ollama-llm/Dockerfile
# This container provides a local LLM for AI agent test generation
# NOT used for embeddings - embeddings are handled by OpenAI API
FROM ollama/ollama:latest

# Install models during build (optional, can be done at runtime)
# RUN ollama pull llama2
# RUN ollama pull mistral

# Set up volume for model storage
VOLUME /root/.ollama

# Expose Ollama API port
EXPOSE 11434

# Default command
CMD ["serve"]
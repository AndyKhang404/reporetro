# Local GGUF Models Directory

Place any `.gguf` model files here if you wish to run `llama-server` with a local model offline.

For example, download Google Gemma 2 2B Instruct:
```bash
# Recommended model:
# bartowski/gemma-2-2b-it-GGUF / gemma-2-2b-it-Q4_K_M.gguf
```

If no local file is placed here, `docker compose up llama-server` will automatically download and cache `gemma-2-2b-it-Q4_K_M.gguf` from Hugging Face into the persistent `llama_cache` volume.

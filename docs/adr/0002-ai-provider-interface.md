# ADR 0002 Model interface and verification

Status: accepted.

Models return a structured plan and complete proposed source files. They do not
receive a shell, deployment authority, GitHub credentials or arbitrary URL tool.
The server validates every path and budget, and the user reviews before applying.
Tests run through the independently configured execution adapter. The initial
providers are Ollama and a documented compatible chat contract.

This constrains agent flexibility but makes edits inspectable and recovery simpler.
A maximum of two repair calls bounds failure loops. Protocol fixture tests do not
prove live-model quality. Runtime, build and deployment status remain separate.

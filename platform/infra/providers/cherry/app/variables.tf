# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# =============================================================================
# TOPOLOGY & CONFIGURATION VARIABLES (from tfvars files)
# =============================================================================

variable "environment" {
  type        = string
  description = "Environment name (preview, prod, etc.)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource tagging"
}

variable "service_name" {
  type        = string
  description = "Service name for resource tagging"
}

variable "domain" {
  type        = string
  description = "FQDN served by Caddy (e.g., canary.cognidao.org)"
}

variable "host" {
  type        = string
  description = "Public IP or DNS of the VM to deploy to"
}

variable "ssh_user" {
  type        = string
  description = "SSH user for connecting to the VM"
  default     = "root"
}

variable "vm_size" {
  type        = string
  description = "VM size designation for documentation/planning"
}

variable "app_port" {
  type        = number
  description = "Port the application runs on"
  default     = 3000
}

variable "litellm_port" {
  type        = number
  description = "Port for LiteLLM service"
  default     = 4000
}

variable "litellm_host" {
  type        = string
  description = "Host for LiteLLM service"
  default     = "127.0.0.1"
}

variable "healthcheck_path" {
  type        = string
  description = "Path for health check endpoint"
  default     = "/api/v1/meta/health"
}

# =============================================================================
# DYNAMIC VARIABLES (from CI/environment)
# =============================================================================

variable "app_image" {
  type        = string
  description = "Docker image to deploy (set by CI: ghcr.io/cogni-dao/cogni-template:app-abc123)"
}

# =============================================================================
# SECRETS (from GitHub Environment Secrets → CI env vars)
# =============================================================================

variable "ssh_private_key" {
  type        = string
  description = "SSH private key in PEM format (from GitHub secrets)"
  sensitive   = true
}

variable "database_url" {
  type        = string
  description = "Database connection URL (from GitHub secrets)"
  sensitive   = true
}

variable "litellm_master_key" {
  type        = string
  description = "LiteLLM master key for authentication (from GitHub secrets)"
  sensitive   = true
}

variable "openrouter_api_key" {
  type        = string
  description = "OpenRouter API key for LLM access (from GitHub secrets)"
  sensitive   = true
}
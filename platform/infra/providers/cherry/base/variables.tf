# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Ensure you separately `export CHERRY_AUTH_TOKEN=<token>`

# Environment separation (required)
variable "environment" {
  description = "Environment name (preview, prod)"
  type        = string
}

variable "vm_name_prefix" {
  description = "VM name prefix (combined with environment)"
  type        = string
}

# Cherry Servers config (required)
variable "project_id" {
  description = "Cherry Servers project ID"
  type        = string
}

variable "plan" {
  description = "Server plan slug"
  type        = string
}

variable "region" {
  description = "Deployment region"
  type        = string
}

variable "public_key_path" {
  description = "Path to SSH public key"
  type        = string
  # No default - specified in env.*.tfvars
}


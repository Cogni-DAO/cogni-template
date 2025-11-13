# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Ensure you separately `export CHERRY_AUTH_KEY=<key>`

variable "project_id" {
  description = "Cherry Servers project ID"
  type        = string
}

variable "region" {
  description = "Deployment region (e.g., eu_nord_1)"
  type        = string
  default     = "eu_nord_1"
}

variable "image" {
  description = "OS image slug"
  type        = string
  default     = "ubuntu_22_04"
}

variable "plan" {
  description = "Server plan slug"
  type        = string
  default     = "cloud_vps_1"
}

variable "hostname" {
  description = "Server hostname"
  type        = string
  default     = "cogni-canary"
}

variable "public_key_path" {
  description = "Path to your SSH public key"
  type        = string
  default     = "~/.ssh/derekg_cogni_canary.pub"
}

variable "tags" {
  description = "Optional tags"
  type        = map(string)
  default     = {}
}


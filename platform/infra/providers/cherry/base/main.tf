# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

terraform {
    required_providers {
        cherryservers = {
            source = "cherryservers/cherryservers"
        }
    }
    # TODO: Configure remote backend when ready
    # backend "s3" {
    #   bucket = "your-terraform-state-bucket"
    #   key    = "cherry-base-${var.environment}.tfstate"
    #   region = "us-east-1"
    # }
}
# Set the variable value in variables.tf file.
# Ensure the CHERRY_AUTH_TOKEN or CHERRY_AUTH_TOKEN environment variable is set and Exported: https://portal.cherryservers.com/settings/api-keys
# 

#Create a new server:
resource "cherryservers_server" "server" {
    plan         = var.plan
    hostname     = "${var.environment}-${var.vm_name_prefix}"
    project_id   = var.project_id
    region       = var.region
    image        = "ubuntu_22_04"
    ssh_key_ids  = [cherryservers_ssh_key.key.id]
    user_data    = base64encode(file("${path.module}/bootstrap.yaml"))
    allow_reinstall = true
    
    lifecycle {
        ignore_changes = [user_data]
    }
}

resource "cherryservers_ssh_key" "key" {
    name       = "cogni-${var.environment}-deploy"
    public_key = file("${path.module}/${var.public_key_path}")
}

output "vm_host" {
  description = "Public IP address of the provisioned VM"
  value       = [for ip in cherryservers_server.server.ip_addresses : ip.address if ip.type == "primary-ip"][0]
  sensitive   = false
}
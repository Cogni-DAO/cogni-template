# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

terraform {
    required_providers {
    cherryservers = {
        source = "cherryservers/cherryservers"
    }
    }
}
# Set the variable value in variables.tf file.
# Ensure the CHERRY_AUTH_KEY or CHERRY_AUTH_TOKEN environment variable is set and Exported: https://portal.cherryservers.com/settings/api-keys
# 

#Create a new server:
resource "cherryservers_server" "server" {
    plan         = var.plan
    hostname     = var.hostname
    project_id   = var.project_id
    region       = var.region
    image        = var.image
    ssh_key_ids  = [cherryservers_ssh_key.my_ssh_key.id]
    user_data    = base64encode(file("${path.module}/bootstrap.yaml"))
    
    lifecycle {
        ignore_changes = [user_data]
    }
}


resource "cherryservers_ssh_key" "my_ssh_key" {
    name       = "cogni-key"
    public_key = file(var.public_key_path)
}
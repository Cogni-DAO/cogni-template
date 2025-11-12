# SPDX-License-Identifier: PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni DAO

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
    user_data    = base64encode(templatefile("${path.module}/cloud-init.tmpl.yaml", {
        domain = var.domain
    }))
}

resource "null_resource" "wait_http_ok" {
  depends_on = [cherryservers_server.server]
  provisioner "local-exec" {
    command = "bash -lc 'for i in {1..60}; do curl -fsS https://${var.domain}/api/v1/meta/health && exit 0; sleep 5; done; exit 1'"
  }
}

resource "cherryservers_ssh_key" "my_ssh_key" {
    name       = "cogni-key"
    public_key = file(var.public_key_path)
}
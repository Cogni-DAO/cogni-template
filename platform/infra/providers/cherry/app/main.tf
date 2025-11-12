# SPDX-License-Identifier: PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni DAO

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# Deploy app via SSH
resource "null_resource" "deploy_app" {
  triggers = {
    app_image = var.app_image
    domain    = var.domain
  }

  connection {
    type        = "ssh"
    host        = var.host
    user        = var.ssh_user
    private_key = var.ssh_private_key
    timeout     = "2m"
  }

  # Upload rendered Caddyfile
  provisioner "file" {
    content     = templatefile("${path.module}/files/Caddyfile.tmpl", { domain = var.domain })
    destination = "/etc/caddy/Caddyfile"
  }

  # Deploy containers (same order as old cloud-init)
  provisioner "remote-exec" {
    inline = [
      "docker network create web || true",
      "docker pull ${var.app_image}",
      "docker rm -f app caddy || true",
      "docker run -d --name app --network web --restart=always ${var.app_image}",
      "docker run -d --name caddy --network web --restart=always -p 80:80 -p 443:443 -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v caddy_data:/data -v caddy_config:/config caddy:2",
      "docker ps"
    ]
  }
}

# HTTP health gate
resource "null_resource" "wait_http_ok" {
  depends_on = [null_resource.deploy_app]
  
  provisioner "local-exec" {
    command = "bash -lc 'for i in {1..60}; do curl -fsS https://${var.domain}/api/v1/meta/health && exit 0; sleep 5; done; exit 1'"
  }
}
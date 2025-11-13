# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

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

  # Create required directories
  provisioner "remote-exec" {
    inline = [
      "mkdir -p /etc/promtail /var/lib/promtail"
    ]
  }

  # Upload Promtail configuration
  provisioner "file" {
    source      = "${path.module}/../../../services/loki-promtail/promtail-config.yaml"
    destination = "/etc/promtail/config.yaml"
  }

  # Deploy containers with monitoring
  provisioner "remote-exec" {
    inline = [
      "docker network create web || true",
      "docker pull ${var.app_image}",
      "docker rm -f app caddy promtail || true",
      "docker run -d --name app --network web --restart=always ${var.app_image}",
      "docker run -d --name caddy --network web --restart=always -p 80:80 -p 443:443 -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v caddy_data:/data -v caddy_config:/config caddy:2",
      "docker run -d --name promtail --network web --restart=always -v /etc/promtail/config.yaml:/etc/promtail/config.yaml:ro -v /var/lib/promtail:/var/lib/promtail -v /var/run/docker.sock:/var/run/docker.sock:ro -v /var/lib/docker/containers:/var/lib/docker/containers:ro grafana/promtail:2.9.0 -config.file=/etc/promtail/config.yaml",
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
#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO
"""Idempotently register one pre-materialized node key with LiteLLM.

The two secrets arrive on stdin (master, then virtual key). They are never
accepted on argv, written to disk, or included in output/error messages.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

KEY_BUDGET_USD = 25
KEY_BUDGET_DURATION = "30d"
KEY_ALLOWED_ROUTES = ["llm_api_routes"]
KEY_PATTERN = re.compile(r"^sk-[A-Za-z0-9._-]{16,256}$")


def fail(message: str) -> None:
    print(f"reconcile-litellm-node-key: {message}", file=sys.stderr)
    raise SystemExit(1)


def request(
    *, base_url: str, master_key: str, path: str, method: str = "GET", body: dict | None = None
) -> tuple[int, Any]:
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"authorization": f"Bearer {master_key}"}
    if payload is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}", data=payload, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        error.read()  # discard: upstream errors may contain the submitted key
        return error.code, None
    except (OSError, urllib.error.URLError) as error:
        fail(f"LiteLLM request unavailable ({type(error).__name__})")


def list_alias(*, base_url: str, master_key: str, alias: str) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(
        {"key_alias": alias, "size": 2, "return_full_object": "true"}
    )
    status, payload = request(
        base_url=base_url, master_key=master_key, path=f"/key/list?{query}"
    )
    if status != 200 or not isinstance(payload, dict):
        fail(f"LiteLLM key list failed (HTTP {status})")
    count = payload.get("total_count")
    rows = payload.get("keys")
    if not isinstance(count, int) or not isinstance(rows, list) or count != len(rows):
        fail("LiteLLM key list returned an invalid shape")
    if count > 1:
        fail("LiteLLM key alias is ambiguous")
    if any(not isinstance(row, dict) for row in rows):
        fail("LiteLLM key list returned an invalid row")
    return rows


def assert_identity(row: dict[str, Any], expected_hash: str) -> None:
    if row.get("token") != expected_hash:
        fail("LiteLLM alias points at a different key")


def policy_drift(row: dict[str, Any], metadata: dict[str, str]) -> dict[str, Any]:
    drift: dict[str, Any] = {}
    if row.get("max_budget") != KEY_BUDGET_USD:
        drift["max_budget"] = KEY_BUDGET_USD
    # Sending budget_duration recalculates budget_reset_at in this pinned image,
    # so include it only when the persisted duration actually differs.
    if row.get("budget_duration") != KEY_BUDGET_DURATION:
        drift["budget_duration"] = KEY_BUDGET_DURATION
    if row.get("allowed_routes") != KEY_ALLOWED_ROUTES:
        drift["allowed_routes"] = KEY_ALLOWED_ROUTES
    if row.get("metadata") != metadata:
        drift["metadata"] = metadata
    return drift


def update_if_drifted(
    *,
    base_url: str,
    master_key: str,
    virtual_key: str,
    row: dict[str, Any],
    metadata: dict[str, str],
) -> bool:
    drift = policy_drift(row, metadata)
    if not drift:
        return False
    status, _ = request(
        base_url=base_url,
        master_key=master_key,
        path="/key/update",
        method="POST",
        body={"key": virtual_key, **drift},
    )
    if not 200 <= status < 300:
        fail(f"LiteLLM key update failed (HTTP {status})")
    return True


def main() -> None:
    if len(sys.argv) != 5:
        fail("usage: <base-url> <environment> <node-slug> <node-id>")
    base_url, environment, node_slug, node_id = sys.argv[1:]
    master_key = sys.stdin.buffer.readline().rstrip(b"\r\n").decode()
    virtual_key = sys.stdin.buffer.readline().rstrip(b"\r\n").decode()
    if not KEY_PATTERN.fullmatch(master_key) or not KEY_PATTERN.fullmatch(virtual_key):
        fail("master and virtual keys must be valid sk-* values")

    alias = f"cogni:{environment}:{node_id}:app:v1"
    metadata = {
        "managed_by": "cogni-node-substrate",
        "environment": environment,
        "node_slug": node_slug,
        "node_id": node_id,
    }
    expected_hash = hashlib.sha256(virtual_key.encode()).hexdigest()
    rows = list_alias(base_url=base_url, master_key=master_key, alias=alias)
    if rows:
        assert_identity(rows[0], expected_hash)
        action = (
            "updated"
            if update_if_drifted(
                base_url=base_url,
                master_key=master_key,
                virtual_key=virtual_key,
                row=rows[0],
                metadata=metadata,
            )
            else "unchanged"
        )
    else:
        status, payload = request(
            base_url=base_url,
            master_key=master_key,
            path="/key/generate",
            method="POST",
            body={
                "key": virtual_key,
                "key_alias": alias,
                "key_type": "llm_api",
                "max_budget": KEY_BUDGET_USD,
                "budget_duration": KEY_BUDGET_DURATION,
                "metadata": metadata,
            },
        )
        if 200 <= status < 300:
            if not isinstance(payload, dict) or payload.get("key") != virtual_key:
                fail("LiteLLM generated-key response did not match the requested key")
            action = "created"
        else:
            # Alias precheck is racy, while the exact key hash is the DB primary
            # key. A concurrent winner is safe only if alias+hash now converge.
            rows = list_alias(base_url=base_url, master_key=master_key, alias=alias)
            if not rows:
                fail(f"LiteLLM key generation failed (HTTP {status})")
            assert_identity(rows[0], expected_hash)
            action = "updated-after-create-race"

    rows = list_alias(base_url=base_url, master_key=master_key, alias=alias)
    if len(rows) != 1:
        fail("LiteLLM key postcondition is missing")
    assert_identity(rows[0], expected_hash)
    if update_if_drifted(
        base_url=base_url,
        master_key=master_key,
        virtual_key=virtual_key,
        row=rows[0],
        metadata=metadata,
    ):
        rows = list_alias(base_url=base_url, master_key=master_key, alias=alias)
        if len(rows) != 1:
            fail("LiteLLM key update postcondition is missing")
        assert_identity(rows[0], expected_hash)
        if policy_drift(rows[0], metadata):
            fail("LiteLLM key policy failed to converge")
        action = "updated" if action != "created" else action
    print(f"LiteLLM node key {action}: {environment}/{node_slug}")


if __name__ == "__main__":
    main()

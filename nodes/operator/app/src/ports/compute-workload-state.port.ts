// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import type {
  ComputeWorkload,
  ComputeWorkloadStatus,
} from "./compute-workload.types";

export interface ComputeWorkloadStatePort {
  list(): Promise<readonly ComputeWorkload[]>;
  patchMetadata(input: {
    resource: ComputeWorkload;
    annotations?: Readonly<Record<string, string | null>>;
    finalizers?: readonly string[];
  }): Promise<void>;
  patchStatus(input: {
    resource: ComputeWorkload;
    status: ComputeWorkloadStatus;
  }): Promise<void>;
  event(input: {
    resource: ComputeWorkload;
    type: "Normal" | "Warning";
    reason: string;
    message: string;
  }): Promise<void>;
}

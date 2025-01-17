// Copyright (c) 2024 Sidero Labs, Inc.
//
// Use of this software is governed by the Business Source License
// included in the LICENSE file.

import { Runtime } from "@/api/common/omni.pb";
import { Code } from "@/api/google/rpc/code.pb";

import { Resource, ResourceService, ResourceTyped } from "@/api/grpc";
import { MachineLabelsSpec } from "@/api/omni/specs/omni.pb";
import { withRuntime } from "@/api/options";
import { DefaultNamespace, MachineLabelsType, MachineLocked, MachineSetNodeType, MachineStatusType, SiderolinkResourceType, SystemLabelPrefix } from "@/api/resources";
import { destroyNodes, destroyResources, getMachineConfigPatchesToDelete } from "@/methods/cluster";
import { parseLabels } from "@/methods/labels";

export const addMachineLabels = async (machineID: string, ...labels: string[]) => {
  let resource: Resource = {
    metadata: {
      type: MachineLabelsType,
      namespace: DefaultNamespace,
      id: machineID
    },
    spec: {},
  };

  let exists = true;
  try {
    resource = await ResourceService.Get(resource.metadata,
      withRuntime(Runtime.Omni),
    );
  } catch (e) {
    if (e.code !== Code.NOT_FOUND) {
      throw e;
    }

    exists = false;
  }

  resource.metadata.labels = {
    ...resource.metadata.labels,
    ...parseLabels(...labels)
  };

  if (exists) {
    await ResourceService.Update(resource, resource.metadata.version, withRuntime(
      Runtime.Omni,
    ));
  } else {
    const machine = await ResourceService.Get({
      type: MachineStatusType,
      namespace: DefaultNamespace,
      id: machineID,
    }, withRuntime(Runtime.Omni))

    copyUserLabels(machine, resource);

    await ResourceService.Create(resource, withRuntime(Runtime.Omni));
  }
};

export const removeMachineLabels = async (machineID: string, ...keys: string[]) => {
  let resource: ResourceTyped<MachineLabelsSpec>;
  const metadata = {
    id: machineID,
    type: MachineLabelsType,
    namespace: DefaultNamespace,
  };

  try {
    resource = await ResourceService.Get(metadata, withRuntime(Runtime.Omni));
  } catch (e) {
    if (e.code !== Code.NOT_FOUND) {
      throw e;
    }

    resource = {
      metadata,
      spec: {},
    }

    const machineStatus = await ResourceService.Get({...metadata, type: MachineStatusType}, withRuntime(Runtime.Omni));
    copyUserLabels(machineStatus, resource);

    await ResourceService.Create(resource, withRuntime(Runtime.Omni));
  }

  if (!resource.metadata.labels) {
    return;
  }

  for (const key of keys) {
    delete (resource.metadata.labels[key]);
  }

  if (Object.keys(resource.metadata.labels).length === 0) {
    await ResourceService.Delete({
      id: resource.metadata.id,
      type: resource.metadata.type,
      namespace: resource.metadata.namespace,
    }, withRuntime(Runtime.Omni));
  } else {
    await ResourceService.Update(resource, undefined, withRuntime(Runtime.Omni));
  }
}

export const removeMachine = async (id: string, cluster?: string) => {
  await ResourceService.Teardown({
    namespace: DefaultNamespace,
    type: SiderolinkResourceType,
    id: id,
  }, withRuntime(Runtime.Omni));

  // remove the machine from the cluster
  if (cluster) {
    await destroyNodes(cluster, [id], owner => owner !== "");
  }

  await ResourceService.Delete({
    namespace: DefaultNamespace,
    type: SiderolinkResourceType,
    id: id,
  }, withRuntime(Runtime.Omni));

  const patches = await getMachineConfigPatchesToDelete(id);
  await destroyResources(patches);
}

export const updateMachineLock = async (id: string, locked: boolean) => {
  const machine = await ResourceService.Get({
    namespace: DefaultNamespace,
    type: MachineSetNodeType,
    id: id,
  }, withRuntime(Runtime.Omni));

  if (!machine.metadata.annotations)
    machine.metadata.annotations = {}

  locked ? machine.metadata.annotations[MachineLocked] = "" : delete machine.metadata.annotations[MachineLocked];

  await ResourceService.Update(machine, undefined, withRuntime(Runtime.Omni));
}

const copyUserLabels = (src: Resource, dst: Resource) => {
  if (src.metadata.labels) {
    for (const key in src.metadata.labels) {
      if (key.indexOf(SystemLabelPrefix) === 0) {
        continue;
      }

      if (!dst.metadata.labels) {
        dst.metadata.labels = {};
      }

      dst.metadata.labels[key] = src.metadata.labels[key];
    }
  }
}

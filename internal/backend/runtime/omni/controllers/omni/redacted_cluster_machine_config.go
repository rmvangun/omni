// Copyright (c) 2024 Sidero Labs, Inc.
//
// Use of this software is governed by the Business Source License
// included in the LICENSE file.

package omni

import (
	"context"

	"github.com/cosi-project/runtime/pkg/controller"
	"github.com/cosi-project/runtime/pkg/controller/generic/qtransform"
	"github.com/siderolabs/crypto/x509"
	"github.com/siderolabs/talos/pkg/machinery/config/configloader"
	"github.com/siderolabs/talos/pkg/machinery/config/encoder"
	"go.uber.org/zap"

	"github.com/siderolabs/omni/client/pkg/omni/resources"
	"github.com/siderolabs/omni/client/pkg/omni/resources/omni"
)

// RedactedClusterMachineConfigController manages machine configurations for each ClusterMachine.
//
// RedactedClusterMachineConfigController generates machine configuration for each created machine.
type RedactedClusterMachineConfigController = qtransform.QController[*omni.ClusterMachineConfig, *omni.RedactedClusterMachineConfig]

// NewRedactedClusterMachineConfigController initializes RedactedClusterMachineConfigController.
func NewRedactedClusterMachineConfigController() *RedactedClusterMachineConfigController {
	return qtransform.NewQController(
		qtransform.Settings[*omni.ClusterMachineConfig, *omni.RedactedClusterMachineConfig]{
			Name: "RedactedClusterMachineConfigController",
			MapMetadataFunc: func(cmc *omni.ClusterMachineConfig) *omni.RedactedClusterMachineConfig {
				return omni.NewRedactedClusterMachineConfig(resources.DefaultNamespace, cmc.Metadata().ID())
			},
			UnmapMetadataFunc: func(cmcr *omni.RedactedClusterMachineConfig) *omni.ClusterMachineConfig {
				return omni.NewClusterMachineConfig(resources.DefaultNamespace, cmcr.Metadata().ID())
			},
			TransformFunc: func(_ context.Context, _ controller.Reader, _ *zap.Logger, cmc *omni.ClusterMachineConfig, cmcr *omni.RedactedClusterMachineConfig) error {
				data := cmc.TypedSpec().Value.GetData()

				if data == nil {
					cmcr.TypedSpec().Value.Data = ""

					return nil
				}

				config, err := configloader.NewFromBytes(cmc.TypedSpec().Value.GetData())
				if err != nil {
					return err
				}

				redactedData, err := config.RedactSecrets(x509.Redacted).EncodeBytes(encoder.WithComments(encoder.CommentsDisabled))
				if err != nil {
					return err
				}

				cmcr.TypedSpec().Value.Data = string(redactedData)

				return nil
			},
		},
	)
}

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO
pragma solidity ^0.8.17;

import {PermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/PermissionCondition.sol";
import {IPermissionCondition} from "@aragon/osx-commons-contracts/src/permission/condition/IPermissionCondition.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";

/**
 * @title DistributionPublishCondition
 * @notice Scoped Aragon OSx EXECUTE condition. Deployed ONCE per node, bound via
 *   `grantWithCondition(where=DAO, who=executor, EXECUTE_PERMISSION, condition=this)`.
 *   Thereafter the executor may call `DAO.execute` ONLY for an atomic compare-and-swap
 *   publish: `_callId` must equal the distributor's live root, `_allowFailureMap` must
 *   be zero, and the exact action set remains
 *   `[token.mint(distributor, *), distributor.setMerkleRoot(newRoot)]`.
 *   A compromised executor key can publish, never drain the treasury or re-permission.
 * @dev Extends Aragon's `PermissionCondition` abstract base — the BEST-PRACTICE way to
 *   author an OSx condition. The base derives from `ERC165` and implements
 *   `supportsInterface`, so `condition.supportsInterface(type(IPermissionCondition).interfaceId)`
 *   returns true — the exact ERC-165 check `PermissionManager.grantWithCondition` performs
 *   before accepting the condition (a hand-rolled interface that omitted this reverted with
 *   `ConditionInterfaceNotSupported` / `0xa6a7dbbd`). Pure view; no state, no reentrancy
 *   surface. `token` + `distributor` are immutable.
 *
 * Source of the OSx pieces (Aragon osx-commons-contracts 1.4.0):
 *   - PermissionCondition   from .../permission/condition/PermissionCondition.sol
 *   - IPermissionCondition  from same package; interfaceId == isGranted.selector
 *   - Action                from .../executors/IExecutor.sol
 *     (the {to, value, data} struct DAO.execute consumes; moved out of IDAO in 1.4).
 */
contract DistributionPublishCondition is PermissionCondition {
    /// @notice The node's GovernanceERC20 — the ONLY allowed `mint` target (action[0].to).
    address public immutable token;
    /// @notice The node's CumulativeMerkleDistributor — mint recipient AND `setMerkleRoot` target.
    address public immutable distributor;

    /// @dev bytes4(keccak256("mint(address,uint256)")) — GovernanceERC20 mint selector.
    bytes4 private constant MINT_SELECTOR = bytes4(keccak256("mint(address,uint256)"));
    /// @dev bytes4(keccak256("setMerkleRoot(bytes32)")) — distributor root-rotation selector.
    bytes4 private constant SET_MERKLE_ROOT_SELECTOR = bytes4(keccak256("setMerkleRoot(bytes32)"));

    constructor(address _token, address _distributor) {
        token = _token;
        distributor = _distributor;
    }

    /**
     * @notice Returns true ONLY when `_data` is a `DAO.execute` call whose action set is
     *   an atomic compare-and-swap publish with exactly
     *   `[token.mint(distributor, *), distributor.setMerkleRoot(newRoot)]`.
     * @dev `_where`/`_who`/`_permissionId` are unused: OSx already routed this condition to
     *   the (where=DAO, who=executor, EXECUTE_PERMISSION) grant, so the ONLY thing left to
     *   verify is the SHAPE of the requested execution. We inspect `_data` and nothing else.
     *   Overrides the `IPermissionCondition.isGranted` the base declares.
     */
    function isGranted(
        address, /* _where */
        address, /* _who */
        bytes32, /* _permissionId */
        bytes calldata _data
    )
        public
        view
        override
        returns (bool)
    {
        // `_data` is the full calldata of:
        //   DAO.execute(bytes32 _callId, Action[] _actions, uint256 _allowFailureMap)
        // Strip the 4-byte function selector, then decode the three args. `abi.decode`
        // handles the dynamic `Action[]` (a head offset pointing at the tail array) itself;
        // a malformed/short tail reverts inside `abi.decode` (a revert reads as "not granted"
        // to the caller). `_callId` is intentionally repurposed as the expected previous root.
        if (_data.length < 4) return false;
        (bytes32 expectedPreviousRoot, Action[] memory actions, uint256 allowFailureMap) =
            abi.decode(_data[4:], (bytes32, Action[], uint256));

        // Both actions are one economic state transition. Neither mint nor root rotation may
        // fail independently, and a payload built from a stale root must be denied before mint.
        if (allowFailureMap != 0) return false;
        (bool rootReadable, bytes32 liveRoot) = _tryLiveMerkleRoot();
        if (!rootReadable || expectedPreviousRoot != liveRoot) return false;

        // EXACTLY two actions: mint then setMerkleRoot. No third action, no fewer.
        if (actions.length != 2) return false;

        // ---- action[0]: token.mint(distributor, <anyAmount>) ----
        Action memory mintAction = actions[0];
        if (mintAction.to != token) return false; // must target the node token
        if (mintAction.value != 0) return false; // never sends ETH
        if (mintAction.data.length != 68) return false; // selector + address + uint256
        // First 4 bytes must be the mint selector.
        if (bytes4(mintAction.data) != MINT_SELECTOR) return false;
        // Decode (address to, uint256 amount) from the calldata AFTER the selector.
        // A short/garbled arg tail reverts in abi.decode ⇒ reads as not-granted.
        (address mintTo,) = abi.decode(_slice4(mintAction.data), (address, uint256));
        // The mint recipient MUST be the distributor — tokens can only be minted TO it.
        if (mintTo != distributor) return false;

        // ---- action[1]: distributor.setMerkleRoot(<anyRoot>) ----
        Action memory rootAction = actions[1];
        if (rootAction.to != distributor) return false; // must target the distributor
        if (rootAction.value != 0) return false; // never sends ETH
        if (rootAction.data.length != 36) return false; // selector + bytes32
        // First 4 bytes must be the setMerkleRoot selector.
        if (bytes4(rootAction.data) != SET_MERKLE_ROOT_SELECTOR) return false;
        bytes32 newRoot = abi.decode(_slice4(rootAction.data), (bytes32));
        if (newRoot == expectedPreviousRoot) return false;

        // All checks passed: this is a well-formed, in-scope publish. Grant.
        return true;
    }

    /**
     * @dev Read the distributor root inside permission evaluation: the on-chain CAS authority.
     */
    function _tryLiveMerkleRoot() private view returns (bool ok, bytes32 root) {
        bytes memory result;
        (ok, result) = distributor.staticcall(abi.encodeWithSelector(bytes4(keccak256("merkleRoot()"))));
        if (!ok || result.length != 32) return (false, bytes32(0));
        root = abi.decode(result, (bytes32));
        return (true, root);
    }

    /**
     * @dev Return `data` with its leading 4-byte selector removed, as `memory` bytes
     *   suitable for `abi.decode`. Callers guarantee `data.length >= 4`.
     */
    function _slice4(bytes memory data) private pure returns (bytes memory out) {
        uint256 len = data.length - 4;
        out = new bytes(len);
        for (uint256 i = 0; i < len;) {
            out[i] = data[i + 4];
            unchecked {
                ++i;
            }
        }
    }
}

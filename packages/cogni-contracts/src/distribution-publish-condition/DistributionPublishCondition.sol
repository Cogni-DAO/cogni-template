// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO
pragma solidity ^0.8.17;

/**
 * @dev Aragon OSx permission-condition interface. Standalone, INLINED (not imported
 * from the aragon packages) so this file compiles with no external deps. Matches OSx v1.3
 * `IPermissionCondition`: the DAO's `PermissionManager._auth` forwards the FULL
 * `execute` calldata (as `_data`) to the bound condition's `isGranted`.
 */
interface IPermissionCondition {
    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) external view returns (bool);
}

/**
 * @dev The OSx `Action` struct, INLINED. `DAO.execute` takes an `Action[]`; each
 * action is a `{to, value, data}` low-level call the DAO makes as msg.sender.
 * The layout MUST match OSx exactly so `abi.decode` reads it correctly.
 */
struct Action {
    address to;
    uint256 value;
    bytes data;
}

/**
 * @title DistributionPublishCondition
 * @notice Scoped Aragon OSx EXECUTE condition. Deployed ONCE per node, bound via
 *   `grantWithCondition(where=DAO, who=executor, EXECUTE_PERMISSION, condition=this)`.
 *   Thereafter the executor may call `DAO.execute` ONLY for the exact publish action
 *   set `[token.mint(distributor, *), distributor.setMerkleRoot(*)]` — nothing else.
 *   A compromised executor key can publish, never drain the treasury or re-permission.
 * @dev Pure view; no state, no reentrancy surface. `token` + `distributor` are immutable.
 */
contract DistributionPublishCondition is IPermissionCondition {
    /// @notice The node's GovernanceERC20 — the ONLY allowed `mint` target (action[0].to).
    address public immutable token;
    /// @notice The node's CumulativeMerkleDistributor — mint recipient AND `setMerkleRoot` target.
    address public immutable distributor;

    /// @dev bytes4(keccak256("mint(address,uint256)")) — GovernanceERC20 mint selector.
    bytes4 private constant MINT_SELECTOR = bytes4(keccak256("mint(address,uint256)"));
    /// @dev bytes4(keccak256("setMerkleRoot(bytes32)")) — distributor root-rotation selector.
    bytes4 private constant SET_MERKLE_ROOT_SELECTOR =
        bytes4(keccak256("setMerkleRoot(bytes32)"));

    constructor(address _token, address _distributor) {
        token = _token;
        distributor = _distributor;
    }

    /**
     * @notice Returns true ONLY when `_data` is a `DAO.execute` call whose action set is
     *   exactly `[token.mint(distributor, *), distributor.setMerkleRoot(*)]`.
     * @dev `_where`/`_who`/`_permissionId` are unused: OSx already routed this condition to
     *   the (where=DAO, who=executor, EXECUTE_PERMISSION) grant, so the ONLY thing left to
     *   verify is the SHAPE of the requested execution. We inspect `_data` and nothing else.
     */
    function isGranted(
        address, /* _where */
        address, /* _who */
        bytes32, /* _permissionId */
        bytes calldata _data
    ) external view override returns (bool) {
        // `_data` is the full calldata of:
        //   DAO.execute(bytes32 _callId, Action[] _actions, uint256 _allowFailureMap)
        // Strip the 4-byte function selector, then decode the three args. `abi.decode`
        // handles the dynamic `Action[]` (a head offset pointing at the tail array) itself;
        // a malformed/short tail reverts inside `abi.decode` (a revert reads as "not granted"
        // to the caller). We ignore _callId and _allowFailureMap — they don't affect scope.
        if (_data.length < 4) return false;
        (, Action[] memory actions, ) =
            abi.decode(_data[4:], (bytes32, Action[], uint256));

        // EXACTLY two actions: mint then setMerkleRoot. No third action, no fewer.
        if (actions.length != 2) return false;

        // ---- action[0]: token.mint(distributor, <anyAmount>) ----
        Action memory mintAction = actions[0];
        if (mintAction.to != token) return false; // must target the node token
        if (mintAction.value != 0) return false; // never sends ETH
        if (mintAction.data.length < 4) return false; // need at least a selector
        // First 4 bytes must be the mint selector.
        if (bytes4(mintAction.data) != MINT_SELECTOR) return false;
        // Decode (address to, uint256 amount) from the calldata AFTER the selector.
        // A short/garbled arg tail reverts in abi.decode ⇒ reads as not-granted.
        (address mintTo, ) = abi.decode(_slice4(mintAction.data), (address, uint256));
        // The mint recipient MUST be the distributor — tokens can only be minted TO it.
        if (mintTo != distributor) return false;

        // ---- action[1]: distributor.setMerkleRoot(<anyRoot>) ----
        Action memory rootAction = actions[1];
        if (rootAction.to != distributor) return false; // must target the distributor
        if (rootAction.value != 0) return false; // never sends ETH
        if (rootAction.data.length < 4) return false; // need at least a selector
        // First 4 bytes must be the setMerkleRoot selector. The bytes32 root arg is
        // unconstrained by design — the manifest, off-chain, decides the root.
        if (bytes4(rootAction.data) != SET_MERKLE_ROOT_SELECTOR) return false;

        // All checks passed: this is a well-formed, in-scope publish. Grant.
        return true;
    }

    /**
     * @dev Return `data` with its leading 4-byte selector removed, as `memory` bytes
     *   suitable for `abi.decode`. Callers guarantee `data.length >= 4`.
     */
    function _slice4(bytes memory data) private pure returns (bytes memory out) {
        uint256 len = data.length - 4;
        out = new bytes(len);
        for (uint256 i = 0; i < len; ) {
            out[i] = data[i + 4];
            unchecked {
                ++i;
            }
        }
    }
}

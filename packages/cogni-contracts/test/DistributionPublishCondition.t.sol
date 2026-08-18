// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO
pragma solidity ^0.8.17;

import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {DistributionPublishCondition} from "../src/distribution-publish-condition/DistributionPublishCondition.sol";

contract MockMerkleDistributor {
    bytes32 public merkleRoot;

    function setLiveRoot(bytes32 root) external {
        merkleRoot = root;
    }
}

contract UnreadableMerkleDistributor {}

contract DistributionPublishConditionTest {
    bytes4 private constant EXECUTE_SELECTOR = bytes4(keccak256("execute(bytes32,(address,uint256,bytes)[],uint256)"));
    bytes4 private constant MINT_SELECTOR = bytes4(keccak256("mint(address,uint256)"));
    bytes4 private constant SET_ROOT_SELECTOR = bytes4(keccak256("setMerkleRoot(bytes32)"));

    address private constant TOKEN = address(0x1111);
    bytes32 private constant ROOT_ONE = bytes32(uint256(1));
    bytes32 private constant ROOT_TWO = bytes32(uint256(2));

    MockMerkleDistributor private distributor;
    DistributionPublishCondition private condition;

    function setUp() public {
        distributor = new MockMerkleDistributor();
        condition = new DistributionPublishCondition(TOKEN, address(distributor));
    }

    function testStaleSecondPublishIsDeniedBeforeExecution() public {
        bytes memory firstPublish = _publishData(bytes32(0), ROOT_ONE, 0);
        require(_isGranted(firstPublish), "fresh publish denied");

        distributor.setLiveRoot(ROOT_ONE);

        require(!_isGranted(firstPublish), "stale publish remained authorized");
        require(_isGranted(_publishData(ROOT_ONE, ROOT_TWO, 0)), "next CAS publish denied");
    }

    function testAllowFailureMapIsRejected() public view {
        require(!_isGranted(_publishData(bytes32(0), ROOT_ONE, 1)), "failure bitmap allowed");
    }

    function testRootMustAdvance() public {
        distributor.setLiveRoot(ROOT_ONE);
        require(!_isGranted(_publishData(ROOT_ONE, ROOT_ONE, 0)), "same root allowed");
    }

    function testWrongTargetsAreRejected() public view {
        Action[] memory actions = _validActions(address(distributor), ROOT_ONE);
        actions[0].to = address(0x9999);
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "wrong mint target allowed");

        actions = _validActions(address(distributor), ROOT_ONE);
        actions[0].data = abi.encodeWithSelector(MINT_SELECTOR, address(0x9999), uint256(1));
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "wrong mint recipient allowed");

        actions = _validActions(address(distributor), ROOT_ONE);
        actions[1].to = address(0x9999);
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "wrong root target allowed");
    }

    function testWrongActionOrderIsRejected() public view {
        Action[] memory actions = _validActions(address(distributor), ROOT_ONE);
        (actions[0], actions[1]) = (actions[1], actions[0]);
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "swapped actions allowed");
    }

    function testNonCanonicalCalldataLengthsAreRejected() public view {
        Action[] memory actions = _validActions(address(distributor), ROOT_ONE);
        actions[0].data = bytes.concat(actions[0].data, hex"00");
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "long mint calldata allowed");

        actions = _validActions(address(distributor), ROOT_ONE);
        actions[0].data = abi.encodePacked(MINT_SELECTOR);
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "short mint calldata allowed");

        actions = _validActions(address(distributor), ROOT_ONE);
        actions[1].data = bytes.concat(actions[1].data, hex"00");
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "long root calldata allowed");

        actions = _validActions(address(distributor), ROOT_ONE);
        actions[1].data = abi.encodePacked(SET_ROOT_SELECTOR);
        require(!_isGranted(_executeData(bytes32(0), actions, 0)), "short root calldata allowed");
    }

    function testWrongActionCountsAreRejected() public view {
        Action[] memory actions = _validActions(address(distributor), ROOT_ONE);
        Action[] memory tooFew = new Action[](1);
        tooFew[0] = actions[0];
        require(!_isGranted(_executeData(bytes32(0), tooFew, 0)), "one action allowed");

        Action[] memory tooMany = new Action[](3);
        tooMany[0] = actions[0];
        tooMany[1] = actions[1];
        tooMany[2] = actions[1];
        require(!_isGranted(_executeData(bytes32(0), tooMany, 0)), "three actions allowed");
    }

    function testUnreadableLiveRootFailsClosed() public {
        UnreadableMerkleDistributor unreadable = new UnreadableMerkleDistributor();
        DistributionPublishCondition guarded = new DistributionPublishCondition(TOKEN, address(unreadable));
        bytes memory data = _publishDataFor(address(unreadable), bytes32(0), ROOT_ONE, 0);
        require(!guarded.isGranted(address(0), address(0), bytes32(0), data), "unreadable root allowed");
    }

    function _isGranted(bytes memory data) private view returns (bool) {
        return condition.isGranted(address(0), address(0), bytes32(0), data);
    }

    function _publishData(bytes32 expectedRoot, bytes32 newRoot, uint256 allowFailureMap)
        private
        view
        returns (bytes memory)
    {
        return _publishDataFor(address(distributor), expectedRoot, newRoot, allowFailureMap);
    }

    function _publishDataFor(address targetDistributor, bytes32 expectedRoot, bytes32 newRoot, uint256 allowFailureMap)
        private
        pure
        returns (bytes memory)
    {
        return _executeData(expectedRoot, _validActions(targetDistributor, newRoot), allowFailureMap);
    }

    function _validActions(address targetDistributor, bytes32 newRoot) private pure returns (Action[] memory actions) {
        actions = new Action[](2);
        actions[0] =
            Action({to: TOKEN, value: 0, data: abi.encodeWithSelector(MINT_SELECTOR, targetDistributor, uint256(1))});
        actions[1] = Action({to: targetDistributor, value: 0, data: abi.encodeWithSelector(SET_ROOT_SELECTOR, newRoot)});
    }

    function _executeData(bytes32 expectedRoot, Action[] memory actions, uint256 allowFailureMap)
        private
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(EXECUTE_SELECTOR, expectedRoot, actions, allowFailureMap);
    }
}

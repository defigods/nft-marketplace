//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./INFT.sol";

contract RandomNumberGenerator is Ownable, VRFConsumerBase {
    address public admin;
    bytes32 private keyHash;
    uint256 private fee;
    address public collection;
    mapping(bytes32 => uint256) private randomNumbers;

    constructor(address collection_)
        VRFConsumerBase(
            0x3d2341ADb2D31f1c5530cDC622016af293177AE0, // VRF Coordinator Polygon
            0xb0897686c545045aFc77CF20eC7A532E3120E0F1 // LINK Token Polygon
        )
    {
        keyHash = 0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4;
        fee = 0.0001 * 10**18;
        admin = msg.sender;
        collection = collection_;
    }

    function setCollction(address collection_) external onlyOwner {
        collection = collection_;
    }

    function getRandomNumber() external returns (bytes32 requestId) {
        require(msg.sender == collection, "RNG: NOT_COLLECTION");
        require(LINK.balanceOf(address(this)) >= fee, "RNG: INSUFFICIENT_LINK");
        return requestRandomness(keyHash, fee);
    }

    /// @notice Receive random number
    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
        randomNumbers[requestId] = randomness;
        INFT(collection).fulfillRandomness(requestId, randomness);
    }

    function hasReceivedRandomness(bytes32 requestId) public view returns (bool) {
        return randomNumbers[requestId] > 0;
    }
}

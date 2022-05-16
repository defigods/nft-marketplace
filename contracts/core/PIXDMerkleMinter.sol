//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

import "../interfaces/IPIXD.sol";

contract PIXDMerkleMinter is OwnableUpgradeable {
    mapping(bytes32 => bool) public merkleRoots;
    mapping(bytes32 => bool) public leafUsed;

    IPIXD public pixD;

    mapping(address => bool) public delegateMinters;

    function initialize(address _pixD) external initializer {
        require(_pixD != address(0), "PixD: INVALID_PIX");
        __Ownable_init();

        pixD = IPIXD(_pixD);
    }

    function setMerkleRoot(bytes32 _merkleRoot, bool add) external onlyOwner {
        merkleRoots[_merkleRoot] = add;
    }

    function mintByProof(
        address to,
        uint256 tokenId,
        bytes32 merkleRoot,
        bytes32[] calldata merkleProofs
    ) public {
        require(merkleRoots[merkleRoot], "PixD: invalid root");
        bytes32 leaf = keccak256(abi.encode(to, tokenId));
        require(!leafUsed[leaf], "PixD: already minted");
        leafUsed[leaf] = true;
        require(
            MerkleProofUpgradeable.verify(merkleProofs, merkleRoot, leaf),
            "PixD: invalid proof"
        );
        pixD.mint(to, tokenId);
    }

    function mintByProofInBatch(
        address to,
        uint256[] memory tokenIds,
        bytes32[] calldata merkleRoot,
        bytes32[][] calldata merkleProofs
    ) external {
        require(
            tokenIds.length == merkleRoot.length && tokenIds.length == merkleProofs.length,
            "PixD: invalid length"
        );
        uint256 len = tokenIds.length;
        for (uint256 i; i < len; i += 1) {
            mintByProof(to, tokenIds[i], merkleRoot[i], merkleProofs[i]);
        }
    }

    function setDelegateMinter(address _minter, bool enabled) external onlyOwner {
        delegateMinters[_minter] = enabled;
    }

    function mintToNewOwner(
        address destination,
        address oldOwner,
        uint256 tokenId,
        bytes32 merkleRoot,
        bytes32[] calldata merkleProofs
    ) public {
        require(delegateMinters[msg.sender], "PixD: not delegate minter");
        require(merkleRoots[merkleRoot], "PixD: invalid root");
        bytes32 leaf = keccak256(abi.encode(oldOwner, tokenId));
        require(!leafUsed[leaf], "PixD: already minted");
        leafUsed[leaf] = true;
        require(
            MerkleProofUpgradeable.verify(merkleProofs, merkleRoot, leaf),
            "PixD: invalid proof"
        );
        pixD.mint(destination, tokenId);
    }

    function mintToNewOwnerInBatch(
        address destination,
        address oldOwner,
        uint256[] memory tokenIds,
        bytes32[] calldata merkleRoot,
        bytes32[][] calldata merkleProofs
    ) external {
        require(
            tokenIds.length > 0 &&
                tokenIds.length == merkleRoot.length &&
                tokenIds.length == merkleProofs.length,
            "PixD: invalid length"
        );
        uint256 len = tokenIds.length;
        for (uint256 i; i < len; i += 1) {
            mintToNewOwner(destination, oldOwner, tokenIds[i], merkleRoot[i], merkleProofs[i]);
        }
    }

    function disableProof(
        address to,
        uint256 tokenId,
        bytes32 merkleRoot,
        bytes32[] calldata merkleProofs
    ) external onlyOwner {
        require(merkleRoots[merkleRoot], "PixD: invalid root");
        bytes32 leaf = keccak256(abi.encode(to, tokenId));
        require(!leafUsed[leaf], "PixD: already minted");
        require(
            MerkleProofUpgradeable.verify(merkleProofs, merkleRoot, leaf),
            "PixD: invalid proof"
        );
        leafUsed[leaf] = true;
    }
}

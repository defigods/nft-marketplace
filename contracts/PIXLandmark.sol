//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./interfaces/IPIXLandmark.sol";

contract PIXLandmark is IPIXLandmark, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    string private _baseURIExtended;

    mapping(address => bool) public moderators;
    mapping(uint256 => LandmarkInfo) public landInfos;
    mapping(uint256 => bool) public pixesInLandStatus;
    mapping(uint256 => uint256[]) public pixesInLandType;
    uint256 public lastTokenId;

    modifier onlyMod() {
        require(moderators[msg.sender], "Landmark: NON_MODERATOR");
        _;
    }

    function initialize() external initializer {
        __ERC721Enumerable_init();
        __ERC721_init("PIX Landmark", "PIXLand");
        __Ownable_init();
        moderators[msg.sender] = true;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Landmark: INVALID_MODERATOR");
        moderators[moderator] = approved;
    }

    function addLandmarkType(uint256 landmarkType, uint256[] calldata pixTokenIds)
        external
        onlyMod
    {
        require(landmarkType > 0, "Landmark: INVALID_TYPE");

        for (uint256 i; i < pixTokenIds.length; i += 1) {
            pixesInLandStatus[pixTokenIds[i]] = true;
            pixesInLandType[landmarkType].push(pixTokenIds[i]);
        }
    }

    function isPIXInLand(uint256 tokenId) external view override returns (bool) {
        return pixesInLandStatus[tokenId];
    }

    function pixIdInLandType(uint256 landType, uint256 index)
        external
        view
        override
        returns (uint256)
    {
        return pixesInLandType[landType][index];
    }

    function safeMint(address to, LandmarkInfo memory info) external onlyMod {
        require(info.landmarkType > 0, "Landmark: INVALID_TYPE");

        lastTokenId += 1;
        _safeMint(to, lastTokenId);
        landInfos[lastTokenId] = info;
        emit LandmarkMinted(to, lastTokenId, info.category, info.landmarkType);
    }

    function safeBurn(uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "Landmark: NON_APPROVED"
        );
        _burn(tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}
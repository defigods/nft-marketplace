//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPIXLandmark {
    event LandmarkMinted(
        address indexed account,
        uint256 indexed tokenId,
        PIXCategory category,
        uint256 indexed landmarkType
    );

    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    struct LandmarkInfo {
        PIXCategory category;
        uint256 landmarkType;
    }

    function pixesInLand(uint256 tokenId) external view returns (bool);

    function pixIdInLandType(uint256 landType, uint256 index) external view returns (uint256);
}

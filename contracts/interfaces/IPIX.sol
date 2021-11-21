//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPIX {
    event ModeratorUpdated(address indexed moderator, bool approved);

    event PackPriceUpdated(uint256 indexed mode, uint256 price);

    event CombinePriceUpdated(uint256 price);

    event PaymentTokenUpdated(address indexed token, bool approved);

    event TreasuryUpdated(address treasury, uint256 fee);

    event PIXMinted(
        address indexed account,
        uint256 indexed tokenId,
        uint256 indexed pixId,
        PIXCategory category,
        PIXSize size,
        PIXClassification classification,
        string country
    );

    event Combined(uint256 indexed tokenId, PIXCategory category, PIXSize size);

    event Requested(address indexed account, uint256 indexed mode);

    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    enum PIXSize {
        Pix,
        Area,
        Sector,
        Zone,
        Domain
    }

    enum PIXClassification {
        CapitalCityCenter,
        CapitalCity,
        NaturalReserve,
        CoastalLine,
        MetropolitanArea,
        SuburbanArea,
        ContrysideArea,
        ArcticMountains,
        DesertTundra
    }

    struct Treasury {
        address treasury;
        uint256 fee;
    }

    struct PIXInfo {
        uint256 pixId;
        PIXCategory category;
        PIXSize size;
        PIXClassification classification;
        string country;
    }

    function pixesInLand(uint256[] calldata tokenIds) external view returns (bool);

    function setPIXInLandStatus(uint256[] calldata pixIds) external;
}

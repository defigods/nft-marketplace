//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "../interfaces/IPIX.sol";

contract PIXLandmark is ERC1155SupplyUpgradeable, OwnableUpgradeable {
    using StringsUpgradeable for uint256;

    event LandmarkMinted(
        address indexed account,
        uint256 indexed tokenId,
        uint256 amount,
        PIXCategory category
    );

    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    string private _name;
    string private _symbol;
    string private _baseURIExtended;

    mapping(address => bool) public moderators;
    mapping(uint256 => PIXCategory) public landCategories;

    modifier onlyMod() {
        require(moderators[msg.sender], "Landmark: NON_MODERATOR");
        _;
    }

    function initialize() external initializer {
        __ERC1155Supply_init();
        __ERC1155_init("");
        __Ownable_init();

        moderators[msg.sender] = true;
        _name = "PIX Landmark";
        _symbol = "PIXLand";
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Landmark: INVALID_MODERATOR");
        moderators[moderator] = approved;
    }

    function safeMint(
        address to,
        uint256 id,
        uint256 amount,
        PIXCategory category
    ) external onlyMod {
        _safeMint(to, id, amount, category);
    }

    function batchMint(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        PIXCategory[] calldata categories
    ) external onlyMod {
        require(
            ids.length == categories.length && amounts.length == categories.length,
            "Landmark: INVALID_ARGUMENTS"
        );
        for (uint256 i; i < ids.length; i += 1) _safeMint(to, ids[i], amounts[i], categories[i]);
    }

    function _safeMint(
        address to,
        uint256 id,
        uint256 amount,
        PIXCategory category
    ) internal onlyMod {
        _mint(to, id, amount, "");
        landCategories[id] = category;
        emit LandmarkMinted(to, id, amount, category);
    }

    function uri(uint256 id) public view override returns (string memory) {
        require(id > 0, "Landmark: NOT_EXISTING");
        return string(abi.encodePacked(_baseURIExtended, id.toString()));
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}

//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "./interfaces/IPIX.sol";

contract PIXLandmark is ERC1155SupplyUpgradeable, OwnableUpgradeable {
    using StringsUpgradeable for uint256;

    event LandmarkMinted(address indexed account, uint256 indexed tokenId, PIXCategory category);

    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    string private _baseURI;
    IPIX public pixNFT;

    mapping(address => bool) public moderators;
    mapping(uint256 => PIXCategory) public categories;
    mapping(uint256 => bool) public pixesInLandStatus;
    mapping(uint256 => uint256[]) public pixesInLandmark;
    uint256 public lastTokenId;

    modifier onlyMod() {
        require(moderators[msg.sender], "Landmark: NON_MODERATOR");
        _;
    }

    function initialize(address pix, string memory uri_) external initializer {
        require(pix != address(0), "Landmark: INVALID_PIX");
        require(bytes(uri_).length > 0, "Landmark: INVALID_URI");
        __ERC1155Supply_init();
        __ERC1155_init(uri_);
        __Ownable_init();
        _baseURI = uri_;
        pixNFT = IPIX(pix);
        moderators[msg.sender] = true;
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Landmark: INVALID_MODERATOR");
        moderators[moderator] = approved;
    }

    function addPixesInLandmark(uint256 id, uint256[] calldata pixIds) external onlyMod {
        require(id > 0, "Landmark: INVALID_ID");

        for (uint256 i; i < pixIds.length; i += 1) {
            pixesInLandStatus[pixIds[i]] = true;
            pixesInLandmark[id].push(pixIds[i]);
            pixNFT.setPIXInLandStatus(pixIds);
        }
    }

    function safeMint(
        address to,
        uint256 id,
        uint256 amount,
        PIXCategory category
    ) external onlyMod {
        require(id > 0, "Landmark: INVALID_ID");
        require(amount > 0, "Landmark: INVALID_AMOUNT");
        _mint(to, id, amount, "");
        categories[id] = category;
    }

    function setBaseURI(string memory uri_) external onlyOwner {
        _baseURI = uri_;
    }

    function uri(uint256 id) public view override returns (string memory) {
        return string(abi.encodePacked(_baseURI, id.toString()));
    }
}

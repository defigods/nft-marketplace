//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract PIXCluster is ERC721Enumerable, Ownable {
    enum PIXCategory {
        Legendary,
        Rare,
        Uncommon,
        Common,
        Outliers
    }

    enum PIXSize {
        Cluster,
        Area,
        Sector,
        Domain,
        Federation
    }

    struct PIXInfo {
        PIXSize size;
        PIXCategory category;
    }

    mapping(PIXCategory => uint256) public prices;
    mapping(PIXSize => uint16) public combineCounts;
    mapping(address => bool) public moderators;
    mapping(uint256 => PIXInfo) public infos;

    uint256 public pixLength;

    uint8 public constant MAX_PURCHASE = 20;
    string private _baseURIExtended;

    modifier onlyMod() {
        require(moderators[msg.sender], "Caller is not moderator");
        _;
    }

    constructor() ERC721("PIX Cluster", "PIX") {
        combineCounts[PIXSize.Cluster] = 50;
        combineCounts[PIXSize.Area] = 2;
        combineCounts[PIXSize.Sector] = 2;
        combineCounts[PIXSize.Domain] = 2;
    }

    function _safeMint(address to, PIXInfo memory info)
        internal
        returns (uint256 tokenId)
    {
        pixLength += 1;
        _safeMint(to, pixLength, "");
        infos[pixLength] = info;
        tokenId = pixLength;
    }

    function safeMint(address to, PIXInfo memory info)
        external
        onlyMod
        returns (uint256 tokenId)
    {
        tokenId = _safeMint(to, info);
    }

    function withdraw() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Moderator cannot be zero address");
        moderators[moderator] = approved;
    }

    function setPrice(PIXCategory category, uint256 newPrice)
        external
        onlyOwner
    {
        require(newPrice > 0, "Price cannot be zero");
        prices[category] = newPrice;
    }

    function mint(PIXCategory[] calldata categories) external payable {
        require(
            categories.length <= MAX_PURCHASE,
            "You cannot mint more than limit"
        );

        uint256 price;
        for (uint256 i = 0; i < categories.length; i++) {
            require(prices[categories[i]] > 0, "not for sale");
            price += prices[categories[i]];
            _safeMint(
                msg.sender,
                PIXInfo({size: PIXSize.Cluster, category: categories[i]})
            );
        }
        require(msg.value == price, "Insufficient for purchase");
    }

    function combine(uint256[] calldata tokenIds) external {
        require(tokenIds.length > 0, "no tokens");
        PIXInfo storage info = infos[tokenIds[0]];
        require(info.size < PIXSize.Federation, "max size");
        require(tokenIds.length == combineCounts[info.size], "invalid length");

        for (uint256 i = 0; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(infos[tokenId].size == info.size, "invalid sizes");
            require(infos[tokenId].category == info.category, "invalid sizes");
            require(ownerOf(tokenId) == msg.sender, "not owner");
            _burn(tokenId);
        }

        _safeMint(
            msg.sender,
            PIXInfo({
                size: PIXSize(uint8(info.size) + 1),
                category: info.category
            })
        );
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}

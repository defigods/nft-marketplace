//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract PIXCluster is ERC721Enumerable, Ownable {
    mapping(address => bool) public moderators;
    mapping(uint8 => uint256) public prices;

    uint8 public constant MAX_PURCHASE = 20;
    string private _baseURIExtended;

    modifier onlyMod() {
        require(moderators[msg.sender], "Caller is not moderator");
        _;
    }

    constructor() ERC721("PIX Cluster", "PIX") {
        console.log("PIX Cluster NFT deployed");
    }

    function safeMint(address to) external onlyMod returns (uint256 tokenId) {
        tokenId = totalSupply();
        _safeMint(to, tokenId);
    }

    function safeBurn(uint256 tokenId) external {
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "Caller is not owner or operator"
        );
        _burn(tokenId);
    }

    function withdraw() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Moderator cannot be zero address");
        moderators[moderator] = approved;
    }

    function setPrice(uint8 category, uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price cannot be zero");
        prices[category] = newPrice;
    }

    function mint(uint8[] calldata categories) external payable {
        require(
            categories.length <= MAX_PURCHASE,
            "You cannot mint more than limit"
        );

        uint256 price;
        for (uint256 i = 0; i < categories.length; i++) {
            price += prices[categories[i]];
        }
        require(msg.value >= price, "Insufficient for purchase");

        for (uint256 i = 0; i < categories.length; i++) {
            _safeMint(msg.sender, totalSupply());
        }
    }

    function combine(uint256 tokenId1, uint256 tokenId2) external {
        address tokenOwner1 = ownerOf(tokenId1);
        address tokenOwner2 = ownerOf(tokenId2);
        require(
            tokenOwner1 == msg.sender && tokenOwner2 == msg.sender,
            "Caller is not owner of tokens"
        );
        _burn(tokenId1);
        _burn(tokenId2);
        _safeMint(msg.sender, totalSupply());
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}

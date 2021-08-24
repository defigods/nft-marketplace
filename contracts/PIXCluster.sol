//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract PIXCluster is ERC721Enumerable, Ownable {
    using Strings for uint256;

    mapping(address => bool) public moderators;
    mapping(uint8 => uint256) public prices;

    mapping(uint256 => string) private _tokenURIs;
    string private _baseURIExtended;

    modifier hasMintRole() {
        require(
            msg.sender == owner() || moderators[msg.sender],
            "Sender is not owner or moderator"
        );
        _;
    }

    constructor() ERC721("", "") {
        console.log("Cluster NFT deployed");
    }

    function safeMint(address to)
        external
        hasMintRole
        returns (uint256 tokenId)
    {
        tokenId = totalSupply();
        _safeMint(to, tokenId);
    }

    function mint(uint8 category) external payable {
        require(
            msg.value >= prices[category],
            "Insufficient for this category"
        );
        _safeMint(msg.sender, totalSupply());
    }

    function setPrice(uint8 category, uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be non-zero value");
        prices[category] = newPrice;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(_exists(tokenId), "TokenId is not existing");

        string memory _tokenURI = _tokenURIs[tokenId];
        string memory base = _baseURI();

        if (bytes(base).length == 0) {
            return _tokenURI;
        }
        if (bytes(_tokenURI).length > 0) {
            return string(abi.encodePacked(base, _tokenURI));
        }
        return string(abi.encodePacked(base, tokenId.toString()));
    }
}

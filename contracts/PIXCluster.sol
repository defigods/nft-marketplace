//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract PIXCluster is ERC721Enumerable, Ownable {
    event Combined(uint256 indexed tokenId, PIXCategory category, PIXSize size);

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
        PIXCategory category;
        PIXSize size;
    }

    IERC20 public immutable pixToken;
    string private _baseURIExtended;
    uint256 public maxSupply;

    /**
     * @dev index 0 -> mint fee
     * @dev index 1 -> combine fee
    */
    uint256[] public prices;

    mapping(address => bool) public moderators;
    mapping(address => bool) public requested;
    mapping(PIXSize => uint16) public combineCounts;
    mapping(uint256 => PIXInfo) public pixInfos;

    modifier onlyMod() {
        require(moderators[msg.sender], "Caller is not moderator");
        _;
    }

    constructor(address pixt) ERC721("PIX Cluster", "PIX") {
        require(pixt != address(0), "PIX Token cannot be zero address");
        pixToken = IERC20(pixt);
        moderators[msg.sender] = true;
        prices.push(0);
        prices.push(0);
        combineCounts[PIXSize.Cluster] = 50;
        combineCounts[PIXSize.Area] = 5;
        combineCounts[PIXSize.Sector] = 2;
        combineCounts[PIXSize.Domain] = 2;
    }

    function withdraw() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Moderator cannot be zero address");
        moderators[moderator] = approved;
    }

    function setPrice(uint256 mode, uint256 newPrice) external onlyOwner {
        require(mode < 2, "Invalid price mode");
        require(newPrice > 0, "Price cannot be zero");
        prices[mode] = newPrice;
    }

    function requestMint() external payable {
        require(prices[0] > 0, "Purchase price not set");
        require(msg.value >= prices[0], "Insufficient for purchase");
        require(!requested[msg.sender], "Pending mint request exists");
        requested[msg.sender] = true;
    }

    function mintTo(address to, PIXCategory[] calldata categories) external onlyMod {
        require(requested[to], "No pending mint request");
        require(categories.length == 50, "Invalid categories length");

        for (uint256 i = 0; i < 50; i += 1) {
            _safeMint(to, PIXInfo({ size: PIXSize.Cluster, category: categories[i] }));
        }
        requested[to] = false;
    }

    function combine(uint256[] calldata tokenIds) external {
        require(prices[1] > 0, "Combine price not set");
        require(tokenIds.length > 0, "No tokens");

        _doHardWork(msg.sender, tokenIds);
        pixToken.transferFrom(msg.sender, address(this), prices[1]);
    }

    function doHardWork(address account, uint256[] calldata tokenIds) external onlyMod {
        _doHardWork(account, tokenIds);
    }

    function _doHardWork(address account, uint256[] calldata tokenIds) private {
        PIXInfo storage firstPix = pixInfos[tokenIds[0]];
        require(firstPix.size < PIXSize.Federation, "Cannot combine max size");
        require(tokenIds.length == combineCounts[firstPix.size], "Invalid combination");

        for (uint256 i = 0; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(pixInfos[tokenId].size == firstPix.size, "Cannot combine different sizes");
            require(pixInfos[tokenId].category == firstPix.category, "Cannot combine different categories");
            require(
                _isApprovedOrOwner(account, tokenIds[i]),
                "Caller is not owner or operator"
            );
            _burn(tokenId);
        }

        PIXSize newSize = PIXSize(uint8(firstPix.size) + 1);
        _safeMint(account, PIXInfo({size: newSize, category: firstPix.category}));

        emit Combined(maxSupply, firstPix.category, newSize);
    }

    function safeMint(address to, PIXInfo memory info) external onlyMod {
        _safeMint(to, info);
    }

    function _safeMint(address to, PIXInfo memory info) internal {
        maxSupply += 1;
        _safeMint(to, maxSupply);
        pixInfos[maxSupply] = info;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}

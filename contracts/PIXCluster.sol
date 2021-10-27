//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract PIXCluster is ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;

    event Combined(uint256 indexed tokenId, PIXCategory category, PIXSize size);
    event Requested(address indexed account);

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
        uint256 pixId;
        PIXCategory category;
        PIXSize size;
    }

    uint256 public constant CLUSTER_MINT_COUNT = 50;
    IERC20 public immutable usdToken;
    IERC20 public immutable pixToken;
    string private _baseURIExtended;
    uint256 public lastTokenId;

    uint256 public mintFee;
    uint256 public combineFee;

    mapping(address => bool) public moderators;
    mapping(address => bool) public requested;
    mapping(PIXSize => uint16) public combineCounts;
    mapping(uint256 => PIXInfo) public pixInfos;

    modifier onlyMod() {
        require(moderators[msg.sender], "Caller is not moderator");
        _;
    }

    constructor(address usdt, address pixt) ERC721("PIX Cluster", "PIX") {
        require(usdt != address(0), "USD Token cannot be zero address");
        require(pixt != address(0), "PIX Token cannot be zero address");
        usdToken = IERC20(usdt);
        pixToken = IERC20(pixt);
        moderators[msg.sender] = true;
        combineCounts[PIXSize.Cluster] = 50;
        combineCounts[PIXSize.Area] = 5;
        combineCounts[PIXSize.Sector] = 2;
        combineCounts[PIXSize.Domain] = 2;
    }

    function withdraw() external onlyOwner {
        if (usdToken.balanceOf(address(this)) > 0) {
            usdToken.safeTransfer(msg.sender, usdToken.balanceOf(address(this)));
        }
        if (pixToken.balanceOf(address(this)) > 0) {
            pixToken.safeTransfer(msg.sender, pixToken.balanceOf(address(this)));
        }
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Moderator cannot be zero address");
        moderators[moderator] = approved;
    }

    function setMintFee(uint256 fee) external onlyOwner {
        require(fee > 0, "Fee cannot be zero");
        mintFee = fee;
    }

    function setCombineFee(uint256 fee) external onlyOwner {
        require(fee > 0, "Fee cannot be zero");
        combineFee = fee;
    }

    function requestMint() external {
        require(mintFee > 0, "Purchase price not set");
        require(!requested[msg.sender], "Pending mint request exists");
        usdToken.safeTransferFrom(msg.sender, address(this), mintFee);
        requested[msg.sender] = true;
        emit Requested(msg.sender);
    }

    function mintTo(address to, uint256[] calldata pixIds, PIXCategory[] calldata categories)
        external
        onlyMod
    {
        require(requested[to], "No pending mint request");
        require(pixIds.length == categories.length, "Invalid length of parameters");
        require(
            categories.length == CLUSTER_MINT_COUNT,
            "Invalid categories length"
        );

        for (uint256 i = 0; i < CLUSTER_MINT_COUNT; i += 1) {
            _safeMint(
                to,
                PIXInfo({pixId: pixIds[i], size: PIXSize.Cluster, category: categories[i]})
            );
        }
        requested[to] = false;
    }

    function combine(uint256[] calldata tokenIds) external {
        require(combineFee > 0, "Combine price not set");
        require(tokenIds.length > 0, "No tokens");

        _proceedCombine(msg.sender, tokenIds);
        pixToken.safeTransferFrom(msg.sender, address(this), combineFee);
    }

    function _proceedCombine(address account, uint256[] calldata tokenIds)
        private
    {
        PIXInfo storage firstPix = pixInfos[tokenIds[0]];
        require(firstPix.size < PIXSize.Federation, "Cannot combine max size");
        require(
            tokenIds.length == combineCounts[firstPix.size],
            "Invalid combination"
        );

        for (uint256 i = 0; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(
                pixInfos[tokenId].size == firstPix.size,
                "Should combine same sizes"
            );
            require(
                pixInfos[tokenId].category == firstPix.category,
                "Should combine same categories"
            );
            require(ownerOf(tokenId) == account, "Caller is not owner");
            _burn(tokenId);
        }

        PIXSize newSize = PIXSize(uint8(firstPix.size) + 1);
        _safeMint(
            account,
            PIXInfo({pixId: 0, size: newSize, category: firstPix.category})
        );

        emit Combined(lastTokenId, firstPix.category, newSize);
    }

    function safeMint(address to, PIXInfo memory info) external onlyMod {
        _safeMint(to, info);
    }

    function batchMint(address to, PIXInfo[] memory infos) external onlyMod {
        require(infos.length > 0 && infos.length <= 50, "Invalid pixes length");

        for (uint256 i = 0; i < infos.length; i += 1) {
            _safeMint(to, infos[i]);
        }
    }

    function _safeMint(address to, PIXInfo memory info) internal {
        require(info.pixId > 0 || info.size != PIXSize.Cluster, "Invalid PIX info");

        lastTokenId += 1;
        _safeMint(to, lastTokenId);
        pixInfos[lastTokenId] = info;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }
}

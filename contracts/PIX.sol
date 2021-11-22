//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./interfaces/IPIX.sol";
import "./interfaces/IOracleManager.sol";
import "./interfaces/ISwapManager.sol";
import "./libraries/DecimalMath.sol";

contract PIX is IPIX, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    IERC20Upgradeable public pixToken;
    string private _baseURIExtended;
    uint256 public lastTokenId;

    Treasury public treasury;
    uint256 public combinePrice;
    uint256[] public packPrices;
    mapping(address => bool) public moderators;
    mapping(address => uint256) public pendingPackType;
    mapping(PIXSize => uint16) public combineCounts;
    mapping(uint256 => PIXInfo) public pixInfos;
    mapping(address => bool) public paymentTokens;
    IOracleManager public oracleManager;
    ISwapManager public swapManager;
    address public tokenForPrice;

    /** @notice isTerritory => id => isInside
     * if is territory => tokenId
     * unless territory => pixId
     */
    mapping(bool => mapping(uint256 => bool)) public pixInLand;

    modifier onlyMod() {
        require(moderators[msg.sender], "Pix: NON_MODERATOR");
        _;
    }

    function initialize(address pixt, address _tokenForPrice) public initializer {
        require(pixt != address(0), "Pix: INVALID_PIXT");
        __ERC721Enumerable_init();
        __ERC721_init("PlanetIX", "PIX");
        __Ownable_init();
        pixToken = IERC20Upgradeable(pixt);
        tokenForPrice = _tokenForPrice;

        moderators[msg.sender] = true;

        combineCounts[PIXSize.Pix] = 10;
        combineCounts[PIXSize.Area] = 5;
        combineCounts[PIXSize.Sector] = 2;
        combineCounts[PIXSize.Zone] = 2;

        packPrices.push(5 * 1e6);
        packPrices.push(50 * 1e6);
        packPrices.push(100 * 1e6);
        packPrices.push(250 * 1e6);
        packPrices.push(500 * 1e6);
        packPrices.push(1000 * 1e6);
        paymentTokens[pixt] = true;
        paymentTokens[_tokenForPrice] = true;
    }

    function setOracleManager(address _oracleManager) external onlyOwner {
        require(_oracleManager != address(0), "Pix: INVALID_ORACLE_MANAGER");
        oracleManager = IOracleManager(_oracleManager);
    }

    function setSwapManager(address _swapManager) external onlyOwner {
        require(_swapManager != address(0), "Pix: INVALID_SWAP_MANAGER");
        swapManager = ISwapManager(_swapManager);
    }

    function withdraw(address[] calldata tokens) external onlyOwner {
        for (uint256 i; i < tokens.length; i += 1) {
            IERC20Upgradeable token = IERC20Upgradeable(tokens[i]);
            if (tokens[i] == address(0)) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = msg.sender.call{value: address(this).balance}("");
                require(success, "Pix: WITHDRAW_FAILED");
            } else if (token.balanceOf(address(this)) > 0) {
                token.safeTransfer(msg.sender, token.balanceOf(address(this)));
            }
        }
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Pix: INVALID_MODERATOR");
        moderators[moderator] = approved;
        emit ModeratorUpdated(moderator, approved);
    }

    function setPackPrice(uint256 mode, uint256 price) external onlyOwner {
        require(mode > 0 && mode < packPrices.length, "Pix: INVALID_PRICE_MODE");
        require(price > 0, "Pix: ZERO_PRICE");
        packPrices[mode - 1] = price;
        emit PackPriceUpdated(mode, price);
    }

    function setCombinePrice(uint256 price) external onlyOwner {
        require(price > 0, "Pix: ZERO_PRICE");
        combinePrice = price;
        emit CombinePriceUpdated(price);
    }

    function setPaymentToken(address token, bool approved) external onlyOwner {
        paymentTokens[token] = approved;
        emit PaymentTokenUpdated(token, approved);
    }

    function setTreasury(address _treasury, uint256 _fee) external onlyOwner {
        require(_treasury != address(0), "Pix: INVALID_TREASURY");
        require(_fee.isLessThanAndEqualToDenominator(), "Pix: FEE_OVERFLOW");
        treasury = Treasury(_treasury, _fee);

        emit TreasuryUpdated(_treasury, _fee);
    }

    function requestMint(address token, uint256 mode) external payable {
        require(paymentTokens[token], "Pix: TOKEN_NOT_APPROVED");
        require(mode > 0 && mode <= packPrices.length, "Pix: INVALID_PRICE_MODE");
        require(pendingPackType[msg.sender] == 0, "Pix: PENDING_REQUEST_EXIST");

        if (address(oracleManager) == address(0)) {
            require(token == tokenForPrice, "Pix: Unsupported");
        }
        uint256 price = token == tokenForPrice
            ? packPrices[mode - 1]
            : oracleManager.getAmountOut(tokenForPrice, token, packPrices[mode - 1]);

        require(price > 0, "Pix: invalid price");

        if (token == address(0)) {
            require(msg.value == price, "Pix: INSUFFICIENT_FUNDS");
        } else {
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), price);
        }
        if (treasury.treasury != address(0)) {
            uint256 treasuryFee = price.decimalMul(treasury.fee);
            if (treasuryFee > 0) {
                if (token == address(pixToken)) {
                    pixToken.safeTransfer(treasury.treasury, treasuryFee);
                } else {
                    pixToken.approve(address(swapManager), treasuryFee);
                    swapManager.swap(token, address(pixToken), treasuryFee, treasury.treasury);
                }
            }
        }
        pendingPackType[msg.sender] = mode;
        emit Requested(msg.sender, mode);
    }

    function mintTo(
        address to,
        uint256[] calldata pixIds,
        PIXCategory[] calldata categories
    ) external onlyMod {
        require(pendingPackType[to] > 0, "Pix: NO_PENDING_REQUEST");
        require(pixIds.length == categories.length, "Pix: INVALID_LENGTH");

        for (uint256 i; i < pixIds.length; i += 1) {
            _safeMint(to, PIXInfo({pixId: pixIds[i], size: PIXSize.Pix, category: categories[i]}));
        }
    }

    function completeRequest(address to, uint256 mode) external onlyMod {
        require(pendingPackType[to] == mode, "Pix: INVALID_REQUEST");
        pendingPackType[to] = 0;
    }

    function combine(uint256[] calldata tokenIds) external {
        require(tokenIds.length > 0, "Pix: NO_TOKENS");

        _proceedCombine(msg.sender, tokenIds);

        pixToken.safeTransferFrom(msg.sender, address(this), combinePrice);
    }

    function _proceedCombine(address account, uint256[] calldata tokenIds) private {
        PIXInfo storage firstPix = pixInfos[tokenIds[0]];
        uint256 combineCount = combineCounts[firstPix.size];
        if (firstPix.size == PIXSize.Pix) {
            combineCount *= 5 - uint256(firstPix.category);
        }
        require(firstPix.size < PIXSize.Domain, "Pix: MAX_NOT_ALLOWED");
        require(tokenIds.length == combineCount, "Pix: INVALID_ARGUMENTS");

        bool inside = this.pixesInLand(tokenIds);
        for (uint256 i; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(pixInfos[tokenId].size == firstPix.size, "Pix: SAME_SIZE_ONLY");
            require(pixInfos[tokenId].category == firstPix.category, "Pix: SAME_CATEGORY_ONLY");
            require(ownerOf(tokenId) == account, "Pix: NON_APPROVED");
            _burn(tokenId);
        }

        PIXSize newSize = PIXSize(uint8(firstPix.size) + 1);
        _safeMint(account, PIXInfo({pixId: 0, size: newSize, category: firstPix.category}));
        pixInLand[true][lastTokenId] = inside;

        emit Combined(lastTokenId, firstPix.category, newSize);
    }

    function updateTerritoryInfo(uint256 tokenId, uint256 pixId) external onlyMod {
        PIXInfo storage info = pixInfos[tokenId];
        require(info.size != PIXSize.Pix, "Pix: TERRITORIES_ONLY");
        require(info.pixId == 0, "Pix: TERRITORY_ALREADY_SET");
        info.pixId = pixId;
    }

    function safeMint(address to, PIXInfo memory info) external onlyMod {
        _safeMint(to, info);
    }

    function batchMint(address to, PIXInfo[] memory infos) external onlyMod {
        for (uint256 i; i < infos.length; i += 1) {
            _safeMint(to, infos[i]);
        }
    }

    function _safeMint(address to, PIXInfo memory info) internal {
        require((info.pixId > 0) == (info.size == PIXSize.Pix), "Pix: INVALID_ARGUMENTS");

        lastTokenId += 1;
        _safeMint(to, lastTokenId);
        pixInfos[lastTokenId] = info;
        emit PIXMinted(to, lastTokenId, info.pixId, info.category, info.size);
    }

    function safeBurn(uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || isApprovedForAll(owner, msg.sender), "Pix: NON_APPROVED");
        _burn(tokenId);
    }

    function batchBurn(uint256[] memory tokenIds) external {
        for (uint256 i; i < tokenIds.length; i += 1) {
            address owner = ownerOf(tokenIds[i]);
            require(
                msg.sender == owner || isApprovedForAll(owner, msg.sender),
                "Pix: NON_APPROVED"
            );
            _burn(tokenIds[i]);
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }

    function pixesInLand(uint256[] calldata tokenIds) external view override returns (bool inside) {
        for (uint256 i; i < tokenIds.length; i += 1) {
            PIXInfo memory info = pixInfos[tokenIds[i]];
            if (info.size == PIXSize.Pix)
                inside = inside || pixInLand[false][pixInfos[tokenIds[i]].pixId];
            else inside = inside || pixInLand[true][tokenIds[i]];
        }
    }

    function setPIXInLandStatus(uint256[] calldata pixIds) external override onlyMod {
        for (uint256 i; i < pixIds.length; i += 1) pixInLand[false][pixIds[i]] = true;
    }
}

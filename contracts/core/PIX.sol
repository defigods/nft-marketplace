//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "../interfaces/IPIX.sol";
import "../interfaces/IOracleManager.sol";
import "../interfaces/ISwapManager.sol";
import "../libraries/DecimalMath.sol";

contract PIX is IPIX, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;
    using DecimalMath for uint256;
    using ECDSAUpgradeable for bytes32;

    IERC20Upgradeable public pixToken;
    string private _baseURIExtended;
    uint256 public override lastTokenId;

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
    mapping(bool => mapping(uint256 => bool)) public pixInLand; // disabled
    mapping(address => bool) public traders;

    mapping(address => uint256) public pendingPackDropId; // disabled
    uint256 public limitForSmall; // disabled
    uint256 public limitForMedium; // disabled
    mapping(address => mapping(uint256 => uint256)) packsPurchasedByType; // disabled
    mapping(uint256 => uint256) packsPurchasedInDrop; // disabled
    mapping(uint256 => uint256) dropStartTimes; // disabled
    mapping(uint256 => uint256) dropEndTimes; // disabled
    mapping(uint256 => address) playerAddresses; // disabled

    mapping(uint256 => DropInfo) public dropInfos;
    mapping(uint256 => uint256[]) public relatedDrops;
    mapping(uint256 => mapping(uint256 => bool)) public relatedDropsStatus;
    mapping(uint256 => mapping(uint256 => uint256)) public packsPurchased;
    mapping(address => PackRequest) public packRequests;
    mapping(address => bool) public blacklistedAddresses;

    uint256[] public packIXTPrices;
    mapping(address => uint256) public packRequestCounts;

    mapping(PIXCategory => mapping(PIXSize => uint256)) public tiers;

    mapping(address => uint256) public nonces;

    modifier onlyMod() {
        require(moderators[msg.sender], "Pix: NON_MODERATOR");
        _;
    }

    modifier nonBlacklisted() {
        require(blacklistedAddresses[msg.sender] == false, "Pix: BLACKLISTED");
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

    function setTrader(address trader, bool approved) external onlyOwner {
        require(trader != address(0), "Pix: INVALID_TRADER");
        traders[trader] = approved;
        emit TraderUpdated(trader, approved);
    }

    function setModerator(address moderator, bool approved) external onlyOwner {
        require(moderator != address(0), "Pix: INVALID_MODERATOR");
        moderators[moderator] = approved;
        emit ModeratorUpdated(moderator, approved);
    }

    function setPackPrice(uint256 mode, uint256 price) external onlyOwner {
        require(price > 0, "Pix: ZERO_PRICE");
        if (mode == 0) {
            packPrices.push(price);
            emit PackPriceUpdated(packPrices.length, price);
        } else if (mode <= packPrices.length) {
            packPrices[mode - 1] = price;
            emit PackPriceUpdated(mode, price);
        }
    }

    function setPackIXTPrice(uint256 mode, uint256 price) external onlyOwner {
        require(price > 0, "Pix: ZERO_PRICE");
        if (mode == 0) {
            packIXTPrices.push(price);
        } else if (mode <= packIXTPrices.length) {
            packIXTPrices[mode - 1] = price;
        }
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

    function isDisabledDropForPlayer(uint256 playerId, uint256 dropId) public view returns (bool) {
        for (uint256 i; i < relatedDrops[dropId].length; i += 1) {
            if (packsPurchased[playerId][relatedDrops[dropId][i]] > 0) {
                return true;
            }
        }
        return false;
    }

    function requestBatchMint(
        address token,
        uint256 dropId,
        uint256 playerId,
        uint256 mode,
        uint256 count
    ) external payable nonBlacklisted {
        DropInfo storage drop = dropInfos[dropId];
        require(!isDisabledDropForPlayer(playerId, dropId), "Pix: DROP_DISABLED");
        require(drop.requestCount + count <= drop.maxCount, "Pix: PACKS_ALL_SOLD_OUT");
        require(
            packsPurchased[playerId][dropId] + count <= drop.limitForPlayer,
            "Pix: OVERFLOW_LIMIT"
        );
        require(
            drop.startTime <= block.timestamp && drop.endTime >= block.timestamp,
            "!Pix: DROP_SALE_TIME"
        );
        require(paymentTokens[token], "Pix: TOKEN_NOT_APPROVED");

        uint256 price = token == tokenForPrice
            ? packPrices[mode - 1]
            : oracleManager.getAmountOut(tokenForPrice, token, packPrices[mode - 1]);

        _registerRequest(token, dropId, playerId, mode, price, count);
    }

    function requestBatchMintWithIXT(
        uint256 dropId,
        uint256 playerId,
        uint256 mode,
        uint256 count
    ) external nonBlacklisted {
        DropInfo storage drop = dropInfos[dropId];
        require(!isDisabledDropForPlayer(playerId, dropId), "Pix: DROP_DISABLED");
        require(drop.requestCount + count <= drop.maxCount, "Pix: PACKS_ALL_SOLD_OUT");
        require(
            packsPurchased[playerId][dropId] + count <= drop.limitForPlayer,
            "Pix: OVERFLOW_LIMIT"
        );
        require(
            drop.startTime <= block.timestamp && drop.endTime >= block.timestamp,
            "!Pix: DROP_SALE_TIME"
        );

        _registerRequest(address(pixToken), dropId, playerId, mode, packIXTPrices[mode - 1], count);
    }

    function _registerRequest(
        address token,
        uint256 dropId,
        uint256 playerId,
        uint256 mode,
        uint256 price,
        uint256 count
    ) internal {
        require(price > 0, "Pix: INVALID_PRICE");
        require(count > 0, "Pix: INVALID_COUNT");
        uint256 totalPrice = price * count;

        if (token == address(0)) {
            require(msg.value == totalPrice, "Pix: INSUFFICIENT_FUNDS");
        } else {
            require(msg.value == 0, "Pix: INVALID_VALUE");
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), totalPrice);
        }
        if (treasury.treasury != address(0)) {
            uint256 treasuryFee = totalPrice.decimalMul(treasury.fee);
            if (treasuryFee > 0) {
                if (token == address(pixToken)) {
                    pixToken.safeTransfer(treasury.treasury, treasuryFee);
                } else if (token == address(0)) {
                    swapManager.swap{value: treasuryFee}(
                        token,
                        address(pixToken),
                        treasuryFee,
                        treasury.treasury
                    );
                } else {
                    IERC20Upgradeable(token).approve(address(swapManager), treasuryFee);
                    swapManager.swap(token, address(pixToken), treasuryFee, treasury.treasury);
                }
            }
        }
        packRequests[msg.sender] = PackRequest(playerId, dropId);
        packRequestCounts[msg.sender] = count;
        dropInfos[dropId].requestCount += count;
        emit Requested(dropId, playerId, mode, packsPurchased[playerId][dropId] + 1, count);
    }

    function combine(uint256[] calldata tokenIds, bytes memory signature) external onlyMod {
        require(tokenIds.length > 0, "Pix: NO_TOKENS");

        address account = ownerOf(tokenIds[0]);
        uint256 nonce = nonces[account]++;
        bytes32 data = keccak256(abi.encodePacked(account, nonce));
        require(
            data.toEthSignedMessageHash().recover(signature) == account,
            "Pix: INVALID_SIGNATURE"
        );

        PIXInfo storage firstPix = pixInfos[tokenIds[0]];
        uint256 combineCount = combineCounts[firstPix.size];
        if (firstPix.size == PIXSize.Pix) {
            combineCount *= 5 - uint256(firstPix.category);
        }
        require(firstPix.size < PIXSize.Domain, "Pix: MAX_NOT_ALLOWED");
        require(tokenIds.length == combineCount, "Pix: INVALID_ARGUMENTS");

        for (uint256 i; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(pixInfos[tokenId].size == firstPix.size, "Pix: SAME_SIZE_ONLY");
            require(pixInfos[tokenId].category == firstPix.category, "Pix: SAME_CATEGORY_ONLY");
            require(ownerOf(tokenId) == account, "Pix: NON_APPROVED");
            _burn(tokenId);
        }

        PIXSize newSize = PIXSize(uint8(firstPix.size) + 1);
        _safeMint(account, PIXInfo({pixId: 0, size: newSize, category: firstPix.category}));

        emit Combined(lastTokenId, firstPix.category, newSize);
    }

    function safeMint(address to, PIXInfo memory info) external override onlyMod {
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

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIExtended = baseURI_;
    }

    function isTerritory(uint256 tokenId) external view override returns (bool) {
        return pixInfos[tokenId].size != PIXSize.Pix;
    }

    function pixesInLand(uint256[] calldata tokenIds) external view override returns (bool) {
        return false;
    }

    function approve(address to, uint256 tokenId) public virtual override {
        address owner = ERC721Upgradeable.ownerOf(tokenId);
        require(to != owner, "ERC721: approval to current owner");
        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "ERC721: approve caller is not the owner nor approved for all"
        );
        if (to.isContract()) {
            require(traders[to], "Pix: NON_WHITELISTED_TRADER");
        }

        _approve(to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public virtual override {
        if (approved && operator.isContract()) {
            require(traders[operator], "Pix: NON_WHITELISTED_TRADER");
        }
        _setApprovalForAll(msg.sender, operator, approved);
    }

    function setTokenForPrice(address _tokenForPrice) external onlyOwner {
        tokenForPrice = _tokenForPrice;
    }

    function setDropInfo(uint256 dropId, DropInfo calldata drop) external onlyOwner {
        DropInfo storage dropInfo = dropInfos[dropId];
        dropInfo.maxCount = drop.maxCount;
        dropInfo.requestCount = drop.requestCount;
        dropInfo.limitForPlayer = drop.limitForPlayer;
        dropInfo.startTime = drop.startTime;
        dropInfo.endTime = drop.endTime;
    }

    function setRelationForDrops(uint256 drop1, uint256 drop2) external onlyOwner {
        if (!relatedDropsStatus[drop1][drop2]) {
            relatedDrops[drop1].push(drop2);
            relatedDropsStatus[drop1][drop2] = true;
        }
        if (!relatedDropsStatus[drop2][drop1]) {
            relatedDrops[drop2].push(drop1);
            relatedDropsStatus[drop2][drop1] = true;
        }
    }

    function setBlacklistedAddress(address account, bool blacklisted) external onlyOwner {
        blacklistedAddresses[account] = blacklisted;
    }

    function setTier(
        PIXCategory category,
        PIXSize size,
        uint256 tier
    ) external onlyOwner {
        tiers[category][size] = tier;
    }

    function getTier(uint256 tokenId) external view override returns (uint256) {
        PIXInfo memory info = pixInfos[tokenId];
        return tiers[info.category][info.size];
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata tokenIds
    ) external {
        uint256 len = tokenIds.length;
        for (uint256 i; i < len; i += 1) {
            _transfer(from, to, tokenIds[i]);
        }
    }
}

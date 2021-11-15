//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./interfaces/IPIX.sol";
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

    modifier onlyMod() {
        require(moderators[msg.sender], "Pix: NON_MODERATOR");
        _;
    }

    function initialize(address pixt) public initializer {
        require(pixt != address(0), "Pix: INVALID_PIXT");
        __ERC721Enumerable_init();
        __ERC721_init("PlanetIX", "PIX");
        __Ownable_init();
        pixToken = IERC20Upgradeable(pixt);
        moderators[msg.sender] = true;
        combineCounts[PIXSize.Pix] = 10;
        combineCounts[PIXSize.Area] = 5;
        combineCounts[PIXSize.Sector] = 2;
        combineCounts[PIXSize.Zone] = 2;
        packPrices.push(5);
        packPrices.push(50);
        packPrices.push(100);
        packPrices.push(250);
        packPrices.push(500);
        packPrices.push(1000);
        paymentTokens[pixt] = true;
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
        require(mode > 0 && mode < packPrices.length, "Pix: INVALID_PRICE_MODE");
        require(pendingPackType[msg.sender] == 0, "Pix: PENDING_REQUEST_EXIST");
        if (token == address(0)) {
            require(msg.value == packPrices[mode - 1], "Pix: INSUFFICIENT_FUNDS");
        } else {
            IERC20Upgradeable(token).safeTransferFrom(
                msg.sender,
                address(this),
                packPrices[mode - 1]
            );
        }
        pendingPackType[msg.sender] = mode;
        emit Requested(msg.sender, mode);
    }

    function mintTo(
        address to,
        uint256[] calldata pixIds,
        PIXCategory[] calldata categories,
        PIXClassification[] calldata classifications,
        string[] calldata countries
    ) external onlyMod {
        require(pendingPackType[to] > 0, "Pix: NO_PENDING_REQUEST");
        require(
            pixIds.length == categories.length &&
                pixIds.length == classifications.length &&
                pixIds.length == countries.length,
            "Pix: INVALID_LENGTH"
        );

        for (uint256 i; i < pixIds.length; i += 1) {
            _safeMint(
                to,
                PIXInfo({
                    pixId: pixIds[i],
                    size: PIXSize.Pix,
                    category: categories[i],
                    classification: classifications[i],
                    country: countries[i]
                })
            );
        }
    }

    function completeRequest(address to, uint256 mode) external onlyMod {
        require(pendingPackType[to] == mode, "Pix: INVALID_REQUEST");
        pendingPackType[to] = 0;
    }

    function combine(uint256[] calldata tokenIds) external {
        require(combinePrice > 0, "Pix: PRICE_NOT_SET");
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

        for (uint256 i; i < tokenIds.length; i += 1) {
            uint256 tokenId = tokenIds[i];

            require(pixInfos[tokenId].size == firstPix.size, "Pix: SAME_SIZE_ONLY");
            require(pixInfos[tokenId].category == firstPix.category, "Pix: SAME_CATEGORY_ONLY");
            require(ownerOf(tokenId) == account, "Pix: NON_APPROVED");
            _burn(tokenId);
        }

        PIXSize newSize = PIXSize(uint8(firstPix.size) + 1);
        _safeMint(
            account,
            PIXInfo({
                pixId: 0,
                size: newSize,
                category: firstPix.category,
                classification: PIXClassification.CapitalCityCenter,
                country: ""
            })
        );

        emit Combined(lastTokenId, firstPix.category, newSize);
    }

    function updateTerritoryInfo(
        uint256 tokenId,
        uint256 pixId,
        PIXClassification classification,
        string calldata country
    ) external onlyMod {
        PIXInfo storage info = pixInfos[tokenId];
        require(info.size != PIXSize.Pix, "Pix: TERRITORIES_ONLY");
        require(info.pixId == 0, "Pix: TERRITORY_ALREADY_SET");
        info.pixId = pixId;
        info.classification = classification;
        info.country = country;
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
        emit PIXMinted(
            to,
            lastTokenId,
            info.pixId,
            info.category,
            info.size,
            info.classification,
            info.country
        );
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
}

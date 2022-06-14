//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "./IRNG.sol";

contract NFT is ERC1155SupplyUpgradeable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event Requested(address account, bytes32 requestId);

    string public name;
    string public symbol;

    bool public isPaused;
    address public moderator;
    mapping(uint256 => string) public uris;
    mapping(uint256 => uint256) public maxSupplies;
    mapping(uint256 => uint256) public prices;
    mapping(uint256 => uint8) public rarities; // [2%, 18%, 80%]

    address public weth;
    address public rng; // random number generator
    mapping(bytes32 => address) public requests;

    modifier onlyGov() {
        require(msg.sender == owner() || msg.sender == moderator, "NFT: NOT_GOVERNANCE");
        _;
    }

    function initialize(string memory name_, string memory symbol_) public initializer {
        __ERC1155_init("");
        __Ownable_init();

        moderator = msg.sender;
        isPaused = true;
        name = name_;
        symbol = symbol_;
    }

    function setName(string memory name_) external onlyGov {
        name = name_;
    }

    function setSymbol(string memory symbol_) external onlyGov {
        symbol = symbol_;
    }

    function withdraw() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "NFT: WITHDRAW_FAILED");
    }

    function toggleStatus() external onlyGov {
        isPaused = !isPaused;
    }

    function setModerator(address moderator_) external onlyOwner {
        require(moderator_ != address(0), "NFT: ZERO_ADDRESS");
        moderator = moderator_;
    }

    function setMaxSupply(uint256 id, uint256 maxSupply) external onlyOwner {
        maxSupplies[id] = maxSupply;
    }

    function setPrice(uint256 id, uint256 price) external onlyOwner {
        prices[id] = price;
    }

    function setURI(uint256 id, string memory uri_) external onlyGov {
        uris[id] = uri_;
    }

    function uri(uint256 id) public view override returns (string memory) {
        return uris[id];
    }

    function mint(uint256 id, uint256 amount) external payable {
        require(!isPaused, "NFT: SALE_PAUSED");
        require(totalSupply(id) + amount <= maxSupplies[id], "NFT: EXCEED_MAX_SUPPLY");
        require(msg.value == prices[id] * amount, "NFT: INCORRECT_PRICE");

        _mint(msg.sender, id, amount, "");
    }

    function airdrop(
        address[] calldata recipients,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            recipients.length == ids.length && recipients.length == amounts.length,
            "NFT: INVALID_ARGUMENTS"
        );
        for (uint256 i; i < recipients.length; i += 1) _mint(recipients[i], ids[i], amounts[i], "");
    }

    function setWETH(address weth_) external onlyGov {
        weth = weth_;
    }

    function setRNG(address rng_) external onlyGov {
        rng = rng_;
    }

    function setRarities(uint256 id, uint8 rarity) external onlyGov {
        rarities[id] = rarity;
    }

    function mintRandom() external {
        require(!isPaused, "NFT: SALE_PAUSED");
        if (
            totalSupply(1) >= maxSupplies[1] &&
            totalSupply(2) >= maxSupplies[2] &&
            totalSupply(3) >= maxSupplies[3]
        ) revert("NFT: AOC_SOLD_OUT");

        bytes32 requestId = IRNG(rng).getRandomNumber();
        requests[requestId] = msg.sender;
        emit Requested(msg.sender, requestId);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness) external {
        require(msg.sender == rng, "NFT: NOT_RNG");

        uint256 id = _getIdToMint(randomness);
        IERC20Upgradeable(weth).safeTransferFrom(requests[requestId], address(this), prices[id]);
        _mint(requests[requestId], id, 1, "");
        delete requests[requestId];
    }

    function _getIdToMint(uint256 randomness) private view returns (uint256) {
        uint256 k;
        for (uint256 i; i < 3; i += 1) {
            if (totalSupply(i + 1) < maxSupplies[i + 1]) k += 1;
        }
        uint256 raritySum;
        uint256[] memory rarities_ = new uint256[](k);
        uint256[] memory ids_ = new uint256[](k);
        for (uint256 i; i < 3; i += 1) {
            if (totalSupply(i + 1) < maxSupplies[i + 1]) {
                raritySum += rarities[i + 1];
                rarities_[k] = rarities[i + 1];
                ids_[k] = i + 1;
                k += 1;
            }
        }
        for (k = 1; k < rarities_.length; k += 1) rarities_[k] += rarities_[k - 1];

        for (k = rarities_.length - 1; k >= 0; k -= 1) {
            if (randomness % raritySum < rarities_[k]) break;
        }
        return ids_[k];
    }
}

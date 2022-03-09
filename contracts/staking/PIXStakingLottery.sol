//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../interfaces/IPIX.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract PIXStakingLottery is
    OwnableUpgradeable,
    ERC721HolderUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event StakedPixNFT(uint256 tokenId, address indexed recipient);
    event WithdrawnPixNFT(uint256 tokenId, address indexed recipient);
    event RewardPaid(uint256 pending, address indexed recipient);

    struct UserInfo {
        mapping(uint256 => bool) isStaked;
        uint256 tiers;
    }

    mapping(address => UserInfo) public userInfo;
    mapping(uint256 => uint256) public tierInfo;
    mapping(address => uint256) public earned;

    IERC20Upgradeable public rewardToken;

    address public pixNFT;
    uint256 public lastUpdateBlock;
    uint256 public rewardPerBlock;
    uint256 public totalTiers;
    uint256 public period;

    function initialize(
        address _pixt,
        address _pixNFT,
        uint256 _rewardPerBlock,
        uint256 _period
    ) external initializer {
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixNFT != address(0), "Staking: INVALID_PIX");

        rewardToken = IERC20Upgradeable(_pixt);
        pixNFT = _pixNFT;
        rewardPerBlock = _rewardPerBlock;
        period = _period;
        __Ownable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
    }

    function stake(uint256 _tokenId) external {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(tierInfo[_tokenId] > 0, "Staking: INVALID_TIER");
        require(IPIX(pixNFT).isTerritory(_tokenId), "Staking: TERRITORY_ONLY");

        UserInfo storage user = userInfo[msg.sender];

        uint256 tiers = tierInfo[_tokenId];

        IERC721Upgradeable(pixNFT).safeTransferFrom(msg.sender, address(this), _tokenId);
        totalTiers = totalTiers.add(tiers);

        // Update User Info
        user.tiers = user.tiers.add(tiers);
        user.isStaked[_tokenId] = true;

        if (lastUpdateBlock == 0) {
            lastUpdateBlock = block.number;
        }

        emit StakedPixNFT(_tokenId, address(this));
    }

    function withdraw(uint256 _tokenId) external nonReentrant {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "Staking: NO_WITHDRAWALS");
        require(user.isStaked[_tokenId], "Staking: NO_STAKES");

        IERC721Upgradeable(pixNFT).safeTransferFrom(address(this), msg.sender, _tokenId);
        totalTiers = totalTiers.sub(tierInfo[_tokenId]);
        // Update UserInfo
        user.tiers = user.tiers.sub(tierInfo[_tokenId]);
        user.isStaked[_tokenId] = false;

        emit WithdrawnPixNFT(_tokenId, msg.sender);
    }

    function claim() external {
        require(earned[msg.sender] > 0, "Claiming: NO_Tokens to withdraw");

        rewardToken.safeTransfer(msg.sender, earned[msg.sender]);
        earned[msg.sender] = 0;
        emit RewardPaid(earned[msg.sender], msg.sender);
    }

    function setReward(address _winner) external onlyOwner {
        require(block.timestamp - lastUpdateBlock >= period, "SetWinner: Already set winner");

        UserInfo storage user = userInfo[_winner];
        require(user.tiers > 0, "SetReward: INV_WINNER");

        uint256 pending = _calculateReward();
        require(pending > 0, "setReward: no tokens to set");
        earned[_winner] += pending;
        lastUpdateBlock = block.timestamp;
    }

    function setRewardPerBlock(uint256 _amount) external onlyOwner {
        rewardPerBlock = _amount;
    }

    function setTierInfo(uint256 _tokenId, uint256 _tiers) external onlyOwner {
        require(_tiers > 0, "Staking: INVALID_TIERS");

        tierInfo[_tokenId] = _tiers;
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.number.sub(lastUpdateBlock);
        return rewardPerBlock.mul(blocksPassed);
    }
}
